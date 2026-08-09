import { DownOutlined, FileAddOutlined, SearchOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Dropdown, Form, Input, Modal, Select, Space, Tag, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import { getFinanceSettings } from '../finance/finance.api';
import { bulkCancelBills, bulkPayBills, cancelBill, createBill, listBills, listBillSelection } from './billing.api';
import {
  BillAmountFilter,
  BillListItem,
  BillSource,
  BulkPayBillsInput,
  PaymentStatus,
  PaymentType,
  billSourceLabels,
  paymentStatusColors,
  paymentStatusLabels,
  paymentTypeLabels,
} from './types';

type BillStatusFilter = PaymentStatus | 'DEBT';

export function BillsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'billing.manage');
  const canManagePayments = hasPermission(auth?.employee, 'payments.manage');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BillStatusFilter | undefined>(() => getInitialStatusFilter(searchParams));
  const [source, setSource] = useState<BillSource | undefined>();
  const [amountFilter, setAmountFilter] = useState<BillAmountFilter | undefined>();
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const status = statusFilter === 'DEBT' ? undefined : statusFilter;
  const debtOnly = statusFilter === 'DEBT';
  const billsQuery = useInfiniteListQuery({
    queryKey: ['bills', { search, status, debtOnly, source, amount: amountFilter }],
    queryFn: ({ limit, offset }) => listBills({ search, status, debtOnly, source, amount: amountFilter, limit, offset }),
  });
  const billsTotal = billsQuery.data?.pages[0]?.total ?? 0;
  const cancelMutation = useMutation({
    mutationFn: cancelBill,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      message.success('Счёт отменён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const { isPending: cancelPending, mutateAsync: cancelBillAsync } = cancelMutation;
  const selectionQuery = { search, status, debtOnly, source, amount: amountFilter };
  const selectAllMutation = useMutation({
    mutationFn: () => listBillSelection(selectionQuery),
    onSuccess: (result) => {
      const actionableIds = result.items
        .filter((bill) => {
          const debt = toMoneyNumber(bill.totalAmount) - toMoneyNumber(bill.paidAmount);
          const cancellable = canManage && bill.status !== 'CANCELLED' && toMoneyNumber(bill.paidAmount) <= 0;
          const payable = canManagePayments && bill.status !== 'CANCELLED' && debt > 0;
          return cancellable || payable;
        })
        .map((bill) => bill.id);
      setSelectedBillIds(actionableIds);
      if (actionableIds.length) {
        message.success(`Выбрано счетов: ${actionableIds.length}`);
      } else {
        message.info('По текущим фильтрам нет счетов, доступных вам для массового действия');
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const bulkCancelMutation = useMutation({
    mutationFn: (billIds: string[]) => bulkCancelBills(billIds),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      setSelectedBillIds([]);
      message.success(`Отменено счетов: ${result.count}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const bulkPayMutation = useMutation({
    mutationFn: (input: Omit<BulkPayBillsInput, 'billIds'>) => bulkPayBills({ ...input, billIds: selectedBillIds }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      setSelectedBillIds([]);
      setBulkPaymentOpen(false);
      message.success(`Полностью оплачено счетов: ${result.count}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    setStatusFilter(getInitialStatusFilter(searchParams));
  }, [searchParams]);

  useEffect(() => {
    setSelectedBillIds([]);
  }, [amountFilter, debtOnly, search, source, status]);

  const columns = useMemo<ColumnsType<BillListItem>>(
    () => [
      {
        title: 'Действия',
        key: 'bill',
        width: 130,
        render: (_, record) => {
          const debt = toMoneyNumber(record.totalAmount) - toMoneyNumber(record.paidAmount);
          const actionItems: MenuProps['items'] = [
            { key: 'open', label: 'Открыть' },
            { key: 'pay', label: 'Оплатить', disabled: !canManagePayments || debt <= 0 || record.status === 'CANCELLED' },
            ...(canManage
              ? [{ key: 'cancel', label: 'Отменить', disabled: record.status === 'CANCELLED' || toMoneyNumber(record.paidAmount) > 0, danger: true }]
              : []),
          ];

          function handleAction(key: string) {
            if (key === 'open') {
              navigate(`/bills/${record.id}`);
              return;
            }

            if (key === 'pay') {
              navigate(`/bills/${record.id}?pay=1`);
              return;
            }

            if (key === 'cancel') {
              modal.confirm({
                title: 'Отменить счёт?',
                content: 'Отменить можно только счёт без оплат.',
                okText: 'Отменить',
                cancelText: 'Назад',
                okButtonProps: { danger: true },
                onOk: () => cancelBillAsync(record.id),
              });
            }
          }

          return (
            <Dropdown menu={{ items: actionItems, onClick: ({ key }) => handleAction(key) }} trigger={['click']}>
              <Button size="small" loading={cancelPending}>
                Действие <DownOutlined />
              </Button>
            </Dropdown>
          );
        },
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        render: (value: PaymentStatus) => <Tag color={paymentStatusColors[value]}>{paymentStatusLabels[value]}</Tag>,
      },
      {
        title: 'Источник',
        dataIndex: 'source',
        key: 'source',
        render: (value: BillSource) => billSourceLabels[value],
      },
      {
        title: 'Владелец',
        key: 'owner',
        render: (_, record) =>
          record.owner ? (
            <Typography.Link onClick={() => navigate(`/owners/${record.owner?.id}`)}>{record.owner.fullName}</Typography.Link>
          ) : (
            '—'
          ),
      },
      {
        title: 'Пациент',
        key: 'animal',
        render: (_, record) =>
          record.animal ? (
            <Typography.Link onClick={() => navigate(`/patients/${record.animal?.id}`)}>{record.animal.nickname}</Typography.Link>
          ) : (
            '—'
          ),
      },
      { title: 'Позиций', key: 'items', render: (_, record) => record._count?.items ?? 0 },
      { title: 'Создан', dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
      {
        title: 'Срок оплаты',
        dataIndex: 'dueAt',
        key: 'dueAt',
        render: (value: string | null, record) => {
          const debt = toMoneyNumber(record.totalAmount) - toMoneyNumber(record.paidAmount);
          const overdue = Boolean(value && debt > 0 && new Date(value) < new Date());
          return (
            <Space direction="vertical" size={0}>
              <span>{formatDate(value)}</span>
              {overdue ? <Tag color="red">Просрочен</Tag> : null}
            </Space>
          );
        },
      },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', render: formatMoney },
      {
        title: 'Оплачено',
        key: 'paid',
        render: (_, record) => {
          const debt = toMoneyNumber(record.totalAmount) - toMoneyNumber(record.paidAmount);
          return (
            <Space direction="vertical" size={0}>
              <span>{formatMoney(record.paidAmount)}</span>
              {debt > 0 ? <Typography.Text type="secondary">долг {formatMoney(debt)}</Typography.Text> : null}
            </Space>
          );
        },
      },
    ],
    [canManage, canManagePayments, cancelBillAsync, cancelPending, modal, navigate],
  );

  function confirmBulkCancellation() {
    modal.confirm({
      title: `Отменить выбранные счета (${selectedBillIds.length})?`,
      content: 'Все выбранные счета будут отменены одним действием. Если хотя бы один счёт уже имеет оплату, ни один счёт не изменится.',
      okText: 'Отменить счета',
      cancelText: 'Назад',
      okButtonProps: { danger: true },
      onOk: () => bulkCancelMutation.mutateAsync(selectedBillIds),
    });
  }

  return (
    <div className="page bills-page">
      <PageHeader
        title="Счета"
        description="Счета по приёмам, продажам и ручным начислениям."
        extra={
          canManage ? (
            <Button type="primary" icon={<FileAddOutlined />} onClick={() => setCreateOpen(true)}>
              Создать счёт
            </Button>
          ) : null
        }
      />
      <div className="list-panel">
        <div className="list-panel-header">
          <LiveSearchInput
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по владельцу, телефону, пациенту или позиции"
            className="search-input"
            onSearch={(value) => {
              setSearch(value.trim());
            }}
          />
          <Space wrap>
            <Select
              allowClear
              className="status-filter"
              placeholder="Статус"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
              }}
              options={[
                { value: 'DEBT', label: 'С долгом' },
                ...Object.entries(paymentStatusLabels).map(([value, label]) => ({ value, label })),
              ]}
            />
            <Select
              allowClear
              className="status-filter"
              placeholder="Источник"
              value={source}
              onChange={(value) => {
                setSource(value);
              }}
              options={Object.entries(billSourceLabels).map(([value, label]) => ({ value, label }))}
            />
            <Select
              allowClear
              className="status-filter"
              placeholder="Сумма"
              value={amountFilter}
              onChange={(value) => {
                setAmountFilter(value);
              }}
              options={[
                { value: 'ZERO', label: 'Только нулевые' },
                { value: 'POSITIVE', label: 'С суммой больше нуля' },
              ]}
            />
          </Space>
        </div>
        <div className="list-panel-body">
          <Space direction="vertical" size={16} className="full-width">
            {(canManage || canManagePayments) && billsTotal > 0 ? (
              <Alert
                className="bill-bulk-alert"
                type={selectedBillIds.length ? 'info' : 'warning'}
                showIcon
                message={selectedBillIds.length ? `Выбрано счетов: ${selectedBillIds.length}` : 'Выберите счета галочками или выберите все найденные'}
                description="Массовая отмена доступна только для счетов без оплат. Массовая оплата полностью погашает остаток каждого выбранного счёта."
                action={(
                  <Space wrap>
                    <Button loading={selectAllMutation.isPending} onClick={() => selectAllMutation.mutate()}>
                      Выбрать все найденные ({billsTotal})
                    </Button>
                    {selectedBillIds.length ? <Button onClick={() => setSelectedBillIds([])}>Снять выбор</Button> : null}
                    {selectedBillIds.length && canManagePayments ? (
                      <Button type="primary" onClick={() => setBulkPaymentOpen(true)}>Оплатить выбранные</Button>
                    ) : null}
                    {selectedBillIds.length && canManage ? (
                      <Button danger loading={bulkCancelMutation.isPending} onClick={confirmBulkCancellation}>Отменить выбранные</Button>
                    ) : null}
                  </Space>
                )}
              />
            ) : null}
            <InfiniteTable<BillListItem>
              query={billsQuery}
              errorText={billsQuery.isError ? getErrorMessage(billsQuery.error) : undefined}
              rowKey="id"
              columns={columns}
              rowSelection={canManage || canManagePayments ? {
                selectedRowKeys: selectedBillIds,
                preserveSelectedRowKeys: true,
                onChange: (keys) => setSelectedBillIds(keys.map(String)),
                getCheckboxProps: (record) => {
                  const debt = toMoneyNumber(record.totalAmount) - toMoneyNumber(record.paidAmount);
                  const cancellable = canManage && record.status !== 'CANCELLED' && toMoneyNumber(record.paidAmount) <= 0;
                  const payable = canManagePayments && record.status !== 'CANCELLED' && debt > 0;
                  return { disabled: !cancellable && !payable };
                },
              } : undefined}
              onRow={(record) => ({ onDoubleClick: () => navigate(`/bills/${record.id}`) })}
              className="dense-table"
            />
          </Space>
        </div>
      </div>
      <ManualBillDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
      <BulkPaymentModal
        open={bulkPaymentOpen}
        count={selectedBillIds.length}
        loading={bulkPayMutation.isPending}
        onClose={() => setBulkPaymentOpen(false)}
        onSubmit={(values) => bulkPayMutation.mutate(values)}
      />
    </div>
  );
}

type BulkPaymentFormValues = Omit<BulkPayBillsInput, 'billIds'>;

function BulkPaymentModal({
  open,
  count,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  count: number;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: BulkPaymentFormValues) => void;
}) {
  const [form] = Form.useForm<BulkPaymentFormValues>();
  const financeQuery = useQuery({ queryKey: ['finance', 'settings'], queryFn: getFinanceSettings, enabled: open });
  const paymentMethodId = Form.useWatch('paymentMethodId', form);
  const activePaymentMethods = financeQuery.data?.paymentMethods.filter((method) => method.isActive) ?? [];
  const activeCashboxes = financeQuery.data?.cashboxes.filter((cashbox) => cashbox.isActive) ?? [];

  useEffect(() => {
    if (open) form.resetFields();
  }, [form, open]);

  useEffect(() => {
    const method = activePaymentMethods.find((item) => item.id === paymentMethodId);
    if (method) form.setFieldValue('type', method.type);
  }, [activePaymentMethods, form, paymentMethodId]);

  return (
    <Modal
      open={open}
      title={`Полностью оплатить выбранные счета (${count})`}
      okText="Провести оплаты"
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
      width={560}
    >
      <Alert
        type="warning"
        showIcon
        message="Будет погашен весь остаток каждого выбранного счёта"
        description="Операция выполняется целиком: если хотя бы один счёт нельзя оплатить, оплаты не будут созданы ни по одному счёту."
        style={{ marginBottom: 16 }}
      />
      <Form<BulkPaymentFormValues>
        form={form}
        layout="vertical"
        initialValues={{ type: 'CASH' satisfies PaymentType }}
        onFinish={onSubmit}
      >
        <Form.Item name="paymentMethodId" label="Способ оплаты">
          <Select
            allowClear
            loading={financeQuery.isLoading}
            placeholder="Выберите способ оплаты"
            options={activePaymentMethods.map((method) => ({ value: method.id, label: method.title }))}
          />
        </Form.Item>
        <Form.Item name="type" label="Тип оплаты" rules={[{ required: true, message: 'Выберите тип оплаты' }]}>
          <Select
            disabled={Boolean(paymentMethodId)}
            options={Object.entries(paymentTypeLabels).map(([value, label]) => ({ value, label }))}
          />
        </Form.Item>
        <Form.Item name="cashboxId" label="Касса">
          <Select
            allowClear
            loading={financeQuery.isLoading}
            placeholder="Без кассы"
            options={activeCashboxes.map((cashbox) => ({
              value: cashbox.id,
              label: cashbox.office?.name ? `${cashbox.title} · ${cashbox.office.name}` : cashbox.title,
            }))}
          />
        </Form.Item>
        <Form.Item name="comment" label="Комментарий">
          <Input.TextArea rows={3} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function getInitialStatusFilter(searchParams: URLSearchParams): BillStatusFilter | undefined {
  if (searchParams.get('debtOnly') === 'true') {
    return 'DEBT';
  }

  const status = searchParams.get('status');
  return isPaymentStatus(status) ? status : undefined;
}

function isPaymentStatus(value: string | null): value is PaymentStatus {
  return Boolean(value && value in paymentStatusLabels);
}

const manualBillSchema = z.object({
  ownerId: z.string().min(1, 'Выберите владельца'),
  animalId: z.string().optional(),
  dueAt: z.string().optional(),
});

type ManualBillFormValues = z.infer<typeof manualBillSchema>;

function ManualBillDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [ownerSearch, setOwnerSearch] = useState('');
  const { control, handleSubmit, reset, setValue } = useForm<ManualBillFormValues>({
    resolver: zodResolver(manualBillSchema),
    defaultValues: { ownerId: '', animalId: undefined, dueAt: undefined },
  });
  const ownerId = useWatch({ control, name: 'ownerId' });
  const ownersQuery = useQuery({
    queryKey: ['owners', 'bill-select', ownerSearch],
    queryFn: () => listOwners({ search: ownerSearch, limit: 30, offset: 0 }),
    enabled: open,
  });
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals', 'bill-select'],
    queryFn: () => listOwnerAnimals(ownerId),
    enabled: open && Boolean(ownerId),
  });
  const createMutation = useMutation({
    mutationFn: (values: ManualBillFormValues) =>
      createBill({
        ownerId: values.ownerId,
        animalId: values.animalId || undefined,
        dueAt: toDueAtIso(values.dueAt),
      }),
    onSuccess: async (bill) => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] });
      message.success('Счёт создан');
      reset();
      onClose();
      navigate(`/bills/${bill.id}`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  return (
    <Modal
      title="Новый ручной счёт"
      open={open}
      okText="Создать"
      cancelText="Отмена"
      confirmLoading={createMutation.isPending}
      onCancel={onClose}
      onOk={handleSubmit((values) => createMutation.mutate(values))}
      destroyOnHidden
      width={560}
    >
      <Form layout="vertical">
          <Controller
            control={control}
            name="ownerId"
            render={({ field, fieldState }) => (
              <Form.Item label="Владелец" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Select
                  showSearch
                  filterOption={false}
                  loading={ownersQuery.isLoading}
                  value={field.value || undefined}
                  onChange={(value) => {
                    field.onChange(value);
                    setValue('animalId', undefined);
                  }}
                  onSearch={setOwnerSearch}
                  placeholder="Найдите владельца по ФИО или телефону"
                  options={ownersQuery.data?.items.map((owner) => ({ value: owner.id, label: owner.phone ? `${owner.fullName} · ${owner.phone}` : owner.fullName })) ?? []}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="animalId"
            render={({ field }) => (
              <Form.Item label="Пациент">
                <Select
                  allowClear
                  loading={animalsQuery.isLoading}
                  value={field.value || undefined}
                  onChange={field.onChange}
                  placeholder={ownerId ? 'Выберите пациента, если счёт связан с ним' : 'Сначала выберите владельца'}
                  options={animalsQuery.data?.map((animal) => ({ value: animal.id, label: animal.nickname })) ?? []}
                  disabled={!ownerId}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="dueAt"
            render={({ field }) => (
              <Form.Item label="Срок оплаты">
                <Input {...field} type="date" />
              </Form.Item>
            )}
          />
          <Typography.Text type="secondary">
            Позиции, оплату и возвраты добавляйте уже в карточке счёта.
          </Typography.Text>
      </Form>
    </Modal>
  );
}

function toDueAtIso(value: string | undefined) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : undefined;
}
