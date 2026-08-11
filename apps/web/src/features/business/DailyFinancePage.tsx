import { CheckOutlined, CloseCircleOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
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
import { BusinessEntryCorrectionModal } from './BusinessEntryCorrectionModal';
import { BusinessCategoriesModal } from './BusinessCategoriesModal';
import {
  approveDailyClose,
  getBusinessResources,
  getDailyClose,
  listBusinessEntries,
  prepareDailyClose,
  returnDailyClose,
  resolveBusinessEntry,
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
  const canManageCategories = hasPermission(auth?.employee, 'business.manage');
  const [businessDate, setBusinessDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [officeId, setOfficeId] = useState<string>();
  const [entryType, setEntryType] = useState<BusinessCategoryType | null>(null);
  const [editingEntry, setEditingEntry] = useState<BusinessEntry | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
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
    message.info('Фактическое чистое движение заполнено по расчёту CRM. Проверьте строки и сохраните.');
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
        await refresh();
        message.success('Операция отменена; запись сохранена в журнале');
      },
    });
  }

  function askResolve(entry: BusinessEntry) {
    let reason = '';
    modal.confirm({
      title: 'Утвердить операцию?',
      content: <><Typography.Paragraph>{entry.category.title} · {formatMoney(entry.amount)}</Typography.Paragraph><Input.TextArea rows={3} placeholder="Комментарий директора" onChange={(event) => { reason = event.target.value; }} /></>,
      okText: 'Утвердить', cancelText: 'Отмена',
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('Укажите комментарий к утверждению'); return Promise.reject(); }
        await resolveBusinessEntry(entry.id, reason);
        await refresh();
        message.success('Операция утверждена директором');
      },
    });
  }

  const actualTotal = close?.lines.reduce((total, line) => total + (actualAmounts[line.lineKey] ?? 0), 0) ?? 0;
  const expectedTotal = Number(close?.expectedAmount ?? 0);
  const currentDifference = actualTotal - expectedTotal;
  const lineColumns = useMemo<ColumnsType<BusinessDailyCloseLine>>(() => [
    { title: 'Способ оплаты и касса', key: 'titleSnapshot', width: 230, render: (_, line) => formatDailyLineTitle(line) },
    { title: 'Расчёт CRM', key: 'systemAmount', width: 235, align: 'right', render: (_, line) => {
      const systemAmount = Number(line.systemAmount);
      const inflow = Number(line.inflowAmount ?? (systemAmount >= 0 ? systemAmount : 0));
      const outflow = Number(line.outflowAmount ?? (systemAmount < 0 ? Math.abs(systemAmount) : 0));
      return (
        <div>
          <Typography.Text strong type={systemAmount < 0 ? 'danger' : undefined}>{formatSignedMoney(systemAmount)}</Typography.Text>
          <Typography.Text type="secondary" style={{ display: 'block' }}>
            Поступило {formatMoney(inflow)} · выбыло {formatMoney(outflow)}
          </Typography.Text>
        </div>
      );
    } },
    { title: 'Фактическое чистое движение', key: 'actualAmount', width: 210, render: (_, line) => editable ? <InputNumber value={actualAmounts[line.lineKey] ?? 0} precision={2} addonAfter="₽" onChange={(value) => setActualAmounts((current) => ({ ...current, [line.lineKey]: Number(value ?? 0) }))} /> : formatSignedMoney(Number(line.actualAmount)) },
    { title: 'Отклонение', key: 'difference', align: 'right', width: 140, render: (_, line) => {
      const value = (actualAmounts[line.lineKey] ?? Number(line.actualAmount)) - Number(line.systemAmount);
      return <Typography.Text type={value === 0 ? 'secondary' : 'danger'}>{formatMoney(value)}</Typography.Text>;
    } },
    { title: 'Пояснение', key: 'comment', width: 260, render: (_, line) => editable ? <Input value={lineComments[line.lineKey] ?? ''} placeholder="Если есть расхождение" onChange={(event) => setLineComments((current) => ({ ...current, [line.lineKey]: event.target.value }))} /> : line.comment || '—' },
  ], [actualAmounts, editable, lineComments]);

  const entryColumns = useMemo<ColumnsType<BusinessEntry>>(() => [
    { title: 'Время', dataIndex: 'occurredAt', key: 'occurredAt', render: formatDateTime },
    { title: 'Операция', key: 'operation', render: (_, entry) => <><div>{entry.comment || entry.category.title}</div><Typography.Text type="secondary" style={{ display: 'block' }}>Статья: {entry.category.title}</Typography.Text>{entry.counterparty ? <Typography.Text type="secondary" style={{ display: 'block' }}>Получатель / источник: {entry.counterparty}</Typography.Text> : null}{entry.documentNumber ? <Typography.Text type="secondary" style={{ display: 'block' }}>Документ: {entry.documentNumber}</Typography.Text> : null}{entry.correctionOfId ? <Tag color="blue">Исправление</Tag> : null}{entry.voidReason ? <Typography.Text type="secondary" style={{ display: 'block' }}>Причина отмены: {entry.voidReason}</Typography.Text> : null}</> },
    { title: 'Сумма', dataIndex: 'amount', key: 'amount', align: 'right', render: (value, entry) => <Typography.Text type={entry.type === 'INCOME' ? 'success' : undefined}>{entry.type === 'INCOME' ? '+' : '−'}{formatMoney(value)}</Typography.Text> },
    { title: 'Касса', key: 'cashbox', render: (_, entry) => [entry.paymentMethod?.title, entry.cashbox?.title].filter(Boolean).join(' · ') || <Tag color="orange">Касса/способ не указаны</Tag> },
    { title: 'Статус', key: 'status', render: (_, entry) => entry.status === 'VOIDED' ? <Tag>Отменена</Tag> : entry.requiresResolution ? <Tag color="orange">Учтена · ждёт утверждения</Tag> : <Tag color="green">Учтена</Tag> },
    ...((editable || canApprove) ? [{ title: 'Действия', key: 'action', width: 290, render: (_: unknown, entry: BusinessEntry) => entry.status === 'ACTIVE' ? <Space wrap>{entry.requiresResolution && canApprove ? <Button size="small" icon={<CheckOutlined />} onClick={() => askResolve(entry)}>Утвердить</Button> : null}<Button size="small" icon={<EditOutlined />} onClick={() => setEditingEntry(entry)}>Исправить</Button><Button danger size="small" icon={<CloseCircleOutlined />} onClick={() => askVoid(entry)}>Отменить</Button></Space> : null }] : []),
  ], [canApprove, editable]);

  return (
    <div className="page">
      <PageHeader title="Закрытие дня" description="Администратор сверяет деньги по кассам и фиксирует дополнительные поступления и выплаты по обязательным статьям. Итог подтверждает директор." extra={<Space wrap><DatePicker value={dayjs(businessDate)} format="DD.MM.YYYY" onChange={(value) => value && setBusinessDate(value.format('YYYY-MM-DD'))} /><Select value={officeId} loading={resourcesQuery.isLoading} placeholder="Филиал" style={{ minWidth: 220 }} onChange={setOfficeId} options={resourcesQuery.data?.offices.map((item) => ({ value: item.id, label: item.name }))} /></Space>} />
      {closeQuery.error ? <Alert type="error" showIcon message="Не удалось открыть закрытие дня" description={getErrorMessage(closeQuery.error)} /> : null}
      {!close && !closeQuery.isLoading ? <Card><Typography.Title level={4}>Сверка ещё не сформирована</Typography.Title><Typography.Paragraph type="secondary">CRM соберёт оплаты, возвраты, расходы поставщикам и внесённые вручную операции за выбранный день.</Typography.Paragraph>{canManage ? <Button type="primary" icon={<ReloadOutlined />} loading={saveMutation.isPending} disabled={!officeId} onClick={() => saveMutation.mutate()}>Сформировать сверку</Button> : null}</Card> : null}
      {close ? <>
        <div className="report-metrics-grid">
          <Card><Statistic title="Всего поступило" value={Number(close.systemIncome) + Number(close.manualIncome)} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Всего выбыло" value={Number(close.systemRefunds) + Number(close.systemExpense) + Number(close.manualExpense)} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Чистое движение CRM" value={expectedTotal} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Фактическое движение" value={actualTotal} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Отклонение" value={currentDifference} precision={2} suffix="₽" valueStyle={{ color: currentDifference === 0 ? '#237804' : '#cf1322' }} /></Card>
        </div>
        <div className="list-panel">
          <div className="list-panel-header"><div><Typography.Title level={4}>Сверка касс</Typography.Title><Space wrap><Tag color={statusMeta[close.status].color}>{statusMeta[close.status].label}</Tag>{close.submittedBy ? <Typography.Text type="secondary">Отправил: {close.submittedBy.fullName}</Typography.Text> : null}{close.approvedBy ? <Typography.Text type="secondary">Утвердил: {close.approvedBy.fullName}</Typography.Text> : null}</Space></div><Space wrap>{editable ? <><Button onClick={acceptSystemAmounts}>Заполнить фактическое по CRM</Button><Button icon={<SaveOutlined />} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Сохранить</Button></> : null}{close.status === 'DRAFT' && canSubmit ? <Button type="primary" icon={<SendOutlined />} loading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>Отправить директору</Button> : null}{close.status === 'SUBMITTED' && canApprove ? <><Button onClick={askReturn}>Вернуть</Button><Button type="primary" icon={<CheckOutlined />} loading={approveMutation.isPending} onClick={() => modal.confirm({ title: 'Утвердить закрытие дня?', content: currentDifference === 0 ? 'Сверка с CRM совпадает.' : `Отклонение: ${formatMoney(currentDifference)}. Пояснение останется в журнале.`, okText: 'Утвердить', cancelText: 'Отмена', onOk: () => approveMutation.mutateAsync(close.id) })}>Утвердить</Button></> : null}</Space></div>
          <Alert
            type="info"
            showIcon
            message="CRM показывает чистое движение денег"
            description="В каждой строке отдельно указано, сколько поступило и сколько выбыло. Чистое движение = поступления минус расходы. Отрицательное значение означает расход из этой кассы, а не долг и не ошибку."
            className="form-alert"
          />
          <Table rowKey="id" columns={lineColumns} dataSource={close.lines} loading={closeQuery.isLoading} pagination={false} scroll={{ x: 980 }} locale={{ emptyText: 'За день нет движений по кассам' }} />
          <div className="list-panel-body"><Typography.Text strong>Комментарий к закрытию</Typography.Text><Input.TextArea value={comment} disabled={!editable} rows={2} placeholder="Обязателен, если есть расхождение" onChange={(event) => setComment(event.target.value)} /></div>
        </div>
      </> : null}
      <div className="list-panel">
        <div className="list-panel-header"><div><Typography.Title level={4}>Дополнительные операции</Typography.Title><Typography.Text type="secondary">Непробитая выручка, фактически выданная зарплата и другие движения, которых нет в счетах CRM. Статья обязательна, комментарий только уточняет назначение.</Typography.Text></div><Space wrap>{canManageCategories ? <Button icon={<SettingOutlined />} onClick={() => setCategoriesOpen(true)}>Статьи доходов и расходов</Button> : null}{editable && close ? <><Button icon={<PlusOutlined />} onClick={() => setEntryType('INCOME')}>Добавить поступление</Button><Button icon={<PlusOutlined />} onClick={() => setEntryType('EXPENSE')}>Добавить расход</Button></> : null}</Space></div>
        <Alert
          type="info"
          showIcon
          message="Что означает «ждёт утверждения»"
          description="Операция уже входит в сверку денег, но требует контроля директора. При утверждении закрытия дня она подтверждается автоматически. Зарплата, внесённая здесь, является самостоятельной фактической выплатой и не зависит от заполнения отдельного расчёта зарплаты."
          className="form-alert"
        />
        <Table rowKey="id" columns={entryColumns} dataSource={entriesQuery.data ?? []} loading={entriesQuery.isLoading} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: 'Дополнительных операций нет' }} />
      </div>
      <Alert type="info" showIcon message="Управленческий учёт" description="Закрытие дня помогает контролировать выручку и расходы клиники, но не заменяет бухгалтерскую или налоговую отчётность." />
      <BusinessEntryModal type={entryType} resources={resourcesQuery.data} officeId={officeId} dailyCloseId={close?.id} defaultDate={`${businessDate}T12:00:00`} lockOffice onClose={() => setEntryType(null)} onSaved={async () => { if (close) await prepareDailyClose(payload(close.lines)); await refresh(); }} />
      <BusinessEntryCorrectionModal entry={editingEntry} resources={resourcesQuery.data} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      <BusinessCategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ['business', 'resources'] }); await refresh(); }} />
    </div>
  );
}

function formatDailyLineTitle(line: BusinessDailyCloseLine) {
  const methodTitle = line.paymentMethod?.title ?? paymentTypeLabel(line.paymentType);
  return `${methodTitle} · ${line.cashbox?.title ?? 'касса не указана'}`;
}

function paymentTypeLabel(type: string) {
  return ({
    CASH: 'Наличные',
    CARD: 'Банковская карта',
    BANK_TRANSFER: 'Перевод на счёт',
    DEPOSIT: 'Депозит владельца',
    OTHER: 'Способ не указан',
  } as Record<string, string>)[type] ?? 'Способ не указан';
}

function formatSignedMoney(value: number) {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`;
}
