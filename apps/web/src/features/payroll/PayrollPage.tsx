import { CheckOutlined, CalculatorOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import {
  addPayrollAdjustment,
  approvePayrollPeriod,
  createPayrollPeriod,
  getPayrollPeriod,
  getPayrollResources,
  listPayrollPeriods,
  recalculatePayrollPeriod,
  savePayrollProfile,
} from './payroll.api';
import { PayrollEmployee, PayrollEntry, PayrollPeriod, PayrollProfileInput } from './types';

const { RangePicker } = DatePicker;

export function PayrollPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'payroll.manage');
  const canApprove = hasPermission(auth?.employee, 'payroll.approve');
  const resourcesQuery = useQuery({ queryKey: ['payroll', 'resources'], queryFn: getPayrollResources });
  const periodsQuery = useQuery({ queryKey: ['payroll', 'periods'], queryFn: listPayrollPeriods });
  const [profileEmployee, setProfileEmployee] = useState<PayrollEmployee | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const periodQuery = useQuery({
    queryKey: ['payroll', 'period', selectedPeriodId],
    queryFn: () => getPayrollPeriod(selectedPeriodId!),
    enabled: Boolean(selectedPeriodId),
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['payroll', 'resources'] }),
      queryClient.invalidateQueries({ queryKey: ['payroll', 'periods'] }),
      queryClient.invalidateQueries({ queryKey: ['payroll', 'period'] }),
    ]);
  }

  const recalculateMutation = useMutation({
    mutationFn: recalculatePayrollPeriod,
    onSuccess: async () => { await refresh(); message.success('Расчёт обновлён'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const approveMutation = useMutation({
    mutationFn: approvePayrollPeriod,
    onSuccess: async () => { await refresh(); message.success('Расчёт утверждён и зафиксирован'); },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const employeeColumns = useMemo<ColumnsType<PayrollEmployee>>(() => [
    { title: 'Сотрудник', dataIndex: 'fullName', key: 'fullName' },
    { title: 'Должность', dataIndex: 'position', key: 'position', render: (value) => value || '—' },
    { title: 'Фиксированно', key: 'fixed', render: (_, row) => formatMoney(row.payrollProfile?.fixedAmount ?? 0) },
    { title: 'За смену', key: 'shift', render: (_, row) => formatMoney(row.payrollProfile?.shiftRate ?? 0) },
    { title: 'Услуги', key: 'services', render: (_, row) => `${row.payrollProfile?.servicePercent ?? 0}%` },
    { title: 'Товары', key: 'products', render: (_, row) => `${row.payrollProfile?.productPercent ?? 0}%` },
    { title: 'Статус', key: 'status', render: (_, row) => row.payrollProfile?.isActive ? <Tag color="green">Участвует</Tag> : <Tag>Не настроено</Tag> },
    ...(canManage ? [{ title: '', key: 'action', width: 130, render: (_: unknown, row: PayrollEmployee) => <Button icon={<EditOutlined />} onClick={() => setProfileEmployee(row)}>Настроить</Button> }] : []),
  ], [canManage]);

  const periodColumns = useMemo<ColumnsType<PayrollPeriod>>(() => [
    { title: 'Период', dataIndex: 'title', key: 'title' },
    { title: 'Даты', key: 'dates', render: (_, row) => `${formatDate(row.startsAt)} — ${formatDate(row.endsAt)}` },
    { title: 'Сотрудников', key: 'count', render: (_, row) => row._count?.entries ?? 0 },
    { title: 'Итого', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
    { title: 'Статус', dataIndex: 'status', key: 'status', render: (value) => value === 'APPROVED' ? <Tag color="green">Утверждён</Tag> : <Tag color="blue">Черновик</Tag> },
    {
      title: '', key: 'actions', width: 310, render: (_, row) => (
        <Space wrap>
          <Button onClick={() => setSelectedPeriodId(row.id)}>Открыть</Button>
          {row.status === 'DRAFT' && canManage ? <Button icon={<ReloadOutlined />} loading={recalculateMutation.isPending} onClick={() => recalculateMutation.mutate(row.id)}>Пересчитать</Button> : null}
          {row.status === 'DRAFT' && canApprove ? (
            <Button type="primary" icon={<CheckOutlined />} loading={approveMutation.isPending} onClick={() => modal.confirm({ title: 'Утвердить расчёт?', content: 'После утверждения суммы и правила этого периода изменить нельзя.', okText: 'Утвердить', cancelText: 'Отмена', onOk: () => approveMutation.mutateAsync(row.id) })}>Утвердить</Button>
          ) : null}
        </Space>
      ),
    },
  ], [approveMutation, canApprove, canManage, modal, recalculateMutation]);

  return (
    <div className="page">
      <PageHeader
        title="Зарплата"
        description="Прозрачный расчёт по сменам и фактически оплаченным услугам и товарам. Утверждённые периоды не изменяются."
        extra={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setPeriodOpen(true)}>Новый расчёт</Button> : null}
      />
      <div className="list-panel">
        <Tabs items={[
          { key: 'periods', label: 'Расчётные периоды', children: <Table rowKey="id" columns={periodColumns} dataSource={periodsQuery.data ?? []} loading={periodsQuery.isLoading} pagination={false} scroll={{ x: 980 }} /> },
          { key: 'profiles', label: 'Правила начисления', children: <Table rowKey="id" columns={employeeColumns} dataSource={resourcesQuery.data?.employees ?? []} loading={resourcesQuery.isLoading} pagination={false} scroll={{ x: 900 }} /> },
        ]} />
      </div>
      <ProfileModal employee={profileEmployee} resources={resourcesQuery.data} onClose={() => setProfileEmployee(null)} onSaved={refresh} />
      <CreatePeriodModal open={periodOpen} onClose={() => setPeriodOpen(false)} onSaved={refresh} />
      <PeriodDetailsModal period={periodQuery.data} loading={periodQuery.isLoading} employees={resourcesQuery.data?.employees ?? []} canManage={canManage} onClose={() => setSelectedPeriodId(null)} onChanged={refresh} />
    </div>
  );
}

function ProfileModal({ employee, resources, onClose, onSaved }: { employee: PayrollEmployee | null; resources?: Awaited<ReturnType<typeof getPayrollResources>>; onClose: () => void; onSaved: () => Promise<void> }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<PayrollProfileInput>();
  const mutation = useMutation({
    mutationFn: (input: PayrollProfileInput) => savePayrollProfile(employee!.id, input),
    onSuccess: async () => { await onSaved(); message.success('Правила начисления сохранены'); onClose(); },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const initialValues = employee ? {
    fixedAmount: Number(employee.payrollProfile?.fixedAmount ?? 0),
    shiftRate: Number(employee.payrollProfile?.shiftRate ?? 0),
    servicePercent: Number(employee.payrollProfile?.servicePercent ?? 0),
    productPercent: Number(employee.payrollProfile?.productPercent ?? 0),
    isActive: employee.payrollProfile?.isActive ?? true,
    serviceRules: employee.payrollProfile?.serviceRules.map((rule) => ({ serviceId: rule.serviceId, percent: Number(rule.percent) })) ?? [],
    productRules: employee.payrollProfile?.productRules.map((rule) => ({ productId: rule.productId, percent: Number(rule.percent) })) ?? [],
  } : undefined;
  return (
    <Modal open={Boolean(employee)} title={`Начисления: ${employee?.fullName ?? ''}`} onCancel={onClose} okText="Сохранить" cancelText="Отмена" confirmLoading={mutation.isPending} onOk={() => form.submit()} destroyOnHidden width={760}>
      {employee ? (
        <Form form={form} layout="vertical" initialValues={initialValues} onFinish={(values) => mutation.mutate(values)}>
          <Space wrap align="start">
            <Form.Item name="fixedAmount" label="Фиксированно за период" rules={[{ required: true }]}><InputNumber min={0} precision={2} addonAfter="₽" /></Form.Item>
            <Form.Item name="shiftRate" label="Ставка за смену" rules={[{ required: true }]}><InputNumber min={0} precision={2} addonAfter="₽" /></Form.Item>
            <Form.Item name="servicePercent" label="Процент с услуг" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} addonAfter="%" /></Form.Item>
            <Form.Item name="productPercent" label="Процент с товаров" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} addonAfter="%" /></Form.Item>
            <Form.Item name="isActive" label="Участвует в расчёте" valuePropName="checked"><Switch /></Form.Item>
          </Space>
          <Typography.Title level={5}>Индивидуальные проценты по услугам</Typography.Title>
          <Form.List name="serviceRules">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: '100%' }}>{fields.map((field) => <Space key={field.key} wrap><Form.Item {...field} name={[field.name, 'serviceId']} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder="Услуга" style={{ width: 360 }} options={resources?.services.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item><Form.Item {...field} name={[field.name, 'percent']} rules={[{ required: true }]}><InputNumber min={0} max={100} addonAfter="%" /></Form.Item><Button danger onClick={() => remove(field.name)}>Убрать</Button></Space>)}<Button onClick={() => add({ percent: 0 })}>Добавить правило по услуге</Button></Space>}</Form.List>
          <Typography.Title level={5}>Индивидуальные проценты по товарам</Typography.Title>
          <Form.List name="productRules">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: '100%' }}>{fields.map((field) => <Space key={field.key} wrap><Form.Item {...field} name={[field.name, 'productId']} rules={[{ required: true }]}><Select showSearch optionFilterProp="label" placeholder="Товар" style={{ width: 360 }} options={resources?.products.map((item) => ({ value: item.id, label: item.title }))} /></Form.Item><Form.Item {...field} name={[field.name, 'percent']} rules={[{ required: true }]}><InputNumber min={0} max={100} addonAfter="%" /></Form.Item><Button danger onClick={() => remove(field.name)}>Убрать</Button></Space>)}<Button onClick={() => add({ percent: 0 })}>Добавить правило по товару</Button></Space>}</Form.List>
        </Form>
      ) : null}
    </Modal>
  );
}

function CreatePeriodModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ title: string; range: [Dayjs, Dayjs] }>();
  const mutation = useMutation({ mutationFn: createPayrollPeriod, onSuccess: async () => { await onSaved(); message.success('Черновик расчёта создан'); onClose(); }, onError: (error) => message.error(getErrorMessage(error)) });
  return <Modal open={open} title="Новый расчётный период" onCancel={onClose} okText="Рассчитать" cancelText="Отмена" confirmLoading={mutation.isPending} onOk={() => form.submit()} destroyOnHidden><Form form={form} layout="vertical" initialValues={{ title: `Зарплата за ${dayjs().format('MM.YYYY')}`, range: [dayjs().startOf('month'), dayjs().endOf('month')] }} onFinish={(values) => mutation.mutate({ title: values.title, startsAt: values.range[0].startOf('day').toISOString(), endsAt: values.range[1].endOf('day').toISOString() })}><Form.Item name="title" label="Название" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="range" label="Период" rules={[{ required: true }]}><RangePicker format="DD.MM.YYYY" /></Form.Item><Typography.Text type="secondary">Суммы считаются с фактически оплаченной доли счетов. Черновик можно пересчитать до утверждения директором.</Typography.Text></Form></Modal>;
}

function PeriodDetailsModal({ period, loading, employees, canManage, onClose, onChanged }: { period?: PayrollPeriod; loading: boolean; employees: PayrollEmployee[]; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ employeeId: string; amount: number; reason: string }>();
  const mutation = useMutation({ mutationFn: (input: { employeeId: string; amount: number; reason: string }) => addPayrollAdjustment(period!.id, input), onSuccess: async () => { await onChanged(); form.resetFields(); message.success('Корректировка учтена'); }, onError: (error) => message.error(getErrorMessage(error)) });
  const columns: ColumnsType<PayrollEntry> = [
    { title: 'Сотрудник', dataIndex: 'employeeName', key: 'employeeName', fixed: 'left' },
    { title: 'Фикс.', dataIndex: 'fixedAmount', key: 'fixedAmount', render: formatMoney },
    { title: 'Смены', key: 'shifts', render: (_, row) => `${row.shiftCount} / ${formatMoney(row.shiftAmount)}` },
    { title: 'Услуги', key: 'services', render: (_, row) => `${formatMoney(row.serviceRevenue)} → ${formatMoney(row.serviceAmount)}` },
    { title: 'Товары', key: 'products', render: (_, row) => `${formatMoney(row.productRevenue)} → ${formatMoney(row.productAmount)}` },
    { title: 'Коррект.', dataIndex: 'adjustmentAmount', key: 'adjustmentAmount', render: formatMoney },
    { title: 'Итого', dataIndex: 'totalAmount', key: 'totalAmount', render: (value) => <strong>{formatMoney(value)}</strong> },
  ];
  return <Modal open={Boolean(period) || loading} title={period?.title ?? 'Расчёт зарплаты'} onCancel={onClose} footer={<Button onClick={onClose}>Закрыть</Button>} width={1180} loading={loading}>
    {period ? <><Descriptions size="small" bordered items={[{ key: 'dates', label: 'Период', children: `${formatDate(period.startsAt)} — ${formatDate(period.endsAt)}` }, { key: 'status', label: 'Статус', children: period.status === 'APPROVED' ? 'Утверждён' : 'Черновик' }, { key: 'total', label: 'Итого', children: formatMoney(period.totalAmount) }, { key: 'approved', label: 'Утвердил', children: period.approvedBy?.fullName ?? '—' }]} /><Table rowKey="id" columns={columns} dataSource={period.entries ?? []} pagination={false} scroll={{ x: 1050 }} style={{ marginTop: 16 }} />{period.status === 'DRAFT' && canManage ? <Form form={form} layout="inline" onFinish={(values) => mutation.mutate(values)} style={{ marginTop: 20 }}><Form.Item name="employeeId" rules={[{ required: true }]}><Select placeholder="Сотрудник" style={{ width: 260 }} options={employees.map((item) => ({ value: item.id, label: item.fullName }))} /></Form.Item><Form.Item name="amount" rules={[{ required: true }]}><InputNumber precision={2} placeholder="Премия или удержание" addonAfter="₽" /></Form.Item><Form.Item name="reason" rules={[{ required: true }]}><Input placeholder="Основание корректировки" style={{ width: 300 }} /></Form.Item><Button type="primary" htmlType="submit" loading={mutation.isPending}>Добавить</Button></Form> : null}</> : null}
  </Modal>;
}
