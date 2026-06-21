import { FileAddOutlined, SearchOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDate, formatDateTime } from '../../shared/utils/date';
import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import { createBill, listBills } from './billing.api';
import {
  BillListItem,
  BillSource,
  PaymentStatus,
  billSourceLabels,
  paymentStatusColors,
  paymentStatusLabels,
} from './types';

const pageSize = 10;
type BillStatusFilter = PaymentStatus | 'DEBT';

export function BillsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'billing.manage');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<BillStatusFilter | undefined>(() => getInitialStatusFilter(searchParams));
  const [source, setSource] = useState<BillSource | undefined>();
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const status = statusFilter === 'DEBT' ? undefined : statusFilter;
  const debtOnly = statusFilter === 'DEBT';
  const billsQuery = useQuery({
    queryKey: ['bills', { search, status, debtOnly, source, limit: pageSize, offset }],
    queryFn: () => listBills({ search, status, debtOnly, source, limit: pageSize, offset }),
  });

  useEffect(() => {
    setStatusFilter(getInitialStatusFilter(searchParams));
    setOffset(0);
  }, [searchParams]);

  const columns = useMemo<ColumnsType<BillListItem>>(
    () => [
      {
        title: 'Счёт',
        key: 'bill',
        render: (_, record) => (
          <Button type="link" className="table-link" onClick={() => navigate(`/bills/${record.id}`)}>
            {record.id.slice(0, 8)}
          </Button>
        ),
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
    [navigate],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
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
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="Поиск по владельцу, телефону, пациенту или позиции"
            className="search-input"
            onSearch={(value) => {
              setSearch(value.trim());
              setOffset(0);
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
                setOffset(0);
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
                setOffset(0);
              }}
              options={Object.entries(billSourceLabels).map(([value, label]) => ({ value, label }))}
            />
          </Space>
        </div>
        <div className="list-panel-body">
          <Space direction="vertical" size={16} className="full-width">
            {billsQuery.isError ? <Typography.Text type="danger">{getErrorMessage(billsQuery.error)}</Typography.Text> : null}
            <Table<BillListItem>
              rowKey="id"
              columns={columns}
              dataSource={billsQuery.data?.items ?? []}
              loading={billsQuery.isLoading}
              pagination={{ current: offset / pageSize + 1, pageSize, total: billsQuery.data?.total ?? 0, showSizeChanger: false }}
              onChange={handleTableChange}
              onRow={(record) => ({ onDoubleClick: () => navigate(`/bills/${record.id}`) })}
              className="dense-table"
            />
          </Space>
        </div>
      </div>
      <ManualBillDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
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
