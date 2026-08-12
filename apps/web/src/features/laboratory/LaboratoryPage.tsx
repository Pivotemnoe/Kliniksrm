import { CloseCircleOutlined, EditOutlined, ExperimentOutlined, PlayCircleOutlined, PlusOutlined, PrinterOutlined, SearchOutlined } from '@ant-design/icons';
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
  createLaboratoryProfile,
  createLaboratoryTest,
  getLaboratoryResources,
  listLaboratoryOrders,
  listLaboratoryProfiles,
  listLaboratoryTests,
  updateLaboratoryOrder,
  updateLaboratoryOrderItem,
  updateLaboratoryOrderResults,
  updateLaboratoryProfile,
  updateLaboratoryTest,
} from './laboratory.api';
import { LaboratoryOrder, LaboratoryOrderInput, LaboratoryOrderItem, LaboratoryOrderItemInput, LaboratoryOrderResultRowInput, LaboratoryProfile, LaboratoryResources, LaboratoryTest } from './types';
import { LaboratoryResultsImporter } from './LaboratoryResultsImporter';

type OrderStatusFilter = VisitLaboratoryOrderStatus | 'ACTIVE';
const nullableText = z.string().trim().optional().transform((value) => value || undefined);
const testSchema = z.object({
  title: z.string().trim().min(1, 'Укажите название анализа').max(240),
  code: nullableText,
  groupName: nullableText,
  material: nullableText,
  method: nullableText,
  unit: nullableText,
  referenceRange: nullableText,
  species: z.array(z.string()).optional(),
  serviceId: nullableText,
  isActive: z.boolean().default(true),
  description: nullableText,
});
const profileSchema = z.object({
  title: z.string().trim().min(1, 'Укажите название профиля').max(240),
  code: nullableText,
  description: nullableText,
  species: z.array(z.string()).optional(),
  serviceId: nullableText,
  isActive: z.boolean().default(true),
  testIds: z.array(z.string()).min(1, 'Выберите хотя бы один анализ').max(20, 'В одном профиле может быть не больше 20 анализов').default([]),
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
type ProfileFormInput = z.input<typeof profileSchema>;
type ProfileFormValues = z.output<typeof profileSchema>;
type ResultFormInput = z.input<typeof resultSchema>;
type ResultFormValues = z.output<typeof resultSchema>;

export function LaboratoryPage() {
  const { data: auth } = useCurrentEmployee();
  const [searchParams] = useSearchParams();
  const canManage = hasPermission(auth?.employee, 'laboratory.manage');
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
  const [editingProfile, setEditingProfile] = useState<LaboratoryProfile | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
          canManage ? (
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => openTest(null)}>
                Новый отдельный анализ
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openProfile(null)}>
                Новый профиль из нескольких анализов
              </Button>
            </Space>
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
                  canManage={canManage}
                  onEdit={openTest}
                />
              ),
            },
            {
              key: 'profiles',
              label: 'Профили',
              children: (
                <ProfilesTable
                  search={search}
                  species={species}
                  canManage={canManage}
                  onEdit={openProfile}
                />
              ),
            },
          ]}
        />
      </div>
      <TestDrawer
        open={testOpen}
        test={editingTest}
        resources={resourcesQuery.data}
        onClose={() => setTestOpen(false)}
        onCreateProfile={() => {
          setTestOpen(false);
          openProfile(null);
        }}
      />
      <ProfileDrawer
        open={profileOpen}
        profile={editingProfile}
        resources={resourcesQuery.data}
        onClose={() => setProfileOpen(false)}
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

  function openProfile(profile: LaboratoryProfile | null) {
    setEditingProfile(profile);
    setProfileOpen(true);
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
      { title: 'Ед.', dataIndex: 'unit', key: 'unit', width: 90, render: fallback },
      { title: 'Референс', dataIndex: 'referenceRange', key: 'referenceRange', width: 150, render: fallback },
      { title: 'Виды', dataIndex: 'species', key: 'species', width: 180, render: renderSpecies },
      { title: 'Услуга', key: 'service', render: (_, item) => item.service ? `${item.service.title} · ${formatServicePrice(item.service)}` : '—' },
      { title: 'Статус', dataIndex: 'isActive', key: 'isActive', width: 110, render: activeTag },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_, item) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(item)}>
              Открыть
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
        scroll={{ x: 1180 }}
      />
    </div>
  );
}

function ProfilesTable({
  search,
  species,
  canManage,
  onEdit,
}: {
  search: string;
  species?: string;
  canManage: boolean;
  onEdit: (profile: LaboratoryProfile) => void;
}) {
  const query = useInfiniteListQuery({
    queryKey: ['laboratory', 'profiles', { search, species }],
    queryFn: ({ limit, offset }) => listLaboratoryProfiles({ search, species, limit, offset }),
  });
  const columns = useMemo<ColumnsType<LaboratoryProfile>>(
    () => [
      { title: 'Профиль', dataIndex: 'title', key: 'title', render: (value, item) => <TitleCell title={value} code={item.code} /> },
      { title: 'Виды', dataIndex: 'species', key: 'species', width: 180, render: renderSpecies },
      {
        title: 'Состав профиля',
        key: 'tests',
        render: (_, item) => (
          <Space direction="vertical" size={2}>
            <Tag color="blue">{item.tests.length} {pluralizeAnalysis(item.tests.length)}</Tag>
            <Typography.Text>{item.tests.map((link) => link.test.title).join(', ') || 'Анализы не выбраны'}</Typography.Text>
          </Space>
        ),
      },
      { title: 'Услуга', key: 'service', render: (_, item) => item.service ? `${item.service.title} · ${formatServicePrice(item.service)}` : '—' },
      { title: 'Статус', dataIndex: 'isActive', key: 'isActive', width: 110, render: activeTag },
      {
        title: '',
        key: 'actions',
        width: 110,
        render: (_, item) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(item)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage, onEdit],
  );

  return (
    <div className="list-panel-body">
      {query.isError ? <Alert type="error" showIcon message={getErrorMessage(query.error)} className="form-alert" /> : null}
      <InfiniteTable<LaboratoryProfile>
        query={query}
        errorText={query.isError ? getErrorMessage(query.error) : undefined}
        rowKey="id"
        columns={columns}
        className="dense-table"
        scroll={{ x: 980 }}
      />
    </div>
  );
}

function TestDrawer({
  open,
  test,
  resources,
  onClose,
  onCreateProfile,
}: {
  open: boolean;
  test: LaboratoryTest | null;
  resources?: LaboratoryResources;
  onClose: () => void;
  onCreateProfile: () => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const form = useForm<TestFormInput, unknown, TestFormValues>({ resolver: zodResolver(testSchema), defaultValues: getTestDefaults(test) });
  const mutation = useMutation({
    mutationFn: (values: TestFormValues) => test ? updateLaboratoryTest(test.id, values) : createLaboratoryTest(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['laboratory', 'tests'] });
      await queryClient.invalidateQueries({ queryKey: ['laboratory', 'profiles'] });
      message.success(test ? 'Анализ обновлён' : 'Анализ создан');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    form.reset(getTestDefaults(test));
  }, [form, test, open]);

  return (
    <Drawer title={test ? 'Анализ' : 'Новый анализ'} open={open} onClose={onClose} width={620} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        {!test ? (
          <Alert
            type="info"
            showIcon
            className="form-alert"
            message="Здесь создаётся один отдельный анализ"
            description="Чтобы собрать готовую карточку из нескольких исследований и затем назначать её одной кнопкой, создайте профиль анализов."
            action={<Button onClick={onCreateProfile}>Создать профиль</Button>}
          />
        ) : null}
        <FormInput control={form.control} name="title" label="Название" />
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="code" label="Код" />
          <FormInput control={form.control} name="groupName" label="Группа" />
        </Space>
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="material" label="Биоматериал" />
          <FormInput control={form.control} name="method" label="Метод" />
        </Space>
        <Space className="form-grid-two" align="start">
          <FormInput control={form.control} name="unit" label="Единица измерения" />
          <FormInput control={form.control} name="referenceRange" label="Референс" />
        </Space>
        <SpeciesSelect control={form.control} resources={resources} />
        <ServiceSelect control={form.control} resources={resources} />
        <FormInput control={form.control} name="description" label="Описание" textarea />
        <ActiveSwitch control={form.control} />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Сохранить
        </Button>
      </Form>
    </Drawer>
  );
}

function ProfileDrawer({ open, profile, resources, onClose }: { open: boolean; profile: LaboratoryProfile | null; resources?: LaboratoryResources; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const testsQuery = useQuery({ queryKey: ['laboratory', 'tests', 'select'], queryFn: () => listLaboratoryTests({ limit: 300, offset: 0, isActive: true }) });
  const form = useForm<ProfileFormInput, unknown, ProfileFormValues>({ resolver: zodResolver(profileSchema), defaultValues: getProfileDefaults(profile) });
  const mutation = useMutation({
    mutationFn: (values: ProfileFormValues) => profile ? updateLaboratoryProfile(profile.id, values) : createLaboratoryProfile(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['laboratory', 'profiles'] });
      message.success(profile ? 'Профиль обновлён' : 'Профиль создан');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    form.reset(getProfileDefaults(profile));
  }, [form, profile, open]);

  return (
    <Drawer title={profile ? 'Профиль анализов' : 'Новый профиль анализов'} open={open} onClose={onClose} width={680} destroyOnHidden>
      <Form layout="vertical" onFinish={form.handleSubmit((values) => mutation.mutate(values))}>
        <Alert
          type="info"
          showIcon
          className="form-alert"
          message="Профиль — готовая карточка из нескольких анализов"
          description="Выберите до 20 исследований. Во время приёма достаточно назначить профиль — все входящие анализы добавятся автоматически."
        />
        <FormInput control={form.control} name="title" label="Название профиля" />
        <FormInput control={form.control} name="code" label="Код" />
        <SpeciesSelect control={form.control} resources={resources} />
        <ServiceSelect control={form.control} resources={resources} />
        <Controller
          control={form.control}
          name="testIds"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Состав профиля"
              validateStatus={fieldState.error ? 'error' : undefined}
              help={fieldState.error?.message ?? `Выбрано ${(field.value ?? []).length} из 20 анализов`}
            >
              <Select
                {...field}
                mode="multiple"
                showSearch
                maxCount={20}
                maxTagCount="responsive"
                optionFilterProp="label"
                placeholder="Выберите анализы"
                options={testsQuery.data?.items.map((item) => ({ value: item.id, label: item.code ? `${item.title} · ${item.code}` : item.title })) ?? []}
              />
            </Form.Item>
          )}
        />
        <FormInput control={form.control} name="description" label="Описание" textarea />
        <ActiveSwitch control={form.control} />
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
          Сохранить профиль
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
        <Form.Item label="Связанная услуга" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
          <Select
            {...field}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Не связана"
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
    unit: test?.unit ?? '',
    referenceRange: test?.referenceRange ?? '',
    species: test?.species ?? [],
    serviceId: test?.serviceId ?? '',
    isActive: test?.isActive ?? true,
    description: test?.description ?? '',
  };
}

function getProfileDefaults(profile: LaboratoryProfile | null): ProfileFormInput {
  return {
    title: profile?.title ?? '',
    code: profile?.code ?? '',
    description: profile?.description ?? '',
    species: profile?.species ?? [],
    serviceId: profile?.serviceId ?? '',
    isActive: profile?.isActive ?? true,
    testIds: profile?.tests.map((link) => link.testId) ?? [],
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

function pluralizeAnalysis(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'анализов';
  if (last === 1) return 'анализ';
  if (last >= 2 && last <= 4) return 'анализа';
  return 'анализов';
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
  return value === 'tests' || value === 'profiles' ? value : 'orders';
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

function printLaboratoryOrder(order: LaboratoryOrder, organization?: OrganizationPrintProfile) {
  const printWindow = window.open('', '_blank', 'width=760,height=900');
  if (!printWindow) {
    return;
  }

  const clinicName = organization?.displayName?.trim() || 'TemichevVet';
  const clinicAddress = organization?.offices?.[0]?.address || organization?.legalAddress || '';
  const clinicPhone = organization?.offices?.[0]?.phone || '';
  const logoUrl = organization?.logoUrl
    ? new URL(organization.logoUrl, window.location.href).href
    : new URL('/brand/temichevvet-logo.jpg', window.location.href).href;
  const patientDescription = [order.visit.animal.species, order.visit.animal.breed].filter(Boolean).join(', ') || 'Вид и порода не указаны';
  const rows = order.items
    .map((item) => {
      const result = item.resultValue || item.resultText || '';
      return `<tr>
        <td><strong>${escapeLaboratoryPrintHtml(item.title)}</strong>${item.code ? `<br><small>${escapeLaboratoryPrintHtml(item.code)}</small>` : ''}</td>
        <td>${escapeLaboratoryPrintHtml(result || '—')}</td>
        <td>${escapeLaboratoryPrintHtml(item.unit || '—')}</td>
        <td>${escapeLaboratoryPrintHtml(item.referenceRange || '—')}</td>
        <td>${escapeLaboratoryPrintHtml(item.comment || '—')}</td>
      </tr>`;
    })
    .join('');

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeLaboratoryPrintHtml(`Лабораторный бланк — ${order.visit.animal.nickname}`)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #142033; background: #fff; font: 9px/1.28 Arial, sans-serif; }
    .page { width: 148mm; min-height: 210mm; margin: 0 auto; padding: 7mm; }
    .header { display: grid; grid-template-columns: 16mm 1fr; gap: 4mm; align-items: center; padding-bottom: 3mm; border-bottom: 1.5px solid #21848d; }
    .logo { width: 15mm; height: 15mm; object-fit: contain; }
    .brand { font-size: 15px; font-weight: 700; color: #153958; }
    .contacts { color: #637184; font-size: 8px; }
    h1 { margin: 4mm 0 3mm; color: #153958; font-size: 15px; line-height: 1.15; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 4mm; margin-bottom: 3mm; padding: 2.5mm; border: 1px solid #ccd7df; border-radius: 2mm; }
    .meta div { display: grid; grid-template-columns: 20mm 1fr; gap: 1mm; }
    .meta span { color: #6b7888; }
    .comment { margin: 0 0 3mm; padding: 2mm; border-left: 2px solid #21848d; background: #f4f8fa; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.4px; line-height: 1.18; }
    th, td { padding: 1.2mm 1mm; border: .6px solid #9eabb7; text-align: left; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
    th { background: #eaf3f5; color: #153958; font-weight: 700; }
    th:nth-child(1) { width: 27%; }
    th:nth-child(2) { width: 22%; }
    th:nth-child(3) { width: 10%; }
    th:nth-child(4) { width: 20%; }
    th:nth-child(5) { width: 21%; }
    small { color: #6b7888; font-size: 6.8px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 8mm; }
    .signature { padding-top: 5mm; border-top: 1px solid #64748b; color: #64748b; font-size: 7.5px; }
    @page { size: A5 portrait; margin: 0; }
    @media print { .page { max-width: none; padding: 0; } tr { break-inside: avoid; } }
  </style>
</head>
<body>
  <main class="page">
    <header class="header">
      <img class="logo" src="${escapeLaboratoryPrintHtml(logoUrl)}" alt="${escapeLaboratoryPrintHtml(clinicName)}" />
      <div>
        <div class="brand">${escapeLaboratoryPrintHtml(clinicName)}</div>
        <div>Ветеринарная клиника</div>
        ${clinicAddress ? `<div class="contacts">${escapeLaboratoryPrintHtml(clinicAddress)}</div>` : ''}
        ${clinicPhone ? `<div class="contacts">${escapeLaboratoryPrintHtml(clinicPhone)}</div>` : ''}
      </div>
    </header>
    <h1>Результаты лабораторного исследования</h1>
    <section class="meta">
      <div><span>Заказ</span><strong>${escapeLaboratoryPrintHtml(formatDateTime(order.createdAt))}</strong></div>
      <div><span>Статус</span><strong>${escapeLaboratoryPrintHtml(laboratoryOrderStatusLabels[order.status])}</strong></div>
      <div><span>Пациент</span><strong>${escapeLaboratoryPrintHtml(order.visit.animal.nickname)}</strong></div>
      <div><span>Вид / порода</span><strong>${escapeLaboratoryPrintHtml(patientDescription)}</strong></div>
      <div><span>Владелец</span><strong>${escapeLaboratoryPrintHtml(order.visit.owner.fullName)}</strong></div>
      <div><span>Телефон</span><strong>${escapeLaboratoryPrintHtml(order.visit.owner.phone || '—')}</strong></div>
      <div><span>Врач</span><strong>${escapeLaboratoryPrintHtml(order.visit.employee?.fullName || '—')}</strong></div>
      <div><span>Завершён</span><strong>${escapeLaboratoryPrintHtml(order.completedAt ? formatDateTime(order.completedAt) : '—')}</strong></div>
    </section>
    ${order.comment ? `<div class="comment"><strong>Комментарий к заказу</strong><br>${escapeLaboratoryPrintHtml(order.comment)}</div>` : ''}
    <table>
      <thead><tr><th>Исследование</th><th>Результат</th><th>Ед.</th><th>Референс</th><th>Комментарий</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">Исследования не добавлены</td></tr>'}</tbody>
    </table>
    <section class="signatures">
      <div class="signature">Подпись сотрудника лаборатории</div>
      <div class="signature">Подпись врача</div>
    </section>
  </main>
  <script>
    const logo = document.querySelector('.logo');
    const startPrint = () => window.setTimeout(() => window.print(), 80);
    if (!logo || logo.complete) startPrint();
    else { logo.addEventListener('load', startPrint, { once: true }); logo.addEventListener('error', startPrint, { once: true }); }
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function escapeLaboratoryPrintHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
