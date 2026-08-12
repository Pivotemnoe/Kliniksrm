import { CheckOutlined, DownloadOutlined, EditOutlined, PlusOutlined, PrinterOutlined, SettingOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, DatePicker, Descriptions, Input, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProgressiveTable } from '../../shared/ui/InfiniteTable';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { BusinessEntryModal } from './BusinessEntryModal';
import { BusinessEntryCorrectionModal } from './BusinessEntryCorrectionModal';
import { BusinessCategoriesModal } from './BusinessCategoriesModal';
import { DirectorBriefingTab } from './DirectorBriefingTab';
import { getBusinessResources, getBusinessSummary, listBusinessEntries, resolveBusinessEntry, voidBusinessEntry } from './business.api';
import { BusinessDailyClose, BusinessEntry, BusinessCategoryType, BusinessSummary } from './types';

const { RangePicker } = DatePicker;

export function BusinessPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'business.manage');
  const isDirector = auth?.employee.roles.includes('director') ?? false;
  const [searchParams] = useSearchParams();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [officeId, setOfficeId] = useState<string>();
  const [entryType, setEntryType] = useState<BusinessCategoryType | null>(null);
  const [editingEntry, setEditingEntry] = useState<BusinessEntry | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('profit');
  useEffect(() => {
    if (searchParams.get('tab') === 'briefing' && isDirector) setActiveTab('briefing');
  }, [isDirector, searchParams]);
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
      title: 'Утвердить операцию?',
      content: <><Typography.Paragraph>{entry.category.title} · {formatMoney(entry.amount)}</Typography.Paragraph><Input.TextArea rows={3} placeholder="Комментарий директора" onChange={(event) => { reason = event.target.value; }} /></>,
      okText: 'Утвердить', cancelText: 'Отмена',
      onOk: async () => {
        if (reason.trim().length < 2) { message.error('Укажите комментарий к утверждению'); return Promise.reject(); }
        await resolveBusinessEntry(entry.id, reason); await refresh(); message.success('Операция утверждена директором');
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
    { title: 'Описание', key: 'comment', render: (_, row) => <><div>{row.comment || row.category.title}</div>{row.counterparty ? <Typography.Text type="secondary" style={{ display: 'block' }}>Получатель / источник: {row.counterparty}</Typography.Text> : null}{row.documentNumber ? <Typography.Text type="secondary" style={{ display: 'block' }}>Документ: {row.documentNumber}</Typography.Text> : null}{row.correctionOfId ? <Tag color="blue">Исправление</Tag> : null}{row.voidReason ? <Typography.Text type="secondary" style={{ display: 'block' }}>Причина отмены: {row.voidReason}</Typography.Text> : null}</> },
    { title: 'Сумма', dataIndex: 'amount', key: 'amount', align: 'right', render: (value, row) => <Typography.Text type={row.type === 'INCOME' ? 'success' : undefined}>{row.type === 'INCOME' ? '+' : '−'}{formatMoney(value)}</Typography.Text> },
    { title: 'Статус', key: 'status', render: (_, row) => row.status === 'VOIDED' ? <Tag>Отменена</Tag> : row.requiresResolution ? <Tag color="orange">Нужно проверить</Tag> : <Tag color="green">Учтена</Tag> },
    ...(canManage ? [{ title: 'Действия', key: 'action', width: 300, render: (_: unknown, row: BusinessEntry) => row.status === 'ACTIVE' ? <Space wrap>{row.requiresResolution ? <Button size="small" icon={<CheckOutlined />} onClick={() => askResolve(row)}>Утвердить</Button> : null}<Button size="small" icon={<EditOutlined />} onClick={() => setEditingEntry(row)}>Исправить</Button><Button size="small" danger icon={<StopOutlined />} onClick={() => askVoid(row)}>Отменить</Button></Space> : null }] : []),
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
        {summary.control.unresolvedEntries || summary.control.submittedDays ? <Alert type="warning" showIcon message="Есть операции, требующие внимания" description={`Операций на утверждении: ${summary.control.unresolvedEntries}. Закрытий дня на проверке: ${summary.control.submittedDays}. Операции, внесённые администратором, подтверждаются директором отдельно или вместе с закрытием дня.`} action={summary.control.unresolvedEntries ? <Button size="small" onClick={() => setActiveTab('operations')}>Открыть операции</Button> : undefined} /> : null}
        <div className="list-panel">
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            { key: 'profit', label: 'Прибыль', children: <ProfitTab summary={summary} /> },
            { key: 'cash', label: 'Деньги', children: <CashTab summary={summary} /> },
            { key: 'daily', label: 'По дням', children: <DailyTab summary={summary} /> },
            { key: 'categories', label: 'Статьи', children: <CategoriesTab summary={summary} /> },
            { key: 'operations', label: `Операции · ${entriesQuery.data?.length ?? 0}`, children: <><div className="list-panel-header"><Typography.Text type="secondary">Внесённые вручную доходы и расходы. Статья обязательна. Ошибочную запись можно исправить или отменить: исходная операция и причина сохраняются в аудите.</Typography.Text>{canManage ? <Space wrap><Button icon={<SettingOutlined />} onClick={() => setCategoriesOpen(true)}>Статьи</Button><Button icon={<PlusOutlined />} onClick={() => setEntryType('INCOME')}>Доход</Button><Button icon={<PlusOutlined />} onClick={() => setEntryType('EXPENSE')}>Расход</Button></Space> : null}</div><ProgressiveTable rowKey="id" columns={operationColumns} dataSource={entriesQuery.data ?? []} loading={entriesQuery.isLoading} scroll={{ x: 1080 }} locale={{ emptyText: 'Ручных операций за период нет' }} /></> },
            { key: 'control', label: 'Контроль', children: <ControlTab summary={summary} /> },
            ...(isDirector ? [{ key: 'briefing', label: 'Сводки директора', children: <DirectorBriefingTab /> }] : []),
          ]} />
        </div>
        <Alert type="info" showIcon message="Это управленческая отчётность" description={summary.current.note} />
      </> : null}
      <BusinessEntryModal type={entryType} resources={resourcesQuery.data} officeId={officeId ?? resourcesQuery.data?.offices[0]?.id} defaultDate={dayjs().toISOString()} onClose={() => setEntryType(null)} onSaved={refresh} />
      <BusinessEntryCorrectionModal entry={editingEntry} resources={resourcesQuery.data} onClose={() => setEditingEntry(null)} onSaved={refresh} />
      <BusinessCategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ['business', 'resources'] }); await refresh(); }} />
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
    { key: 'systemRevenue', label: 'Выручка по счетам CRM', children: formatMoney(current.accruedSystemRevenue) },
    { key: 'unrecordedRevenue', label: 'Выручка, внесённая вручную', children: formatMoney(current.unrecordedProfitRevenue) },
    { key: 'otherIncome', label: 'Прочие доходы, влияющие на прибыль', children: formatMoney(current.otherProfitIncome) },
    { key: 'revenue', label: 'Выручка всего', children: <strong>{formatMoney(current.accruedRevenue)}</strong> },
    { key: 'cogs', label: 'Себестоимость использованных товаров', children: `− ${formatMoney(current.costOfGoods)}` },
    { key: 'gross', label: 'Валовая прибыль', children: <strong>{formatMoney(current.grossProfit)}</strong> },
    { key: 'payroll', label: 'Начислено в разделе «Зарплата»', children: `− ${formatMoney(current.payrollExpense)}` },
    { key: 'dailySalary', label: 'Фактически выдано через закрытие дня', children: `− ${formatMoney(current.dailySalaryExpense)}` },
    { key: 'opex', label: 'Остальные операционные расходы', children: `− ${formatMoney(current.operatingExpenses)}` },
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
  const otherManualExpenses = current.manualExpense - current.dailySalaryExpense;
  return <Card title="Движение денег"><Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered items={[
    { key: 'cash', label: 'Оплаты клиентов', children: formatMoney(current.cashIncome) },
    { key: 'refunds', label: 'Возвраты клиентам', children: `− ${formatMoney(current.refunds)}` },
    { key: 'unrecordedRevenue', label: 'Выручка, внесённая вручную', children: formatMoney(current.unrecordedRevenue) },
    { key: 'manualIncome', label: 'Прочие поступления', children: formatMoney(current.otherManualIncome) },
    { key: 'supplier', label: 'Оплаты поставщикам', children: `− ${formatMoney(current.supplierOutflow)}` },
    { key: 'dailySalary', label: 'Зарплата, выданная через закрытие дня', children: `− ${formatMoney(current.dailySalaryExpense)}` },
    { key: 'manualExpense', label: 'Остальные ручные выплаты', children: `− ${formatMoney(otherManualExpenses)}` },
    { key: 'net', label: 'Чистый денежный поток', children: <Typography.Text strong type={current.cashNet >= 0 ? 'success' : 'danger'}>{formatMoney(current.cashNet)}</Typography.Text> },
  ]} /></Card>;
}

function DailyTab({ summary }: { summary: BusinessSummary }) {
  return <ProgressiveTable rowKey="date" dataSource={summary.current.daily} locale={{ emptyText: 'Данных за период нет' }} columns={[
    { title: 'Дата', dataIndex: 'date', render: formatDate },
    { title: 'Выручка по счетам CRM', dataIndex: 'systemRevenue', align: 'right', render: formatMoney },
    { title: 'Выручка внесена вручную', dataIndex: 'unrecordedRevenue', align: 'right', render: formatMoney },
    { title: 'Прочие доходы', dataIndex: 'otherIncome', align: 'right', render: formatMoney },
    { title: 'Выручка всего', dataIndex: 'accruedRevenue', align: 'right', render: formatMoney },
    { title: 'Себестоимость', dataIndex: 'costOfGoods', align: 'right', render: formatMoney },
    { title: 'Зарплата через закрытие дня', dataIndex: 'salaryExpense', align: 'right', render: formatMoney },
    { title: 'Прочие расходы', dataIndex: 'profitExpense', align: 'right', render: formatMoney },
    { title: 'Прибыль после ручных расходов', dataIndex: 'operatingProfitAfterManualExpenses', align: 'right', render: formatMoney },
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
    ['Период', `${summary.range.from} — ${summary.range.to}`], ['Выручка по счетам CRM', summary.current.accruedSystemRevenue], ['Выручка, внесённая вручную', summary.current.unrecordedProfitRevenue], ['Прочие доходы', summary.current.otherProfitIncome], ['Выручка всего', summary.current.accruedRevenue], ['Себестоимость', summary.current.costOfGoods],
    ['Валовая прибыль', summary.current.grossProfit], ['Начислено в разделе «Зарплата»', summary.current.payrollExpense], ['Зарплата, выданная через закрытие дня', summary.current.dailySalaryExpense], ['Остальные операционные расходы', summary.current.operatingExpenses],
    ['Операционная прибыль', summary.current.operatingProfit], ['Маржа, %', summary.current.marginPercent], ['Денежный поток', summary.current.cashNet],
    ['Долги клиентов', summary.balances.debtorsAmount], ['Долг поставщикам', summary.balances.supplierPayable],
  ];
  const content = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `business-${summary.range.from}-${summary.range.to}.csv`; link.click(); URL.revokeObjectURL(url);
}
