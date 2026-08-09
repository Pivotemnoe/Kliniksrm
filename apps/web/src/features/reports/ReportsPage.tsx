import {
  DownloadOutlined,
  FilePdfOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Select, Space, Tabs, Tag, Typography } from 'antd';
import { ReactNode, useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ProgressiveTable } from '../../shared/ui/InfiniteTable';
import { formatDate } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { exportReportToExcel, printReportAsPdf } from './reportExport';
import { getClinicReport } from './reports.api';
import { ClinicReport, ReportSalesRow, ReportVaccinationItem } from './types';

export function ReportsPage() {
  const initialRange = useMemo(currentMonthRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [employeeId, setEmployeeId] = useState<string>();
  const reportQuery = useQuery({
    queryKey: ['reports', from, to, employeeId],
    queryFn: () => getClinicReport({ from, to, employeeId }),
    enabled: Boolean(from && to),
    staleTime: 30_000,
  });
  const report = reportQuery.data;

  return (
    <div className="page reports-page">
      <PageHeader
        title="Отчёты"
        description="Финансы, посещаемость, услуги, товары, сотрудники, вакцинации и состояние склада."
        extra={
          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              disabled={!report}
              onClick={() => report && exportReportToExcel(report)}
            >
              Скачать для Excel
            </Button>
            <Button
              icon={<FilePdfOutlined />}
              disabled={!report}
              onClick={() => report && printReportAsPdf(report)}
            >
              Печать / PDF
            </Button>
          </Space>
        }
      />

      <Card className="report-filter-card">
        <div className="report-filter-row">
          <label>
            <span>С даты</span>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>По дату</span>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="report-employee-filter">
            <span>Сотрудник</span>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Вся клиника"
              value={employeeId}
              onChange={setEmployeeId}
              options={report?.employeeOptions.map((item) => ({
                value: item.id,
                label: item.position ? `${item.fullName} · ${item.position}` : item.fullName,
              })) ?? []}
            />
          </label>
          <Button icon={<ReloadOutlined />} loading={reportQuery.isFetching} onClick={() => void reportQuery.refetch()}>
            Обновить
          </Button>
        </div>
      </Card>

      {reportQuery.isError ? <Alert type="error" showIcon message="Не удалось сформировать отчёт" description={getErrorMessage(reportQuery.error)} /> : null}
      {report ? <ReportContent report={report} /> : null}
    </div>
  );
}

function ReportContent({ report }: { report: ClinicReport }) {
  return (
    <>
      <div className="report-metrics-grid">
        <ReportMetric title="Начислено" value={formatMoney(report.finance.billedAmount)} hint={`${report.finance.billsCount} счетов`} tone="blue" />
        <ReportMetric title="Оплачено" value={formatMoney(report.finance.paidAmount)} hint={`Возвраты ${formatMoney(report.finance.refundedAmount)}`} tone="green" />
        <ReportMetric title="Задолженность" value={formatMoney(report.finance.debtAmount)} hint={`${report.finance.debtorsCount} неоплаченных счетов`} tone="red" />
        <ReportMetric title="Валовая прибыль" value={formatMoney(report.profit.grossProfit)} hint={`Маржа ${formatPercent(report.profit.marginPercent)}`} tone="teal" />
        <ReportMetric title="Приёмы" value={report.traffic.visitsTotal} hint={`Завершено ${report.traffic.visitsCompleted}`} />
        <ReportMetric title="Просрочено более часа" value={report.traffic.visitsOverdue} hint={`Оповещений ${report.traffic.overdueNotifications}`} tone="red" />
        <ReportMetric title="Клиенты" value={report.traffic.uniqueOwners} hint={`Новых ${report.traffic.newOwners}`} />
        <ReportMetric title="Вакцинации" value={report.vaccinations.administered} hint={`Предстоит ${report.vaccinations.upcoming}`} />
        <ReportMetric title="Склад по закупке" value={formatMoney(report.stock.purchaseValue)} hint={`${report.stock.products} товаров`} />
      </div>

      <Tabs
        className="report-tabs"
        items={[
          { key: 'finance', label: 'Финансы', children: <FinanceReport report={report} /> },
          { key: 'traffic', label: 'Посещаемость', children: <TrafficReport report={report} /> },
          { key: 'sales', label: 'Услуги и товары', children: <SalesReport report={report} /> },
          { key: 'employees', label: 'Сотрудники', children: <EmployeesReport report={report} /> },
          { key: 'vaccinations', label: 'Вакцинации', children: <VaccinationsReport report={report} /> },
          { key: 'stock', label: 'Склад', children: <StockReport report={report} /> },
        ]}
      />
      <Typography.Text type="secondary">
        Отчёт сформирован {new Date(report.generatedAt).toLocaleString('ru-RU')}. {report.profit.note}
      </Typography.Text>
    </>
  );
}

function FinanceReport({ report }: { report: ClinicReport }) {
  return (
    <div className="report-section-grid">
      <Card title="Оплаты по способам">
        <ProgressiveTable
          rowKey="key"
          size="small"
          dataSource={report.finance.paymentMethods}
          locale={{ emptyText: 'Оплат за период нет' }}
          columns={[
            { title: 'Способ', dataIndex: 'title' },
            { title: 'Поступило', dataIndex: 'received', align: 'right', render: formatMoney },
            { title: 'Возвраты', dataIndex: 'refunded', align: 'right', render: formatMoney },
            { title: 'Итого', dataIndex: 'net', align: 'right', render: formatMoney },
            { title: 'Операций', dataIndex: 'count', align: 'right' },
          ]}
        />
      </Card>
      <Card title="Итоги периода">
        <div className="report-summary-list">
          <SummaryRow label="Средний счёт" value={formatMoney(report.finance.averageBill)} />
          <SummaryRow label="Депозиты владельцев" value={formatMoney(report.finance.depositsAmount)} />
          <SummaryRow label="Закупки" value={formatMoney(report.finance.supplyPurchasesAmount)} />
          <SummaryRow label="Себестоимость проданных товаров" value={formatMoney(report.profit.costOfGoods)} />
          <SummaryRow label="Выручка до расходов" value={formatMoney(report.profit.revenue)} />
        </div>
      </Card>
      <Card title="Задолженность" className="report-wide-card">
        <ProgressiveTable
          rowKey="billId"
          size="small"
          dataSource={report.finance.debtors}
          locale={{ emptyText: 'Задолженности нет' }}
          columns={[
            { title: 'Владелец', dataIndex: 'ownerName' },
            { title: 'Телефон', dataIndex: 'phone', render: textOrDash },
            { title: 'Счёт создан', dataIndex: 'createdAt', render: formatDate },
            { title: 'Срок оплаты', dataIndex: 'dueAt', render: formatDate },
            { title: 'Долг', dataIndex: 'debt', align: 'right', render: formatMoney },
          ]}
        />
      </Card>
    </div>
  );
}

function TrafficReport({ report }: { report: ClinicReport }) {
  return (
    <div className="report-section-grid">
      <Card title="Приёмы и записи">
        <div className="report-summary-list">
          <SummaryRow label="Всего приёмов" value={report.traffic.visitsTotal} />
          <SummaryRow label="Завершено приёмов" value={report.traffic.visitsCompleted} />
          <SummaryRow label="Не завершено более часа" value={report.traffic.visitsOverdue} danger={report.traffic.visitsOverdue > 0} />
          <SummaryRow label="Сформировано предупреждений" value={report.traffic.overdueNotifications} danger={report.traffic.overdueNotifications > 0} />
          <SummaryRow label="Отменено приёмов" value={report.traffic.visitsCancelled} />
          <SummaryRow label="Записей в расписании" value={report.traffic.appointmentsTotal} />
          <SummaryRow label="Завершено записей" value={report.traffic.appointmentsCompleted} />
          <SummaryRow label="Не пришли" value={report.traffic.appointmentsNoShow} />
        </div>
      </Card>
      <Card title="Клиентский поток">
        <div className="report-summary-list">
          <SummaryRow label="Уникальных владельцев на приёмах" value={report.traffic.uniqueOwners} />
          <SummaryRow label="Новых владельцев" value={report.traffic.newOwners} />
          <SummaryRow label="Отменено записей" value={report.traffic.appointmentsCancelled} />
        </div>
      </Card>
      <Card title="По дням" className="report-wide-card">
        <ProgressiveTable
          rowKey="date"
          size="small"
          dataSource={report.traffic.daily}
          locale={{ emptyText: 'Данных за период нет' }}
          columns={[
            { title: 'Дата', dataIndex: 'date', render: formatDate },
            { title: 'Начато', dataIndex: 'visits', align: 'right' },
            { title: 'Завершено', dataIndex: 'completedVisits', align: 'right' },
            { title: 'Более часа', dataIndex: 'overdueVisits', align: 'right', render: (value) => value ? <Tag color="red">{value}</Tag> : 0 },
            { title: 'Оповещений', dataIndex: 'overdueNotifications', align: 'right' },
            { title: 'Начислено', dataIndex: 'billedAmount', align: 'right', render: formatMoney },
            { title: 'Оплачено', dataIndex: 'paidAmount', align: 'right', render: formatMoney },
          ]}
        />
      </Card>
    </div>
  );
}

function SalesReport({ report }: { report: ClinicReport }) {
  return (
    <div className="report-section-grid">
      <SalesTable title="Услуги" items={report.sales.services} />
      <SalesTable title="Товары" items={report.sales.products} />
      {report.sales.other.length ? <SalesTable title="Прочие строки" items={report.sales.other} wide /> : null}
    </div>
  );
}

function SalesTable({ title, items, wide = false }: { title: string; items: ReportSalesRow[]; wide?: boolean }) {
  return (
    <Card title={title} className={wide ? 'report-wide-card' : undefined}>
      <ProgressiveTable
        rowKey="key"
        size="small"
        dataSource={items}
        locale={{ emptyText: 'Данных за период нет' }}
        columns={[
          { title: 'Наименование', dataIndex: 'title' },
          { title: 'Количество', dataIndex: 'quantity', align: 'right', render: formatQuantity },
          { title: 'Скидка', dataIndex: 'discount', align: 'right', render: formatMoney },
          { title: 'Выручка', dataIndex: 'revenue', align: 'right', render: formatMoney },
        ]}
      />
    </Card>
  );
}

function EmployeesReport({ report }: { report: ClinicReport }) {
  return (
    <Card title="Работа сотрудников за период">
      <ProgressiveTable
        rowKey="employeeId"
        size="small"
        dataSource={report.employees}
        locale={{ emptyText: 'Приёмов за период нет' }}
        columns={[
          { title: 'Сотрудник', dataIndex: 'fullName' },
          { title: 'Должность', dataIndex: 'position', render: textOrDash },
          { title: 'Приёмы', dataIndex: 'visits', align: 'right' },
          { title: 'Завершено', dataIndex: 'completedVisits', align: 'right' },
          { title: 'Более часа', dataIndex: 'overdueVisits', align: 'right', render: (value) => value ? <Tag color="red">{value}</Tag> : 0 },
          { title: 'Оповещений', dataIndex: 'overdueNotifications', align: 'right' },
          { title: 'Начислено', dataIndex: 'billedAmount', align: 'right', render: formatMoney },
        ]}
      />
      <Typography.Paragraph type="secondary" className="report-note">
        Это отчёт по активности, а не расчёт заработной платы. Правила оклада, процентов и смен будут добавлены отдельным модулем.
      </Typography.Paragraph>
    </Card>
  );
}

function VaccinationsReport({ report }: { report: ClinicReport }) {
  return (
    <div className="report-section-grid">
      <Card title="Итоги вакцинаций">
        <div className="report-summary-list">
          <SummaryRow label="Проведено за период" value={report.vaccinations.administered} />
          <SummaryRow label="Предстоит в ближайшие 30 дней" value={report.vaccinations.upcoming} />
          <SummaryRow label="Просрочено" value={report.vaccinations.overdue} danger={report.vaccinations.overdue > 0} />
        </div>
        <Space wrap className="report-tags">
          {report.vaccinations.administeredByTitle.map((item) => <Tag key={item.title}>{item.title}: {item.count}</Tag>)}
        </Space>
      </Card>
      <VaccinationTable title="Предстоящие" items={report.vaccinations.upcomingItems} />
      <VaccinationTable title="Просроченные" items={report.vaccinations.overdueItems} wide danger />
    </div>
  );
}

function VaccinationTable({ title, items, wide = false, danger = false }: { title: string; items: ReportVaccinationItem[]; wide?: boolean; danger?: boolean }) {
  return (
    <Card title={title} className={wide ? 'report-wide-card' : undefined}>
      <ProgressiveTable
        rowKey="id"
        size="small"
        dataSource={items}
        locale={{ emptyText: 'Список пуст' }}
        columns={[
          { title: 'Дата', dataIndex: 'expiresAt', render: (value) => <Tag color={danger ? 'red' : 'orange'}>{formatDate(value)}</Tag> },
          { title: 'Вакцина', dataIndex: 'title' },
          { title: 'Пациент', render: (_, item) => item.animal.nickname },
          { title: 'Владелец', render: (_, item) => item.animal.owner.fullName },
          { title: 'Телефон', render: (_, item) => textOrDash(item.animal.owner.phone) },
          { title: 'Напоминание', dataIndex: 'ownerReminderEnabled', render: (value) => value ? 'Включено' : 'Не включено' },
        ]}
      />
    </Card>
  );
}

function StockReport({ report }: { report: ClinicReport }) {
  return (
    <div className="report-section-grid">
      <Card title="Стоимость остатков">
        <div className="report-summary-list">
          <SummaryRow label="По закупочной цене" value={formatMoney(report.stock.purchaseValue)} />
          <SummaryRow label="По розничной цене" value={formatMoney(report.stock.retailValue)} />
          <SummaryRow label="Потенциальная наценка" value={formatMoney(report.stock.potentialMarkup)} />
          <SummaryRow label="Товаров" value={report.stock.products} />
          <SummaryRow label="Партий" value={report.stock.batches} />
        </div>
      </Card>
      <Card title="Контроль склада">
        <div className="report-summary-list">
          <SummaryRow label="Низкий остаток" value={report.stock.lowStock} danger={report.stock.lowStock > 0} />
          <SummaryRow label="Истекает в течение 30 дней" value={report.stock.expiringBatches} danger={report.stock.expiringBatches > 0} />
          <SummaryRow label="Просроченных партий" value={report.stock.expiredBatches} danger={report.stock.expiredBatches > 0} />
        </div>
      </Card>
      <Card title="Товары с низким остатком" className="report-wide-card">
        <ProgressiveTable
          rowKey="id"
          size="small"
          dataSource={report.stock.lowStockItems}
          locale={{ emptyText: 'Низких остатков нет' }}
          columns={[
            { title: 'Товар', dataIndex: 'title' },
            { title: 'Остаток', dataIndex: 'rest', align: 'right', render: formatQuantity },
            { title: 'Минимум', dataIndex: 'minStock', align: 'right', render: formatQuantity },
            { title: 'Единица', dataIndex: 'unit', render: textOrDash },
          ]}
        />
      </Card>
      <Card title="Сроки годности партий" className="report-wide-card">
        <ProgressiveTable
          rowKey="id"
          size="small"
          dataSource={report.stock.expiryItems}
          locale={{ emptyText: 'Просроченных и истекающих партий нет' }}
          columns={[
            { title: 'Статус', dataIndex: 'status', render: (value) => value === 'EXPIRED' ? <Tag color="red">Просрочено</Tag> : <Tag color="orange">Истекает</Tag> },
            { title: 'Годен до', dataIndex: 'expiresAt', render: formatDate },
            { title: 'Товар', dataIndex: 'productTitle' },
            { title: 'Склад', dataIndex: 'warehouseName' },
            { title: 'Серия', dataIndex: 'series', render: textOrDash },
            { title: 'Остаток', dataIndex: 'rest', align: 'right', render: formatQuantity },
            { title: 'Единица', dataIndex: 'unit', render: textOrDash },
            { title: 'Закупочная цена', dataIndex: 'purchasePrice', align: 'right', render: formatMoney },
          ]}
        />
      </Card>
    </div>
  );
}

function ReportMetric({ title, value, hint, tone = 'default' }: { title: string; value: ReactNode; hint: string; tone?: string }) {
  return (
    <Card className={`report-metric report-metric-${tone}`}>
      <Typography.Text type="secondary">{title}</Typography.Text>
      <strong>{value}</strong>
      <span>{hint}</span>
    </Card>
  );
}

function SummaryRow({ label, value, danger = false }: { label: string; value: ReactNode; danger?: boolean }) {
  return <div><span>{label}</span><strong className={danger ? 'report-danger' : undefined}>{value}</strong></div>;
}

function currentMonthRange() {
  const now = new Date();
  return {
    from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    to: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  };
}

function formatQuantity(value: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)}%`;
}

function textOrDash(value: string | null | undefined) {
  return value || '—';
}
