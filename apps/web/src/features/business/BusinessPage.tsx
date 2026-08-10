import { CheckOutlined, DownloadOutlined, PlusOutlined, PrinterOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Descriptions, Input, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProgressiveTable } from '../../shared/ui/InfiniteTable';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { BusinessEntryModal } from './BusinessEntryModal';
import { getBusinessResources, getBusinessSummary, listBusinessEntries, resolveBusinessEntry, voidBusinessEntry } from './business.api';
import { BusinessDailyClose, BusinessEntry, BusinessCategoryType, BusinessSummary } from './types';

const { RangePicker } = DatePicker;

export function BusinessPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'business.manage');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [officeId, setOfficeId] = useState<string>();
  const [entryType, setEntryType] = useState<BusinessCategoryType | null>(null);
  const [activeTab, setActiveTab] = useState('profit');
  const query = { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD'), officeId };
  const resourcesQuery = useQuery({ queryKey: ['business', 'resources'], queryFn: getBusinessResources });
  const summaryQuery = useQuery({ queryKey: ['business', 'summary', query], queryFn: () => getBusinessSummary(query) });
  const entriesQuery = useQuery({ queryKey: ['business', 'entries', query], queryFn: () => listBusinessEntries(query) });
  const summary = summaryQuery.data;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['business', 'summary'] }),
      queryClient.invalidateQueries({ queryKey: ['business', 'entries'] }),
      queryClient.invalidateQueries({ queryKey: ['business', 'daily-close'] }),
    ]);
  }

  function askResolve(entry: BusinessEntry) {
    let reason = '';
    modal.confirm({
      title: 'Подтвердить разбор операции?',
      content: <><Typography.Paragraph>{entry.category.title} · {formatMoney(entry.amount)}</Typography.Paragraph><Input.TextArea rows={3} placeholder="Например: счёт создан и оплата связана" onChange={(event) => { reason = event.target.value; }} /></>,
      okText: 'Отметить проверенной', cancelText: 'Отмена',
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('Укажите результат проверки'); return Promise.reject(); }
        await resolveBusinessEntry(entry.id, reason); await refresh(); message.success('Операция отмечена проверенной');
      },
    });
  }

  function askVoid(entry: BusinessEntry) {
    let reason = '';
    modal.confirm({
      title: 'Отменить операцию?',
      content: <Input.TextArea rows={3} placeholder="Причина отмены" onChange={(event) => { reason = event.target.value; }} />,
      okText: 'Отменить операцию', okButtonProps: { danger: true }, cancelText: 'Назад',
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('Укажите причину отмены'); return Promise.reject(); }
        await voidBusinessEntry(entry.id, reason); await refresh(); message.success('Операция отменена; запись сохранена в журнале');
      },
    });
  }

  const operationColumns = useMemo<ColumnsType<BusinessEntry>>(() => [
    { title: 'Дата', dataIndex: 'occurredAt', key: 'occurredAt', render: formatDateTime },
    { title: 'Статья', key: 'category', render: (_, row) => <><div>{row.category.title}</div><Typography.Text type="secondary">{row.office?.name ?? 'Вся организация'}</Typography.Text></> },
    { title: 'Комментарий', key: 'comment', render: (_, row) => row.comment || row.counterparty || '—' },
    { title: 'Сумма', dataIndex: 'amount', key: 'amount', align: 'right', render: (value, row) => <Typography.Text type={row.type === 'INCOME' ? 'success' : undefined}>{row.type === 'INCOME' ? '+' : '−'}{formatMoney(value)}</Typography.Text> },
    { title: 'Статус', key: 'status', render: (_, row) => row.status === 'VOIDED' ? <Tag>Отменена</Tag> : row.requiresResolution ? <Tag color="orange">Нужно проверить</Tag> : <Tag color="green">Учтена</Tag> },
    ...(canManage ? [{ title: '', key: 'action', width: 230, render: (_: unknown, row: BusinessEntry) => row.status === 'ACTIVE' ? <Space>{row.requiresResolution ? <Button size="small" icon={<CheckOutlined />} onClick={() => askResolve(row)}>Проверено</Button> : null}<Button size="small" danger icon={<StopOutlined />} onClick={() => askVoid(row)}>Отменить</Button></Space> : null }] : []),
  ], [canManage]);

  return (
    <div className="page business-page">
      <PageHeader title="Бизнес" description="Закрытая управленческая отчётность директора: прибыль, движение денег, расходы, долги и контроль закрытия дней." extra={<Space wrap><RangePicker value={range} format="DD.MM.YYYY" allowClear={false} onChange={(value) => value?.[0] && value[1] && setRange([value[0], value[1]])} /><Select allowClear value={officeId} placeholder="Все филиалы" style={{ minWidth: 210 }} onChange={setOfficeId} options={resourcesQuery.data?.offices.map((item) => ({ value: item.id, label: item.name }))} /><Button icon={<PrinterOutlined />} onClick={() => window.print()}>Печать</Button>{summary ? <Button icon={<DownloadOutlined />} onClick={() => exportSummary(summary)}>Выгрузить CSV</Button> : null}</Space>} />
      {summaryQuery.error ? <Alert type="error" showIcon message="Не удалось сформировать бизнес-отчёт" description={getErrorMessage(summaryQuery.error)} /> : null}
      {summary ? <>
        <div className="report-metrics-grid">
          <MetricCard title="Выручка начислена" value={summary.current.accruedRevenue} previous={summary.previous.accruedRevenue} />
          <MetricCard title="Операционная прибыль" value={summary.current.operatingProfit} previous={summary.previous.operatingProfit} />
          <Card><Statistic title="Маржа" value={summary.current.marginPercent} precision={1} suffix="%" valueStyle={{ color: summary.current.marginPercent >= 0 ? '#237804' : '#cf1322' }} /></Card>
          <MetricCard title="Денежный поток" value={summary.current.cashNet} previous={summary.previous.cashNet} />
          <Card><Statistic title="Долги клиентов" value={summary.balances.debtorsAmount} precision={2} suffix="₽" /></Card>
          <Card><Statistic title="Долг поставщикам" value={summary.balances.supplierPayable} precision={2} suffix="₽" /></Card>
        </div>
        {summary.control.unresolvedEntries || summary.control.submittedDays ? <Alert type="warning" showIcon message="Есть операции, требующие внимания" description={`Непроверенная выручка: ${summary.control.unresolvedEntries}. Закрытий дня на проверке: ${summary.control.submittedDays}. Неучтённая выручка автоматически подтверждается директором вместе с закрытием дня.`} action={summary.control.unresolvedEntries ? <Button size="small" onClick={() => setActiveTab('operations')}>Открыть операции</Button> : undefined} /> : null}
        <div className="list-panel">
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            { key: 'profit', label: 'Прибыль', children: <ProfitTab summary={summary} /> },
            { key: 'cash', label: 'Деньги', children: <CashTab summary={summary} /> },
            { key: 'daily', label: 'По дням', children: <DailyTab summary={summary} /> },
            { key: 'categories', label: 'Статьи', children: <CategoriesTab summary={summary} /> },
            { key: 'operations', label: `Операции · ${entriesQuery.data?.length ?? 0}`, children: <><div className="list-panel-header"><Typography.Text type="secondary">Внесённые вручную доходы и расходы. Неучтённая выручка подтверждается автоматически при утверждении закрытия дня; до этого директор может проверить её здесь кнопкой «Проверено». Ошибочную операцию можно только отменить с указанием причины.</Typography.Text>{canManage ? <Space><Button icon={<PlusOutlined />} onClick={() => setEntryType('INCOME')}>Доход</Button><Button icon={<PlusOutlined />} onClick={() => setEntryType('EXPENSE')}>Расход</Button></Space> : null}</div><ProgressiveTable rowKey="id" columns={operationColumns} dataSource={entriesQuery.data ?? []} loading={entriesQuery.isLoading} scroll={{ x: 960 }} locale={{ emptyText: 'Ручных операций за период нет' }} /></> },
            { key: 'control', label: 'Контроль', children: <ControlTab summary={summary} /> },
          ]} />
        </div>
        <Alert type="info" showIcon message="Это управленческая отчётность" description={summary.current.note} />
      </> : null}
      <BusinessEntryModal type={entryType} resources={resourcesQuery.data} officeId={officeId ?? resourcesQuery.data?.offices[0]?.id} defaultDate={dayjs().toISOString()} onClose={() => setEntryType(null)} onSaved={refresh} />
    </div>
  );
}

function MetricCard({ title, value, previous }: { title: string; value: number; previous: number }) {
  const change = previous === 0 ? null : (value - previous) / Math.abs(previous) * 100;
  return <Card><Statistic title={title} value={value} precision={2} suffix="₽" valueStyle={{ color: value >= 0 ? undefined : '#cf1322' }} />{change === null ? <Typography.Text type="secondary">Нет данных для сравнения</Typography.Text> : <Typography.Text type={change >= 0 ? 'success' : 'danger'}>{change >= 0 ? '+' : ''}{change.toFixed(1)}% к предыдущему периоду</Typography.Text>}</Card>;
}

function ProfitTab({ summary }: { summary: BusinessSummary }) {
  const current = summary.current;
  return <div className="report-section-grid"><Card title="Отчёт о прибыли"><Descriptions column={1} size="small" bordered items={[
    { key: 'revenue', label: 'Выручка', children: formatMoney(current.accruedRevenue) },
    { key: 'cogs', label: 'Себестоимость использованных товаров', children: `− ${formatMoney(current.costOfGoods)}` },
    { key: 'gross', label: 'Валовая прибыль', children: <strong>{formatMoney(current.grossProfit)}</strong> },
    { key: 'payroll', label: 'Начисленная зарплата', children: `− ${formatMoney(current.payrollExpense)}` },
    { key: 'opex', label: 'Операционные расходы', children: `− ${formatMoney(current.operatingExpenses)}` },
    { key: 'profit', label: 'Операционная прибыль', children: <Typography.Text strong type={current.operatingProfit >= 0 ? 'success' : 'danger'}>{formatMoney(current.operatingProfit)}</Typography.Text> },
  ]} /></Card><Card title="Показатели"><Descriptions column={1} size="small" bordered items={[
    { key: 'bills', label: 'Счетов', children: current.billsCount },
    { key: 'average', label: 'Средний счёт', children: formatMoney(current.averageBill) },
    { key: 'visits', label: 'Приёмов', children: current.visits },
    { key: 'owners', label: 'Уникальных владельцев', children: current.uniqueOwners },
    { key: 'new', label: 'Новых владельцев', children: current.newOwners },
  ]} /></Card></div>;
}

function CashTab({ summary }: { summary: BusinessSummary }) {
  const current = summary.current;
  return <Card title="Движение денег"><Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered items={[
    { key: 'cash', label: 'Оплаты клиентов', children: formatMoney(current.cashIncome) },
    { key: 'refunds', label: 'Возвраты клиентам', children: `− ${formatMoney(current.refunds)}` },
    { key: 'manualIncome', label: 'Другие поступления', children: formatMoney(current.manualIncome) },
    { key: 'supplier', label: 'Оплаты поставщикам', children: `− ${formatMoney(current.supplierOutflow)}` },
    { key: 'manualExpense', label: 'Другие выплаты', children: `− ${formatMoney(current.manualExpense)}` },
    { key: 'net', label: 'Чистый денежный поток', children: <Typography.Text strong type={current.cashNet >= 0 ? 'success' : 'danger'}>{formatMoney(current.cashNet)}</Typography.Text> },
  ]} /></Card>;
}

function DailyTab({ summary }: { summary: BusinessSummary }) {
  return <ProgressiveTable rowKey="date" dataSource={summary.current.daily} locale={{ emptyText: 'Данных за период нет' }} columns={[
    { title: 'Дата', dataIndex: 'date', render: formatDate },
    { title: 'Выручка', dataIndex: 'accruedRevenue', align: 'right', render: formatMoney },
    { title: 'Себестоимость', dataIndex: 'costOfGoods', align: 'right', render: formatMoney },
    { title: 'Прочие расходы', dataIndex: 'profitExpense', align: 'right', render: formatMoney },
    { title: 'Прибыль до зарплаты', dataIndex: 'operatingProfitBeforePayroll', align: 'right', render: formatMoney },
    { title: 'Денежный поток', dataIndex: 'cashNet', align: 'right', render: formatMoney },
  ]} />;
}

function CategoriesTab({ summary }: { summary: BusinessSummary }) {
  const columns = [{ title: 'Статья', dataIndex: 'title' }, { title: 'Влияет на прибыль', dataIndex: 'affectsProfit', render: (value: boolean) => value ? 'Да' : 'Нет' }, { title: 'Сумма', dataIndex: 'amount', align: 'right' as const, render: formatMoney }];
  return <div className="report-section-grid"><Card title="Доходы"><Table rowKey="categoryId" size="small" pagination={false} columns={columns} dataSource={summary.current.categoryIncome} locale={{ emptyText: 'Дополнительных доходов нет' }} /></Card><Card title="Расходы"><Table rowKey="categoryId" size="small" pagination={false} columns={columns} dataSource={summary.current.categoryExpenses} locale={{ emptyText: 'Дополнительных расходов нет' }} /></Card></div>;
}

function ControlTab({ summary }: { summary: BusinessSummary }) {
  const status = { DRAFT: <Tag color="blue">Черновик</Tag>, SUBMITTED: <Tag color="gold">На проверке</Tag>, APPROVED: <Tag color="green">Утверждён</Tag> };
  const columns: ColumnsType<BusinessDailyClose> = [
    { title: 'Дата', dataIndex: 'businessDate', render: formatDate }, { title: 'Филиал', key: 'office', render: (_, row) => row.office.name },
    { title: 'Статус', dataIndex: 'status', render: (value: BusinessDailyClose['status']) => status[value] },
    { title: 'Ожидалось', dataIndex: 'expectedAmount', align: 'right', render: formatMoney }, { title: 'Фактически', dataIndex: 'actualAmount', align: 'right', render: formatMoney },
    { title: 'Расхождение', dataIndex: 'difference', align: 'right', render: (value) => <Typography.Text type={Number(value) === 0 ? 'secondary' : 'danger'}>{formatMoney(value)}</Typography.Text> },
  ];
  return <><div className="report-metrics-grid"><Card><Statistic title="Черновиков" value={summary.control.draftDays} /></Card><Card><Statistic title="Ожидают проверки" value={summary.control.submittedDays} /></Card><Card><Statistic title="Утверждено" value={summary.control.approvedDays} /></Card><Card><Statistic title="Сумма расхождений" value={summary.control.totalDifference} precision={2} suffix="₽" /></Card></div><ProgressiveTable rowKey="id" columns={columns} dataSource={summary.closes} scroll={{ x: 850 }} locale={{ emptyText: 'Закрытий дня за период нет' }} /></>;
}

function exportSummary(summary: BusinessSummary) {
  const rows = [
    ['Период', `${summary.range.from} — ${summary.range.to}`], ['Выручка', summary.current.accruedRevenue], ['Себестоимость', summary.current.costOfGoods],
    ['Валовая прибыль', summary.current.grossProfit], ['Зарплата', summary.current.payrollExpense], ['Операционные расходы', summary.current.operatingExpenses],
    ['Операционная прибыль', summary.current.operatingProfit], ['Маржа, %', summary.current.marginPercent], ['Денежный поток', summary.current.cashNet],
    ['Долги клиентов', summary.balances.debtorsAmount], ['Долг поставщикам', summary.balances.supplierPayable],
  ];
  const content = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `business-${summary.range.from}-${summary.range.to}.csv`; link.click(); URL.revokeObjectURL(url);
}
