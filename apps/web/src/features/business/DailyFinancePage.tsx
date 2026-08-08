import { CheckOutlined, CloseCircleOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Input, InputNumber, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { BusinessEntryModal } from './BusinessEntryModal';
import {
  approveDailyClose,
  getBusinessResources,
  getDailyClose,
  listBusinessEntries,
  prepareDailyClose,
  returnDailyClose,
  submitDailyClose,
  voidBusinessEntry,
} from './business.api';
import { BusinessDailyClose, BusinessDailyCloseLine, BusinessEntry, BusinessCategoryType } from './types';

const statusMeta = {
  DRAFT: { color: 'blue', label: 'Черновик' },
  SUBMITTED: { color: 'gold', label: 'На проверке у директора' },
  APPROVED: { color: 'green', label: 'Утверждён' },
} as const;

export function DailyFinancePage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'daily_finance.manage') || hasPermission(auth?.employee, 'business.manage');
  const canSubmit = hasPermission(auth?.employee, 'daily_finance.submit') || hasPermission(auth?.employee, 'business.approve');
  const canApprove = hasPermission(auth?.employee, 'business.approve');
  const [businessDate, setBusinessDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [officeId, setOfficeId] = useState<string>();
  const [entryType, setEntryType] = useState<BusinessCategoryType | null>(null);
  const [actualAmounts, setActualAmounts] = useState<Record<string, number>>({});
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');

  const resourcesQuery = useQuery({ queryKey: ['business', 'resources'], queryFn: getBusinessResources });
  useEffect(() => {
    if (!officeId && resourcesQuery.data?.offices.length) setOfficeId(resourcesQuery.data.offices[0].id);
  }, [officeId, resourcesQuery.data]);

  const closeQuery = useQuery({
    queryKey: ['business', 'daily-close', officeId, businessDate],
    queryFn: () => getDailyClose(officeId!, businessDate),
    enabled: Boolean(officeId),
  });
  const entriesQuery = useQuery({
    queryKey: ['business', 'entries', officeId, businessDate],
    queryFn: () => listBusinessEntries({ from: businessDate, to: businessDate, officeId }),
    enabled: Boolean(officeId),
  });
  const close = closeQuery.data;
  const editable = canManage && (!close || close.status === 'DRAFT');

  useEffect(() => {
    if (!close) {
      setActualAmounts({}); setLineComments({}); setComment('');
      return;
    }
    setActualAmounts(Object.fromEntries(close.lines.map((line) => [line.lineKey, Number(line.actualAmount)])));
    setLineComments(Object.fromEntries(close.lines.map((line) => [line.lineKey, line.comment ?? ''])));
    setComment(close.comment ?? '');
  }, [close]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['business', 'daily-close'] }),
      queryClient.invalidateQueries({ queryKey: ['business', 'entries'] }),
      queryClient.invalidateQueries({ queryKey: ['business', 'summary'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
    ]);
  }

  function payload(lines?: BusinessDailyCloseLine[]) {
    return {
      officeId: officeId!, businessDate, comment,
      lines: lines?.map((line) => ({ lineKey: line.lineKey, actualAmount: actualAmounts[line.lineKey] ?? 0, comment: lineComments[line.lineKey] || undefined })),
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => prepareDailyClose(payload(close?.lines)),
    onSuccess: async () => { await refresh(); message.success(close ? 'Сверка сохранена' : 'Сверка дня сформирована'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const submitMutation = useMutation({
    mutationFn: async () => {
      const saved = await prepareDailyClose(payload(close?.lines));
      return submitDailyClose(saved.id);
    },
    onSuccess: async () => { await refresh(); message.success('Закрытие дня отправлено директору'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const approveMutation = useMutation({
    mutationFn: (closeId: string) => approveDailyClose(closeId),
    onSuccess: async () => { await refresh(); message.success('Закрытие дня утверждено'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  function acceptSystemAmounts() {
    if (!close) return;
    setActualAmounts(Object.fromEntries(close.lines.map((line) => [line.lineKey, Number(line.systemAmount)])));
    message.info('Фактические суммы заполнены по данным CRM. Проверьте их и сохраните.');
  }

  function askReturn() {
    if (!close) return;
    let reason = '';
    modal.confirm({
      title: 'Вернуть администратору?',
      content: <Input.TextArea autoFocus rows={3} placeholder="Причина возврата" onChange={(event) => { reason = event.target.value; }} />,
      okText: 'Вернуть в черновик', cancelText: 'Отмена',
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('Укажите причину возврата'); return Promise.reject(); }
        await returnDailyClose(close.id, reason);
        await refresh();
        message.success('День возвращён на исправление');
      },
    });
  }

  function askVoid(entry: BusinessEntry) {
    let reason = '';
    modal.confirm({
      title: 'Отменить операцию?',
      content: <><Typography.Paragraph>{entry.category.title} · {formatMoney(entry.amount)}</Typography.Paragraph><Input.TextArea rows={3} placeholder="Причина отмены" onChange={(event) => { reason = event.target.value; }} /></>,
      okText: 'Отменить операцию', okButtonProps: { danger: true }, cancelText: 'Назад',
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('Укажите причину отмены'); return Promise.reject(); }
        await voidBusinessEntry(entry.id, reason);
        if (close) await prepareDailyClose(payload(close.lines));
        await refresh();
        message.success('Операция отменена; запись сохранена в журнале');
      },
    });
  }

  const actualTotal = close?.lines.reduce((total, line) => total + (actualAmounts[line.lineKey] ?? 0), 0) ?? 0;
  const expectedTotal = Number(close?.expectedAmount ?? 0);
  const currentDifference = actualTotal - expectedTotal;
  const lineColumns = useMemo<ColumnsType<BusinessDailyCloseLine>>(() => [
    { title: 'Касса и способ оплаты', dataIndex: 'titleSnapshot', key: 'titleSnapshot' },
    { title: 'По данным CRM', dataIndex: 'systemAmount', key: 'systemAmount', align: 'right', render: formatMoney },
    { title: 'Фактически', key: 'actualAmount', width: 180, render: (_, line) => editable ? <InputNumber value={actualAmounts[line.lineKey] ?? 0} precision={2} addonAfter="₽" onChange={(value) => setActualAmounts((current) => ({ ...current, [line.lineKey]: Number(value ?? 0) }))} /> : formatMoney(line.actualAmount) },
    { title: 'Разница', key: 'difference', align: 'right', render: (_, line) => {
      const value = (actualAmounts[line.lineKey] ?? Number(line.actualAmount)) - Number(line.systemAmount);
      return <Typography.Text type={value === 0 ? 'secondary' : 'danger'}>{formatMoney(value)}</Typography.Text>;
    } },
    { title: 'Пояснение', key: 'comment', width: 260, render: (_, line) => editable ? <Input value={lineComments[line.lineKey] ?? ''} placeholder="Если есть расхождение" onChange={(event) => setLineComments((current) => ({ ...current, [line.lineKey]: event.target.value }))} /> : line.comment || '—' },
  ], [actualAmounts, editable, lineComments]);

  const entryColumns = useMemo<ColumnsType<BusinessEntry>>(() => [
    { title: 'Время', dataIndex: 'occurredAt', key: 'occurredAt', render: formatDateTime },
    { title: 'Операция', key: 'operation', render: (_, entry) => <><div>{entry.comment || entry.category.title}</div><Typography.Text type="secondary">{entry.comment ? entry.category.title : entry.counterparty || 'Без пояснения'}</Typography.Text></> },
    { title: 'Сумма', dataIndex: 'amount', key: 'amount', align: 'right', render: (value, entry) => <Typography.Text type={entry.type === 'INCOME' ? 'success' : undefined}>{entry.type === 'INCOME' ? '+' : '−'}{formatMoney(value)}</Typography.Text> },
    { title: 'Касса', key: 'cashbox', render: (_, entry) => [entry.paymentMethod?.title, entry.cashbox?.title].filter(Boolean).join(' · ') || 'Не указана' },
    { title: 'Статус', key: 'status', render: (_, entry) => entry.status === 'VOIDED' ? <Tag>Отменена</Tag> : entry.requiresResolution ? <Tag color="orange">Требует проверки</Tag> : <Tag color="green">Учтена</Tag> },
    ...(editable ? [{ title: '', key: 'action', width: 120, render: (_: unknown, entry: BusinessEntry) => entry.status === 'ACTIVE' ? <Button danger size="small" icon={<CloseCircleOutlined />} onClick={() => askVoid(entry)}>Отменить</Button> : null }] : []),
  ], [editable]);

  return (
    <div className="page">
      <PageHeader title="Закрытие дня" description="Администратор сверяет деньги по кассам, фиксирует непробитую выручку и небольшие расходы. Итог подтверждает директор." extra={<Space wrap><DatePicker value={dayjs(businessDate)} format="DD.MM.YYYY" onChange={(value) => value && setBusinessDate(value.format('YYYY-MM-DD'))} /><Select value={officeId} loading={resourcesQuery.isLoading} placeholder="Филиал" style={{ minWidth: 220 }} onChange={setOfficeId} options={resourcesQuery.data?.offices.map((item) => ({ value: item.id, label: item.name }))} /></Space>} />
      {closeQuery.error ? <Alert type="error" showIcon message="Не удалось открыть закрытие дня" description={getErrorMessage(closeQuery.error)} /> : null}
      {!close && !closeQuery.isLoading ? <Card><Typography.Title level={4}>Сверка ещё не сформирована</Typography.Title><Typography.Paragraph type="secondary">CRM соберёт оплаты, возвраты, расходы поставщикам и внесённые вручную операции за выбранный день.</Typography.Paragraph>{canManage ? <Button type="primary" icon={<ReloadOutlined />} loading={saveMutation.isPending} disabled={!officeId} onClick={() => saveMutation.mutate()}>Сформировать сверку</Button> : null}</Card> : null}
      {close ? <>
        <div className="report-metrics-grid">
          <Card><Statistic title="Поступления по CRM" value={Number(close.systemIncome) + Number(close.manualIncome)} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Возвраты и расходы" value={Number(close.systemRefunds) + Number(close.systemExpense) + Number(close.manualExpense)} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Ожидается в кассах" value={expectedTotal} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Фактически" value={actualTotal} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Расхождение" value={currentDifference} precision={2} suffix="₽" valueStyle={{ color: currentDifference === 0 ? '#237804' : '#cf1322' }} /></Card>
        </div>
        <div className="list-panel">
          <div className="list-panel-header"><div><Typography.Title level={4}>Сверка касс</Typography.Title><Space wrap><Tag color={statusMeta[close.status].color}>{statusMeta[close.status].label}</Tag>{close.submittedBy ? <Typography.Text type="secondary">Отправил: {close.submittedBy.fullName}</Typography.Text> : null}{close.approvedBy ? <Typography.Text type="secondary">Утвердил: {close.approvedBy.fullName}</Typography.Text> : null}</Space></div><Space wrap>{editable ? <><Button onClick={acceptSystemAmounts}>Принять суммы CRM</Button><Button icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Сохранить</Button></> : null}{close.status === 'DRAFT' && canSubmit ? <Button type="primary" icon={<SendOutlined />} loading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>Отправить директору</Button> : null}{close.status === 'SUBMITTED' && canApprove ? <><Button onClick={askReturn}>Вернуть</Button><Button type="primary" icon={<CheckOutlined />} loading={approveMutation.isPending} onClick={() => modal.confirm({ title: 'Утвердить закрытие дня?', content: currentDifference === 0 ? 'Сверка с CRM совпадает.' : `Расхождение: ${formatMoney(currentDifference)}. Пояснение останется в журнале.`, okText: 'Утвердить', cancelText: 'Отмена', onOk: () => approveMutation.mutateAsync(close.id) })}>Утвердить</Button></> : null}</Space></div>
          <Table rowKey="id" columns={lineColumns} dataSource={close.lines} loading={closeQuery.isLoading} pagination={false} scroll={{ x: 980 }} locale={{ emptyText: 'За день нет движений по кассам' }} />
          <div className="list-panel-body"><Typography.Text strong>Комментарий к закрытию</Typography.Text><Input.TextArea value={comment} disabled={!editable} rows={2} placeholder="Обязателен, если есть расхождение" onChange={(event) => setComment(event.target.value)} /></div>
        </div>
      </> : null}
      <div className="list-panel">
        <div className="list-panel-header"><div><Typography.Title level={4}>Дополнительные операции</Typography.Title><Typography.Text type="secondary">Непробитая выручка, мелкие расходы и другие движения, которых нет в счетах CRM.</Typography.Text></div>{editable && close ? <Space wrap><Button icon={<PlusOutlined />} onClick={() => setEntryType('INCOME')}>Добавить поступление</Button><Button icon={<PlusOutlined />} onClick={() => setEntryType('EXPENSE')}>Добавить расход</Button></Space> : null}</div>
        <Table rowKey="id" columns={entryColumns} dataSource={entriesQuery.data ?? []} loading={entriesQuery.isLoading} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: 'Дополнительных операций нет' }} />
      </div>
      <Alert type="info" showIcon message="Управленческий учёт" description="Закрытие дня помогает контролировать выручку и расходы клиники, но не заменяет бухгалтерскую или налоговую отчётность." />
      <BusinessEntryModal type={entryType} resources={resourcesQuery.data} officeId={officeId} dailyCloseId={close?.id} defaultDate={`${businessDate}T12:00:00`} lockOffice onClose={() => setEntryType(null)} onSaved={async () => { if (close) await prepareDailyClose(payload(close.lines)); await refresh(); }} />
    </div>
  );
}
