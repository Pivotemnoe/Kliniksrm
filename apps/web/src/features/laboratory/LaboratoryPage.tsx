import { CloseCircleOutlined, EditOutlined, ExperimentOutlined, FileTextOutlined, PlayCircleOutlined, PlusOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, Drawer, Form, Input, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { LiveSearchInput } from '../../shared/ui/LiveSearchInput';
import { InfiniteTable, useInfiniteListQuery } from '../../shared/ui/InfiniteTable';
import { PageHeader } from '../../shared/ui/PageHeader';
import { listDocumentTemplates } from '../documents/documents.api';
import { AttachmentsPanel } from '../files/AttachmentsPanel';
import { listLaboratoryFiles, listLaboratoryOrderFiles, uploadLaboratoryFile, uploadLaboratoryOrderFile } from '../files/files.api';
import { getOrganizationPrintProfile } from '../organization/organization.api';
import type { OrganizationPrintProfile } from '../organization/types';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { formatServicePrice } from '../stock/service-pricing';
import { cancelVisitLaboratoryOrder } from '../visits/visits.api';
import {
  laboratoryOrderItemStatusLabels,
  laboratoryOrderStatusColors,
  laboratoryOrderStatusLabels,
  VisitLaboratoryOrderItemStatus,
  VisitLaboratoryOrderStatus,
} from '../visits/types';
import {
  createLaboratoryTest,
  getLaboratoryResources,
  listLaboratoryOrders,
  listLaboratoryTests,
  updateLaboratoryOrder,
  updateLaboratoryOrderItem,
  updateLaboratoryOrderResults,
  updateLaboratoryTest,
} from './laboratory.api';
import { printLaboratoryOrder } from './laboratoryPrint';
import { LaboratoryOrder, LaboratoryOrderInput, LaboratoryOrderItem, LaboratoryOrderItemInput, LaboratoryOrderResultRowInput, LaboratoryResources, LaboratoryTest } from './types';
import { LaboratoryResultsImporter } from './LaboratoryResultsImporter';

type OrderStatusFilter = VisitLaboratoryOrderStatus | 'ACTIVE';
const nullableText = z.string().trim().optional().transform((value) => value || undefined);
const testSchema = z.object({
  title: z.string().trim().min(1, 'Укажите название анализа').max(240),
  code: nullableText,
  groupName: nullableText,
  material: nullableText,
  method: nullableText,
  species: z.array(z.string()).optional(),
  serviceId: z.string().trim().min(1, 'Выберите платную услугу'),
  documentTemplateId: z.string().trim().min(1, 'Выберите документ с таблицей показателей'),
  isActive: z.boolean().default(true),
  description: nullableText,
});
const resultSchema = z.object({
  status: z.enum(['ORDERED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  resultValue: z.string().trim().max(120).optional(),
  resultText: z.string().trim().max(2000).optional(),
  unit: z.string().trim().max(80).optional(),
  referenceRange: z.string().trim().max(500).optional(),
  comment: z.string().trim().max(1000).optional(),
});

type TestFormInput = z.input<typeof testSchema>;
type TestFormValues = z.output<typeof testSchema>;
type ResultFormInput = z.input<typeof resultSchema>;
type ResultFormValues = z.output<typeof resultSchema>;

export function LaboratoryPage() {
  const { data: auth } = useCurrentEmployee();
  const [searchParams] = useSearchParams();
  const canManage = hasPermission(auth?.employee, 'laboratory.manage');
  const canConfigureTests =
    hasPermission(auth?.employee, 'laboratory.read') || canManage || hasPermission(auth?.employee, 'visits.manage');
  const canEditDocuments = hasPermission(auth?.employee, 'documents.manage');
  const canPrintDocuments = hasPermission(auth?.employee, 'documents.print');
  const [activeTab, setActiveTab] = useState(() => getInitialTab(searchParams.get('tab')));
  const [search, setSearch] = useState('');
  const [species, setSpecies] = useState<string | undefined>();
  const [orderStatus, setOrderStatus] = useState<OrderStatusFilter | undefined>(() => getInitialOrderStatus(searchParams.get('status')));
  const [fromDate, setFromDate] = useState(searchParams.get('from') ?? '');
  const [toDate, setToDate] = useState(searchParams.get('to') ?? '');
  const [selectedOrder, setSelectedOrder] = useState<LaboratoryOrder | null>(null);
  const [tableOrder, setTableOrder] = useState<LaboratoryOrder | null>(null);
  const [editingItem, setEditingItem] = useState<{ order: LaboratoryOrder; item: LaboratoryOrderItem } | null>(null);
  const [editingTest, setEditingTest] = useState<LaboratoryTest | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const resourcesQuery = useQuery({ queryKey: ['laboratory', 'resources'], queryFn: getLaboratoryResources });
  const organizationQuery = useQuery({
    queryKey: ['organization', 'print-profile'],
    queryFn: getOrganizationPrintProfile,
    enabled: canPrintDocuments,
  });

  function handleSearch(value: string) {
    setSearch(value.trim());
  }

  return (
    <div className="page">
      <PageHeader
        title="Лаборатории"
        description="Рабочий журнал лабораторных заказов, результаты и справочник анализов."
        extra={
          canConfigureTests ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openTest(null)}>
              Связать услугу и документ
            </Button>
          ) : null
        }
      />
      <LaboratoryWorkSummary
        onSelectActive={() => {
          setActiveTab('orders');
          setOrderStatus('ACTIVE');
          setFromDate('');
          setToDate('');
        }}
        onSelectOrdered={() => {
          setActiveTab('orders');
          setOrderStatus('ORDERED');
          setFromDate('');
          setToDate('');
        }}
        onSelectInProgress={() => {
          setActiveTab('orders');
          setOrderStatus('IN_PROGRESS');
          setFromDate('');
          setToDate('');
        }}
        onSelectCompletedToday={() => {
          const today = toDateInput(new Date());
          setActiveTab('orders');
          setOrderStatus('COMPLETED');
          setFromDate(today);
          setToDate(today);
        }}
      />
      <div className="list-panel">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
          }}
          tabBarExtraContent={
            <Space wrap>
              {activeTab === 'orders' ? (
                <>
                  <Select
                    allowClear
                    placeholder="Статус"
                    className="status-filter"
                    value={orderStatus}
                    onChange={(value) => {
                      setOrderStatus(value);
                    }}
                    options={[
                      { value: 'ACTIVE', label: 'Активные' },
                      ...Object.entries(laboratoryOrderStatusLabels).map(([value, label]) => ({ value, label })),
                    ]}
                  />
                  <Input
                    type="date"
                    className="date-filter"
                    value={fromDate}
                    onChange={(event) => {
                      setFromDate(event.target.value);
                    }}
                    aria-label="Лабораторные заказы с даты"
                  />
                  <Input
                    type="date"
                    className="date-filter"
                    value={toDate}
                    onChange={(event) => {
                      setToDate(event.target.value);
                    }}
                    aria-label="Лабораторные заказы по дату"
                  />
                </>
              ) : (
                <Select
                  allowClear
                  placeholder="Вид животного"
                  className="status-filter"
                  value={species}
                  onChange={(value) => {
                    setSpecies(value);
                  }}
                  options={resourcesQuery.data?.species.map((item) => ({ value: item.title, label: item.title })) ?? []}
                />
              )}
              <LiveSearchInput allowClear enterButton={<SearchOutlined />} placeholder="Поиск" className="search-input" onSearch={handleSearch} />
            </Space>
          }
          items={[
            {
              key: 'orders',
              label: 'Журнал',
              children: (
                <OrdersTable
                  search={search}
                  status={orderStatus}
                  fromDate={fromDate}
                  toDate={toDate}
                  canManage={canManage}
                  onOpenOrder={setSelectedOrder}
                  onEditResults={setTableOrder}
                  onEditItem={(order, item) => setEditingItem({ order, item })}
                />
              ),
            },
            {
              key: 'tests',
              label: 'Анализы',
              children: (
                <TestsTable
                  search={search}
                  species={species}
                  canManage={canConfigureTests}
                  onEdit={openTest}
                />
              ),
            },
          ]}
        />
      </div>
      <LaboratoryTestEditorDrawer
        open={testOpen}
        test={editingTest}
        resources={resourcesQuery.data}
        canEditDocuments={canEditDocuments}
        onClose={() => setTestOpen(false)}
      />
      <OrderDrawer
        order={selectedOrder}
        canManage={canManage}
        canPrint={canPrintDocuments}
        organization={organizationQuery.data}
        onClose={() => setSelectedOrder(null)}
        onEditResults={setTableOrder}
        onEditItem={(order, item) => setEditingItem({ order, item })}
      />
      <ResultsTableDrawer order={tableOrder} canManage={canManage} onClose={() => setTableOrder(null)} />
      <ResultDrawer target={editingItem} canManage={canManage} onClose={() => setEditingItem(null)} />
    </div>
  );

  function openTest(test: LaboratoryTest | null) {
    setEditingTest(test);
    setTestOpen(true);
  }
}

function LaboratoryWorkSummary({
  onSelectActive,
  onSelectOrdered,
  onSelectInProgress,
  onSelectCompletedToday,
}: {
  onSelectActive: () => void;
  onSelectOrdered: () => void;
  onSelectInProgress: () => void;
  onSelectCompletedToday: () => void;
}) {
  const today = useMemo(() => toDateInput(new Date()), []);
  const activeQuery = useQuery({
    queryKey: ['laboratory', 'orders', 'summary', 'active'],
    queryFn: () => listLaboratoryOrders({ activeOnly: true, limit: 1, offset: 0 }),
  });
  const orderedQuery = useQuery({
    queryKey: ['laboratory', 'orders', 'summary', 'ordered'],
    queryFn: () => listLaboratoryOrders({ status: 'ORDERED', limit: 1, offset: 0 }),
  });
  const inProgressQuery = useQuery({
    queryKey: ['laboratory', 'orders', 'summary', 'in-progress'],
    queryFn: () => listLaboratoryOrders({ status: 'IN_PROGRESS', limit: 1, offset: 0 }),
  });
  const completedTodayQuery = useQuery({
    queryKey: ['laboratory', 'orders', 'summary', 'completed-today', today],
    queryFn: () => listLaboratoryOrders({ status: 'COMPLETED', from: today, to: today, limit: 1, offset: 0 }),
  });

  return (
    <div className="laboratory-work-strip">
      <LaboratoryWorkTile title="Активные" value={activeQuery.data?.total ?? 0} hint="Назначены или в работе" loading={activeQuery.isLoading} onClick={onSelectActive} />
      <LaboratoryWorkTile title="Назначено" value={orderedQuery.data?.total ?? 0} hint="Ждут забора или запуска" loading={orderedQuery.isLoading} onClick={onSelectOrdered} />
      <LaboratoryWorkTile title="В работе" value={inProgressQuery.data?.total ?? 0} hint="Результат ещё не готов" loading={inProgressQuery.isLoading} onClick={onSelectInProgress} />
      <LaboratoryWorkTile title="Готово сегодня" value={completedTodayQuery.data?.total ?? 0} hint="Завершённые за день" loading={completedTodayQuery.isLoading} onClick={onSelectCompletedToday} />
    </div>
  );
}

function LaboratoryWorkTile({
  title,
  value,
  hint,
  loading,
  onClick,
}: {
  title: string;
  value: number;
  hint: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="laboratory-work-tile" onClick={onClick}>
      <span>{title}</span>
      <strong>{loading ? '...' : value}</strong>
      <small>{hint}</small>
    </button>
  );
}

function OrdersTable({
  search,
  status,
  fromDate,
  toDate,
  canManage,
  onOpenOrder,
  onEditResults,
  onEditItem,
}: {
  search: string;
  status?: OrderStatusFilter;
  fromDate?: string;
  toDate?: string;
  canManage: boolean;
  onOpenOrder: (order: LaboratoryOrder) => void;
  onEditResults: (order: LaboratoryOrder) => void;
  onEditItem: (order: LaboratoryOrder, item: LaboratoryOrderItem) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const query = useInfiniteListQuery({
    queryKey: ['laboratory', 'orders', { search, status, fromDate, toDate }],
    queryFn: ({ limit, offset }) =>
      listLaboratoryOrders({
        search,
        status: status && status !== 'ACTIVE' ? status : undefined,
        activeOnly: status === 'ACTIVE' ? true : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        limit,
        offset,
      }),
  });
  const statusMutation = useMutation({
    mutationFn: ({ order, input }: { order: LaboratoryOrder; input: LaboratoryOrderInput }) => updateLaboratoryOrder(order.id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      message.success('Статус лабораторного заказа обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const cancelMutation = useMutation({
    mutationFn: (order: LaboratoryOrder) => cancelVisitLaboratoryOrder(order.visit.id, order.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      message.success('Лабораторный заказ отменён, счёт пересчитан');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<LaboratoryOrder>>(
    () => [
      {
        title: 'Дата',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 150,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: 'Пациент',
        key: 'patient',
        width: 260,
        render: (_, order) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{order.visit.animal.nickname}</Typography.Text>
            <Typography.Text type="secondary">
              {[order.visit.animal.species, order.visit.animal.breed].filter(Boolean).join(', ') || 'Вид не указан'}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Владелец',
        key: 'owner',
        width: 260,
        render: (_, order) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{order.visit.owner.fullName}</Typography.Text>
            <Typography.Text type="secondary">{order.visit.owner.phone || 'Телефон не указан'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Анализы',
        key: 'items',
        render: (_, order) => (
          <Space direction="vertical" size={2}>
            <Typography.Text>{formatOrderItems(order.items)}</Typography.Text>
            <Typography.Text type="secondary">{formatOrderProgress(order.items)}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Врач',
        key: 'employee',
        width: 210,
        render: (_, order) => order.visit.employee?.fullName ?? '—',
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: VisitLaboratoryOrderStatus) => <Tag color={laboratoryOrderStatusColors[value]}>{laboratoryOrderStatusLabels[value]}</Tag>,
      },
      {
        title: '',
        key: 'actions',
        width: 240,
        render: (_, order) => (
          <Space wrap>
            {canManage && order.status === 'ORDERED' ? (
              <Button size="small" icon={<PlayCircleOutlined />} loading={statusMutation.isPending} onClick={() => statusMutation.mutate({ order, input: { status: 'IN_PROGRESS' } })}>
                В работу
              </Button>
            ) : null}
            <Button size="small" icon={<ExperimentOutlined />} onClick={() => onOpenOrder(order)}>
              Открыть
            </Button>
            <Button size="small" onClick={() => navigate(`/visits/${order.visit.id}`)}>
              Приём
            </Button>
            {canManage && order.status !== 'CANCELLED' ? (
              <Button size="small" icon={<EditOutlined />} onClick={() => onEditResults(order)}>
                Заполнить таблицу
              </Button>
            ) : null}
            {canManage && order.status !== 'CANCELLED' ? (
              <Popconfirm
                title="Отменить лабораторный заказ?"
                description="Связанное начисление будет отменено, счёт пересчитается."
                okText="Отменить заказ"
                cancelText="Назад"
                onConfirm={() => cancelMutation.mutate(order)}
              >
                <Button danger size="small" icon={<CloseCircleOutlined />} loading={cancelMutation.isPending}>
                  Отменить
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [canManage, cancelMutation, navigate, onEditResults, onOpenOrder, statusMutation],
  );

  return (
    <div className="list-panel-body">
      {query.isError ? <Alert type="error" showIcon message={getErrorMessage(query.error)} className="form-alert" /> : null}
      <InfiniteTable<LaboratoryOrder>
        query={query}
        errorText={query.isError ? getErrorMessage(query.error) : undefined}
        rowKey="id"
        columns={columns}
        className="dense-table"
        scroll={{ x: 1390 }}
        onRow={(order) => ({ onDoubleClick: () => onOpenOrder(order) })}
      />
    </div>
  );
}

function OrderDrawer({
  order,
  canManage,
  canPrint,
  organization,
  onClose,
  onEditResults,
  onEditItem,
}: {
  order: LaboratoryOrder | null;
  canManage: boolean;
  canPrint: boolean;
  organization?: OrganizationPrintProfile;
  onClose: () => void;
  onEditResults: (order: LaboratoryOrder) => void;
  onEditItem: (order: LaboratoryOrder, item: LaboratoryOrderItem) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const cancelMutation = useMutation({
    mutationFn: (currentOrder: LaboratoryOrder) => cancelVisitLaboratoryOrder(currentOrder.visit.id, currentOrder.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      message.success('Лабораторный заказ отменён');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const columns = useMemo<ColumnsType<LaboratoryOrderItem>>(
    () => [
      {
        title: 'Анализ',
        dataIndex: 'title',
        key: 'title',
        render: (value, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{value}</Typography.Text>
            {item.code || item.groupName ? <Typography.Text type="secondary">{[item.code, item.groupName].filter(Boolean).join(' · ')}</Typography.Text> : null}
            {item.profile ? <Tag>{item.profile.title}</Tag> : null}
          </Space>
        ),
      },
      { title: 'Результат', key: 'result', render: (_, item) => item.resultValue || item.resultText || '—' },
      { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 90, render: fallback },
      { title: 'Референс', dataIndex: 'referenceRange', key: 'referenceRange', width: 150, render: fallback },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: VisitLaboratoryOrderItemStatus) => <Tag>{laboratoryOrderItemStatusLabels[value]}</Tag>,
      },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_, item) =>
          canManage && order ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => onEditItem(order, item)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage, onEditItem, order],
  );

  return (
    <Drawer title="Лабораторный заказ" open={Boolean(order)} onClose={onClose} width={900} destroyOnHidden>
      {order ? (
        <Space direction="vertical" size={16} className="full-width">
          <Card size="small">
            <Space direction="vertical" size={8} className="full-width">
              <Space wrap>
                <Tag color={laboratoryOrderStatusColors[order.status]}>{laboratoryOrderStatusLabels[order.status]}</Tag>
                <Typography.Text>{formatDateTime(order.createdAt)}</Typography.Text>
                {order.completedAt ? <Typography.Text type="secondary">Завершён: {formatDateTime(order.completedAt)}</Typography.Text> : null}
              </Space>
              <Space wrap size={16}>
                <Typography.Text strong>{order.visit.animal.nickname}</Typography.Text>
                <Typography.Text>{order.visit.owner.fullName}</Typography.Text>
                <Typography.Text type="secondary">{order.visit.owner.phone || 'Телефон не указан'}</Typography.Text>
                <Typography.Text type="secondary">{order.visit.employee?.fullName ?? 'Врач не указан'}</Typography.Text>
              </Space>
              {order.comment ? <Typography.Paragraph>{order.comment}</Typography.Paragraph> : null}
              <Space wrap>
                <Button size="small" onClick={() => navigate(`/visits/${order.visit.id}`)}>
                  Открыть приём
                </Button>
                {canPrint ? (
                  <Button size="small" icon={<PrinterOutlined />} onClick={() => printLaboratoryOrder(order, organization)}>
                    Печать A5
                  </Button>
                ) : null}
                {canManage && order.status !== 'CANCELLED' ? (
                  <Button type="primary" size="small" icon={<EditOutlined />} onClick={() => onEditResults(order)}>
                    Заполнить таблицу
                  </Button>
                ) : null}
                {canManage && order.status !== 'CANCELLED' ? (
                  <Popconfirm
                    title="Отменить лабораторный заказ?"
                    description="Связанное начисление будет отменено, счёт пересчитается."
                    okText="Отменить заказ"
                    cancelText="Назад"
                    onConfirm={() => cancelMutation.mutate(order)}
                  >
                    <Button danger size="small" icon={<CloseCircleOutlined />} loading={cancelMutation.isPending}>
                      Отменить
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
              {canManage && order.status !== 'CANCELLED' ? <LaboratoryResultsImporter order={order} /> : null}
            </Space>
          </Card>
          <Table<LaboratoryOrderItem>
            rowKey="id"
            columns={columns}
            dataSource={order.items}
            pagination={false}
            className="dense-table"
            scroll={{ x: 980 }}
          />
          <Card size="small" title="Файлы всего лабораторного заказа">
            <AttachmentsPanel
              queryKey={['laboratory', 'order-files', order.id]}
              listFiles={() => listLaboratoryOrderFiles(order.id)}
              uploadFile={(file) => uploadLaboratoryOrderFile(order.id, file)}
              canManage={canManage && order.status !== 'CANCELLED'}
              description="Исходные таблицы, общий лабораторный бланк и сопроводительные материалы по этому заказу."
            />
          </Card>
        </Space>
      ) : null}
    </Drawer>
  );
}

function ResultDrawer({
  target,
  canManage,
  onClose,
}: {
  target: { order: LaboratoryOrder; item: LaboratoryOrderItem } | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const form = useForm<ResultFormInput, unknown, ResultFormValues>({
    resolver: zodResolver(resultSchema),
    defaultValues: getResultDefaults(null),
  });
  const mutation = useMutation({
    mutationFn: (values: LaboratoryOrderItemInput) => updateLaboratoryOrderItem(target!.order.id, target!.item.id, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      message.success('Результат анализа сохранён');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    form.reset(getResultDefaults(target?.item ?? null));
  }, [form, target]);

  return (
    <Drawer title={target?.item.title ?? 'Результат анализа'} open={Boolean(target)} onClose={onClose} width={620} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        {mutation.error ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Form.Item label="Статус">
              <Select {...field} options={Object.entries(laboratoryOrderItemStatusLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          )}
        />
        <Controller control={form.control} name="resultValue" render={({ field }) => <Form.Item label="Значение"><Input {...field} /></Form.Item>} />
        <Controller control={form.control} name="unit" render={({ field }) => <Form.Item label="Единица"><Input {...field} /></Form.Item>} />
        <Controller control={form.control} name="referenceRange" render={({ field }) => <Form.Item label="Референс"><Input {...field} /></Form.Item>} />
        <Controller control={form.control} name="resultText" render={({ field }) => <Form.Item label="Текст результата"><Input.TextArea {...field} rows={4} /></Form.Item>} />
        <Controller control={form.control} name="comment" render={({ field }) => <Form.Item label="Комментарий"><Input.TextArea {...field} rows={3} /></Form.Item>} />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Сохранить результат
        </Button>
      </Form>
      {target ? (
        <Card size="small" title="Бланк и материалы результата" style={{ marginTop: 20 }}>
          <AttachmentsPanel
            queryKey={['laboratory', 'files', target.order.id, target.item.id]}
            listFiles={() => listLaboratoryFiles(target.order.id, target.item.id)}
            uploadFile={(file) => uploadLaboratoryFile(target.order.id, target.item.id, file)}
            canManage={canManage}
            description="Приложите бланк лаборатории, снимок анализатора или таблицу результата. PDF, изображения, DOCX, XLSX/XLS/CSV — до 15 МБ."
          />
        </Card>
      ) : null}
    </Drawer>
  );
}

type ResultTableRow = LaboratoryOrderResultRowInput & {
  title: string;
  code: string | null;
  disabled: boolean;
};

function ResultsTableDrawer({
  order,
  canManage,
  onClose,
}: {
  order: LaboratoryOrder | null;
  canManage: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [rows, setRows] = useState<ResultTableRow[]>([]);
  const mutation = useMutation({
    mutationFn: (items: LaboratoryOrderResultRowInput[]) => updateLaboratoryOrderResults(order!.id, items),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['laboratory', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      message.success('Таблица результатов сохранена');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    setRows(
      order?.items.map((item) => ({
        itemId: item.id,
        title: item.title,
        code: item.code,
        status: item.status,
        resultValue: item.resultValue ?? '',
        resultText: item.resultText ?? '',
        unit: item.unit ?? '',
        referenceRange: item.referenceRange ?? '',
        comment: item.comment ?? '',
        disabled: item.status === 'CANCELLED',
      })) ?? [],
    );
  }, [order]);

  function updateRow(itemId: string, patch: Partial<ResultTableRow>) {
    setRows((current) => current.map((row) => (row.itemId === itemId ? { ...row, ...patch } : row)));
  }

  const columns = useMemo<ColumnsType<ResultTableRow>>(
    () => [
      {
        title: 'Показатель',
        key: 'indicator',
        width: 220,
        render: (_, row) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{row.title}</Typography.Text>
            {row.code ? <Typography.Text type="secondary">{row.code}</Typography.Text> : null}
          </Space>
        ),
      },
      {
        title: 'Значение',
        dataIndex: 'resultValue',
        key: 'resultValue',
        width: 145,
        render: (value, row) => (
          <Input
            value={value ?? ''}
            disabled={row.disabled}
            aria-label={`Значение ${row.title}`}
            onChange={(event) =>
              updateRow(row.itemId, {
                resultValue: event.target.value,
                ...(event.target.value.trim() && row.status === 'ORDERED' ? { status: 'COMPLETED' } : {}),
              })
            }
          />
        ),
      },
      {
        title: 'Ед.',
        dataIndex: 'unit',
        key: 'unit',
        width: 110,
        render: (value, row) => <Input value={value ?? ''} disabled={row.disabled} onChange={(event) => updateRow(row.itemId, { unit: event.target.value })} />,
      },
      {
        title: 'Референс',
        dataIndex: 'referenceRange',
        key: 'referenceRange',
        width: 230,
        render: (value, row) => <Input value={value ?? ''} disabled={row.disabled} onChange={(event) => updateRow(row.itemId, { referenceRange: event.target.value })} />,
      },
      {
        title: 'Комментарий',
        dataIndex: 'comment',
        key: 'comment',
        width: 210,
        render: (value, row) => <Input value={value ?? ''} disabled={row.disabled} onChange={(event) => updateRow(row.itemId, { comment: event.target.value })} />,
      },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 155,
        render: (value, row) => (
          <Select
            value={value}
            disabled={row.disabled}
            className="full-width"
            onChange={(status) => updateRow(row.itemId, { status })}
            options={Object.entries(laboratoryOrderItemStatusLabels)
              .filter(([status]) => status !== 'CANCELLED')
              .map(([status, label]) => ({ value: status, label }))}
          />
        ),
      },
    ],
    [],
  );

  return (
    <Drawer
      title={order ? `Результаты: ${order.visit.animal.nickname}` : 'Таблица результатов'}
      open={Boolean(order)}
      onClose={onClose}
      width="min(1280px, 96vw)"
      destroyOnHidden
      extra={
        <Button
          type="primary"
          loading={mutation.isPending}
          disabled={!canManage || !rows.some((row) => !row.disabled)}
          onClick={() => mutation.mutate(rows.map(({ title: _title, code: _code, disabled: _disabled, ...row }) => row))}
        >
          Сохранить всю таблицу
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        className="form-alert"
        message="Введите результаты прямо в строки показателей"
        description="При вводе значения строка автоматически становится готовой. Можно скорректировать единицы, референс и статус до общего сохранения. Вся таблица сохраняется одной операцией."
      />
      {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
      <Table<ResultTableRow>
        rowKey="itemId"
        columns={columns}
        dataSource={rows}
        pagination={false}
        className="dense-table laboratory-result-grid"
        scroll={{ x: 1070, y: 'calc(100vh - 250px)' }}
      />
    </Drawer>
  );
}

function TestsTable({
  search,
  species,
  canManage,
  onEdit,
}: {
  search: string;
  species?: string;
  canManage: boolean;
  onEdit: (test: LaboratoryTest) => void;
}) {
  const query = useInfiniteListQuery({
    queryKey: ['laboratory', 'tests', { search, species }],
    queryFn: ({ limit, offset }) => listLaboratoryTests({ search, species, limit, offset }),
  });
  const columns = useMemo<ColumnsType<LaboratoryTest>>(
    () => [
      { title: 'Анализ', dataIndex: 'title', key: 'title', render: (value, item) => <TitleCell title={value} code={item.code} /> },
      { title: 'Группа', dataIndex: 'groupName', key: 'groupName', width: 150, render: fallback },
      { title: 'Материал', dataIndex: 'material', key: 'material', width: 140, render: fallback },
      { title: 'Метод', dataIndex: 'method', key: 'method', width: 140, render: fallback },
      { title: 'Виды', dataIndex: 'species', key: 'species', width: 180, render: renderSpecies },
      {
        title: 'Документ результатов',
        key: 'document',
        width: 260,
        render: (_, item) => item.documentTemplate ? (
          <Space direction="vertical" size={0}>
            <Typography.Text>{item.documentTemplate.title}</Typography.Text>
            <Typography.Text type="secondary">Версия {item.documentTemplate.currentVersion}</Typography.Text>
          </Space>
        ) : <Tag color="red">Не привязан</Tag>,
      },
      { title: 'Платная услуга', key: 'service', render: (_, item) => item.service ? `${item.service.title} · ${formatServicePrice(item.service)}` : <Tag color="red">Не привязана</Tag> },
      { title: 'Статус', dataIndex: 'isActive', key: 'isActive', width: 110, render: activeTag },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_, item) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(item)}>
              Настроить
            </Button>
          ) : null,
      },
    ],
    [canManage, onEdit],
  );

  return (
    <div className="list-panel-body">
      {query.isError ? <Alert type="error" showIcon message={getErrorMessage(query.error)} className="form-alert" /> : null}
      <InfiniteTable<LaboratoryTest>
        query={query}
        errorText={query.isError ? getErrorMessage(query.error) : undefined}
        rowKey="id"
        columns={columns}
        className="dense-table"
        scroll={{ x: 1240 }}
      />
    </div>
  );
}

export function LaboratoryTestEditorDrawer({
  open,
  test,
  resources,
  canEditDocuments,
  onClose,
}: {
  open: boolean;
  test: LaboratoryTest | null;
  resources?: LaboratoryResources;
  canEditDocuments: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const documentsQuery = useQuery({
    queryKey: ['document-templates', 'laboratory-select'],
    queryFn: listDocumentTemplates,
    enabled: open,
  });
  const form = useForm<TestFormInput, unknown, TestFormValues>({ resolver: zodResolver(testSchema), defaultValues: getTestDefaults(test) });
  const selectedDocumentTemplateId = form.watch('documentTemplateId');
  const mutation = useMutation({
    mutationFn: (values: TestFormValues) => test ? updateLaboratoryTest(test.id, values) : createLaboratoryTest(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['laboratory', 'tests'] });
      message.success(test ? 'Анализ обновлён' : 'Анализ создан');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    form.reset(getTestDefaults(test));
  }, [form, test, open]);

  return (
    <Drawer title={test ? 'Связь услуги и документа' : 'Новая связь услуги и документа'} open={open} onClose={onClose} width={620} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        <Alert
          type="info"
          showIcon
          className="form-alert"
          message="Свяжите услугу с документом результатов"
          description="Цена берётся из услуги. Показатели, нормы и печатный вид берутся из выбранного документа. Название связи, услугу и документ можно изменить в любой момент."
        />
        <FormInput control={form.control} name="title" label="Название в лаборатории" />
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="code" label="Код" />
          <FormInput control={form.control} name="groupName" label="Группа" />
        </Space>
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="material" label="Биоматериал" />
          <FormInput control={form.control} name="method" label="Метод" />
        </Space>
        <SpeciesSelect control={form.control} resources={resources} />
        <ServiceSelect control={form.control} resources={resources} />
        <Controller
          control={form.control}
          name="documentTemplateId"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Документ с показателями"
              required
              validateStatus={fieldState.error ? 'error' : undefined}
              help={fieldState.error?.message ?? 'Этот же документ откроется для внесения результатов и будет напечатан на A5.'}
            >
              <Select
                {...field}
                showSearch
                optionFilterProp="label"
                loading={documentsQuery.isLoading}
                placeholder="Выберите существующий документ"
                options={(documentsQuery.data ?? [])
                  .filter((document) => hasDocumentResultTable(document.layout))
                  .map((document) => ({
                    value: document.id,
                    label: `${document.title}${document.category?.title ? ` · ${document.category.title}` : ''}`,
                  }))}
              />
            </Form.Item>
          )}
        />
        {canEditDocuments ? (
          <Button
            block
            icon={<FileTextOutlined />}
            disabled={!selectedDocumentTemplateId}
            onClick={() => {
              window.open(
                `/settings/documents?tab=documents&templateId=${encodeURIComponent(selectedDocumentTemplateId)}`,
                '_blank',
                'noopener,noreferrer',
              );
            }}
          >
            Открыть редактор выбранного документа
          </Button>
        ) : null}
        {documentsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(documentsQuery.error)} className="form-alert" /> : null}
        <FormInput control={form.control} name="description" label="Описание" textarea />
        <ActiveSwitch control={form.control} />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Сохранить
        </Button>
      </Form>
    </Drawer>
  );
}

function TitleCell({ title, code }: { title: string; code?: string | null }) {
  return (
    <Space direction="vertical" size={0}>
      <Typography.Text strong>{title}</Typography.Text>
      {code ? <Typography.Text type="secondary">{code}</Typography.Text> : null}
    </Space>
  );
}

function FormInput({ control, name, label, textarea }: { control: any; name: string; label: string; textarea?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          {textarea ? <Input.TextArea {...field} rows={3} /> : <Input {...field} />}
        </Form.Item>
      )}
    />
  );
}

function SpeciesSelect({ control, resources }: { control: any; resources?: LaboratoryResources }) {
  return (
    <Controller
      control={control}
      name="species"
      render={({ field, fieldState }) => (
        <Form.Item label="Виды животных" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          <Select
            {...field}
            mode="tags"
            placeholder="Все виды"
            options={resources?.species.map((item) => ({ value: item.title, label: item.title })) ?? []}
          />
        </Form.Item>
      )}
    />
  );
}

function ServiceSelect({ control, resources }: { control: any; resources?: LaboratoryResources }) {
  return (
    <Controller
      control={control}
      name="serviceId"
      render={({ field, fieldState }) => (
        <Form.Item label="Услуга и цена" required validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message ?? 'По этой услуге анализ попадёт в счёт приёма.'}>
          <Select
            {...field}
            showSearch
            optionFilterProp="label"
            placeholder="Выберите услугу и цену"
            options={resources?.services.map((item) => ({ value: item.id, label: `${item.title} · ${formatServicePrice(item)}` })) ?? []}
          />
        </Form.Item>
      )}
    />
  );
}

function ActiveSwitch({ control }: { control: any }) {
  return (
    <Controller
      control={control}
      name="isActive"
      render={({ field }) => (
        <Form.Item label="Активен">
          <Switch checked={field.value} onChange={field.onChange} />
        </Form.Item>
      )}
    />
  );
}

function getTestDefaults(test: LaboratoryTest | null): TestFormInput {
  return {
    title: test?.title ?? '',
    code: test?.code ?? '',
    groupName: test?.groupName ?? '',
    material: test?.material ?? '',
    method: test?.method ?? '',
    species: test?.species ?? [],
    serviceId: test?.serviceId ?? '',
    documentTemplateId: test?.documentTemplateId ?? '',
    isActive: test?.isActive ?? true,
    description: test?.description ?? '',
  };
}

function getResultDefaults(item: LaboratoryOrderItem | null): ResultFormInput {
  return {
    status: item?.status ?? 'ORDERED',
    resultValue: item?.resultValue ?? '',
    resultText: item?.resultText ?? '',
    unit: item?.unit ?? '',
    referenceRange: item?.referenceRange ?? '',
    comment: item?.comment ?? '',
  };
}

function formatOrderItems(items: LaboratoryOrderItem[]) {
  if (!items.length) {
    return 'Анализы не добавлены';
  }

  const titles = items.map((item) => item.title);
  return titles.length > 3 ? `${titles.slice(0, 3).join(', ')} и ещё ${titles.length - 3}` : titles.join(', ');
}

function formatOrderProgress(items: LaboratoryOrderItem[]) {
  if (!items.length) {
    return '0 анализов';
  }

  const completed = items.filter((item) => item.status === 'COMPLETED').length;
  const inProgress = items.filter((item) => item.status === 'IN_PROGRESS').length;
  const cancelled = items.filter((item) => item.status === 'CANCELLED').length;
  const parts = [`${completed}/${items.length} готово`];

  if (inProgress) {
    parts.push(`${inProgress} в работе`);
  }

  if (cancelled) {
    parts.push(`${cancelled} отменено`);
  }

  return parts.join(' · ');
}

function renderSpecies(values: string[]) {
  return values.length ? (
    <Space wrap size={4}>
      {values.map((value) => (
        <Tag key={value}>{value}</Tag>
      ))}
    </Space>
  ) : (
    'Все'
  );
}

function activeTag(value: boolean) {
  return value ? <Tag color="green">Активен</Tag> : <Tag>Выключен</Tag>;
}

function fallback(value?: string | null) {
  return value || '—';
}

function getInitialTab(value: string | null) {
  return value === 'tests' ? value : 'orders';
}

function hasDocumentResultTable(layout: { blocks?: Array<{ type?: string; rows?: string[][] }> } | null) {
  return Boolean(layout?.blocks?.some((block) => block.type === 'table' && Array.isArray(block.rows) && block.rows.length > 1));
}

function getInitialOrderStatus(value: string | null): OrderStatusFilter | undefined {
  if (value === 'active') {
    return 'ACTIVE';
  }

  if (value && value in laboratoryOrderStatusLabels) {
    return value as VisitLaboratoryOrderStatus;
  }

  return undefined;
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
