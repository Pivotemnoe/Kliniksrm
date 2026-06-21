import { EditOutlined, LeftOutlined, MergeCellsOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import { listAppointments } from '../appointments/appointments.api';
import { Appointment, appointmentStatusColors, appointmentStatusLabels } from '../appointments/types';
import { listBills } from '../billing/billing.api';
import { BillListItem, PaymentType, billSourceLabels, paymentStatusColors, paymentStatusLabels, paymentTypeLabels } from '../billing/types';
import { notificationChannelLabels } from '../notifications/types';
import { listVisits } from '../visits/visits.api';
import { VisitListItem, visitStatusColors, visitStatusLabels } from '../visits/types';
import { createOwnerBalanceOperation, getOwner, listOwners, mergeOwner, updateOwner } from './owners.api';
import { OwnerAnimalsTab } from './OwnerAnimalsTab';
import { OwnerCommunicationTab } from './OwnerCommunicationTab';
import { OwnerFormDrawer } from './OwnerFormDrawer';
import { Owner, OwnerBalanceOperationInput, OwnerMutationInput } from './types';

export function OwnerCardPage() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManageOwners = hasPermission(auth?.employee, 'owners.manage');
  const canManagePayments = hasPermission(auth?.employee, 'payments.manage');
  const [editOpen, setEditOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const ownerQuery = useQuery({
    queryKey: ['owners', ownerId],
    queryFn: () => getOwner(ownerId!),
    enabled: Boolean(ownerId),
  });
  const updateMutation = useMutation({
    mutationFn: (values: OwnerMutationInput) => updateOwner(ownerId!, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
      ]);
      setEditOpen(false);
      message.success('Карточка владельца сохранена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const balanceMutation = useMutation({
    mutationFn: (values: OwnerBalanceOperationInput) => createOwnerBalanceOperation(ownerId!, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
      ]);
      setBalanceOpen(false);
      message.success('Операция баланса проведена');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const mergeMutation = useMutation({
    mutationFn: (sourceOwnerId: string) => mergeOwner(ownerId!, sourceOwnerId),
    onSuccess: async (mergedOwner) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', ownerId] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
        queryClient.invalidateQueries({ queryKey: ['animals'] }),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
        queryClient.invalidateQueries({ queryKey: ['visits'] }),
        queryClient.invalidateQueries({ queryKey: ['bills'] }),
      ]);
      setMergeOpen(false);
      message.success('Владельцы объединены');
      navigate(`/owners/${mergedOwner.id}`, { replace: true });
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const owner = ownerQuery.data;

  if (ownerQuery.isError) {
    return (
      <div className="page">
        <PageHeader title="Владелец" />
        <Card>
          <Typography.Text type="danger">{getErrorMessage(ownerQuery.error)}</Typography.Text>
        </Card>
      </div>
    );
  }

  return (
    <div className="workbench">
      <aside className="context-panel">
        <div className="context-section">
          <div className="context-section-header">
            <button className="table-link" type="button" onClick={() => navigate('/owners')}>
              <LeftOutlined /> К владельцам
            </button>
          </div>
          <div className="context-section-body">
            <h2 className="context-title">{owner?.fullName ?? 'Владелец'}</h2>
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Профиль</strong>
            <Space size={6}>
              {canManageOwners ? (
                <Button size="small" type="link" icon={<MergeCellsOutlined />} onClick={() => setMergeOpen(true)} disabled={!owner}>
                  объединить
                </Button>
              ) : null}
              <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditOpen(true)} disabled={!owner || !canManageOwners}>
                профиль
              </Button>
            </Space>
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="№ клиента" value={owner?.id} />
            <ContextRow label="Телефон" value={owner?.phone} />
            <ContextRow label="Доп. телефон" value={owner?.extraPhone} />
            <ContextRow
              label="Канал связи"
              value={owner?.preferredNotificationChannel ? notificationChannelLabels[owner.preferredNotificationChannel] : null}
            />
            <ContextRow label="Зарегистрирован" value={formatDate(owner?.createdAt)} />
            <ContextRow label="Источник" value={owner?.source} />
          </div>
        </div>
        <div className="context-section">
          <div className="context-section-header">
            <strong>Финансы</strong>
          </div>
          <div className="context-section-body context-grid">
            <ContextRow label="Баланс" value={owner ? formatMoney(owner.balance) : undefined} />
            <ContextRow label="Пациенты" value={String(owner?._count?.animals ?? owner?.animals?.length ?? 0)} />
            <ContextRow label="Приёмы" value={String(owner?._count?.visits ?? 0)} />
            <ContextRow label="Счета" value={String(owner?._count?.bills ?? 0)} />
          </div>
        </div>
      </aside>
      <main className="work-area">
        <div className="work-surface">
          {owner ? (
            <Tabs
              items={[
                {
                  key: 'animals',
                  label: 'Пациенты',
                  children: <OwnerAnimalsTab ownerId={owner.id} />,
                },
                {
                  key: 'profile',
                  label: 'Профиль',
                  children: (
                    <Descriptions bordered column={{ xs: 1, md: 2 }}>
                      <Descriptions.Item label="ФИО">{owner.fullName}</Descriptions.Item>
                      <Descriptions.Item label="Организация">{owner.organizationName || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Телефон">{owner.phone || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Доп. телефон">{owner.extraPhone || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Email">{owner.email || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Адрес">{owner.address || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Паспортные данные">{owner.passportData || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Источник">{owner.source || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Предпочтительный канал">
                        {owner.preferredNotificationChannel ? notificationChannelLabels[owner.preferredNotificationChannel] : '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Telegram chat id">{owner.telegramChatId || '—'}</Descriptions.Item>
                      <Descriptions.Item label="MAX user id">{owner.maxUserId || '—'}</Descriptions.Item>
                      <Descriptions.Item label="Разрешённые каналы">{formatAllowedChannels(owner)}</Descriptions.Item>
                      <Descriptions.Item label="Скидка на товары">{owner.goodsDiscount} %</Descriptions.Item>
                      <Descriptions.Item label="Скидка на услуги">{owner.servicesDiscount} %</Descriptions.Item>
                      <Descriptions.Item label="Комментарий" span={2}>
                        {owner.comment || '—'}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
                },
                {
                  key: 'appointments',
                  label: 'Записи на приём',
                  children: <OwnerAppointmentsTab ownerId={owner.id} />,
                },
                {
                  key: 'visits',
                  label: 'Приёмы',
                  children: <OwnerVisitsTab ownerId={owner.id} />,
                },
                {
                  key: 'bills',
                  label: 'Счета',
                  children: <OwnerBillsTab ownerId={owner.id} />,
                },
                {
                  key: 'balance',
                  label: 'Баланс',
                  children: (
                    <Space direction="vertical" size={16} className="full-width">
                      <div className="toolbar-row">
                        <Typography.Title level={4}>Баланс: {formatMoney(owner.balance)}</Typography.Title>
                        {canManagePayments ? (
                          <Button type="primary" icon={<PlusOutlined />} onClick={() => setBalanceOpen(true)}>
                            Операция баланса
                          </Button>
                        ) : null}
                      </div>
                      <Table
                        rowKey="id"
                        dataSource={owner.balanceOperations ?? []}
                        pagination={false}
                        className="dense-table"
                        columns={[
                          { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', render: formatDate },
                          { title: 'Тип', dataIndex: 'type', key: 'type', render: (value: PaymentType) => paymentTypeLabels[value] },
                          {
                            title: 'Сумма',
                            dataIndex: 'amount',
                            key: 'amount',
                            render: (value: string) => (
                              <Typography.Text type={toMoneyNumber(value) < 0 ? 'danger' : undefined}>
                                {formatMoney(value)}
                              </Typography.Text>
                            ),
                          },
                          { title: 'Комментарий', dataIndex: 'comment', key: 'comment', render: (value) => value || '—' },
                        ]}
                      />
                    </Space>
                  ),
                },
                {
                  key: 'communication',
                  label: 'Связь',
                  children: <OwnerCommunicationTab owner={owner} />,
                },
                {
                  key: 'trusted',
                  label: 'Доверенные лица',
                  children: (
                    <Table
                      rowKey="id"
                      dataSource={owner.trustedPeople ?? []}
                      pagination={false}
                      className="dense-table"
                      columns={[
                        { title: 'ФИО', dataIndex: 'fullName', key: 'fullName' },
                        { title: 'Телефон', dataIndex: 'phone', key: 'phone', render: (value) => value || '—' },
                      ]}
                    />
                  ),
                },
              ]}
            />
          ) : null}
        </div>
      </main>
      <OwnerFormDrawer
        open={editOpen}
        title="Редактировать владельца"
        initialOwner={owner}
        onClose={() => setEditOpen(false)}
        onSubmit={(values) => updateMutation.mutate(values)}
        isSubmitting={updateMutation.isPending}
        submitError={updateMutation.error}
      />
      <BalanceOperationModal
        open={balanceOpen}
        loading={balanceMutation.isPending}
        currentBalance={toMoneyNumber(owner?.balance)}
        onClose={() => setBalanceOpen(false)}
        onSubmit={(values) => balanceMutation.mutate(values)}
      />
      {owner ? (
        <MergeOwnerModal
          owner={owner}
          open={mergeOpen}
          loading={mergeMutation.isPending}
          onClose={() => setMergeOpen(false)}
          onMerge={(sourceOwnerId) => mergeMutation.mutate(sourceOwnerId)}
        />
      ) : null}
    </div>
  );
}

function MergeOwnerModal({
  owner,
  open,
  loading,
  onClose,
  onMerge,
}: {
  owner: Owner;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onMerge: (sourceOwnerId: string) => void;
}) {
  const [search, setSearch] = useState(owner.phone ?? owner.fullName);
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  const ownersQuery = useQuery({
    queryKey: ['owners', 'merge-search', search],
    queryFn: () => listOwners({ search, limit: 10, offset: 0 }),
    enabled: open && Boolean(search.trim()),
  });
  const candidates = (ownersQuery.data?.items ?? []).filter((candidate) => candidate.id !== owner.id);

  useEffect(() => {
    if (open) {
      setSearch(owner.phone ?? owner.fullName);
      setSelectedOwner(null);
    }
  }, [open, owner.fullName, owner.id, owner.phone]);

  return (
    <Modal title="Объединить владельцев" open={open} footer={null} onCancel={onClose} destroyOnHidden width={760}>
      <Space direction="vertical" size={16} className="full-width">
        <Typography.Paragraph type="secondary">
          Текущая карточка останется основной. Выбранный дубль будет перенесён сюда вместе с пациентами, записями,
          приёмами, счетами, балансом, уведомлениями и личным кабинетом.
        </Typography.Paragraph>
        <Input.Search
          allowClear
          defaultValue={owner.phone ?? owner.fullName}
          placeholder="Телефон, ФИО или пациент"
          enterButton="Найти"
          onSearch={(value) => {
            setSearch(value.trim());
            setSelectedOwner(null);
          }}
        />
        <Table<Owner>
          rowKey="id"
          size="small"
          className="dense-table"
          dataSource={candidates}
          loading={ownersQuery.isLoading || loading}
          pagination={false}
          locale={{ emptyText: 'Дубли не найдены' }}
          columns={[
            { title: 'Владелец', dataIndex: 'fullName', key: 'fullName' },
            { title: 'Телефон', dataIndex: 'phone', key: 'phone', width: 160, render: (value) => value || '—' },
            {
              title: 'Пациенты',
              key: 'animals',
              render: (_, record) => record.animals?.map((animal) => animal.nickname).join(', ') || record._count?.animals || '—',
            },
            {
              title: '',
              key: 'action',
              width: 170,
              render: (_, record) => (
                <Button
                  danger
                  size="small"
                  icon={<MergeCellsOutlined />}
                  loading={loading}
                  onClick={() => setSelectedOwner(record)}
                >
                  Объединить
                </Button>
              ),
            },
          ]}
        />
        {selectedOwner ? (
          <Alert
            type="warning"
            showIcon
            message="Подтвердите объединение"
            description={
              <Space direction="vertical" size={12} className="full-width">
                <Typography.Text>
                  Карточка «{selectedOwner.fullName}» будет перенесена в «{owner.fullName}» и удалена как дубль.
                </Typography.Text>
                <Space>
                  <Button onClick={() => setSelectedOwner(null)} disabled={loading}>
                    Отмена
                  </Button>
                  <Button danger type="primary" loading={loading} onClick={() => onMerge(selectedOwner.id)}>
                    Да, объединить
                  </Button>
                </Space>
              </Space>
            }
          />
        ) : null}
      </Space>
    </Modal>
  );
}

function OwnerAppointmentsTab({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const appointmentsQuery = useQuery({
    queryKey: ['appointments', { ownerId, limit: 20, offset: 0 }],
    queryFn: () => listAppointments({ ownerId, limit: 20, offset: 0 }),
  });

  if (appointmentsQuery.isError) {
    return <Typography.Text type="danger">{getErrorMessage(appointmentsQuery.error)}</Typography.Text>;
  }

  return (
    <Table<Appointment>
      rowKey="id"
      className="dense-table"
      dataSource={appointmentsQuery.data?.items ?? []}
      loading={appointmentsQuery.isLoading}
      pagination={false}
      locale={{ emptyText: 'Записей пока нет' }}
      onRow={(record) => ({ onDoubleClick: () => navigate(`/schedule/${record.id}`) })}
      columns={[
        { title: 'Дата', dataIndex: 'startsAt', key: 'startsAt', width: 180, render: formatDate },
        { title: 'Пациент', key: 'animal', render: (_, record) => record.animal?.nickname ?? '—' },
        {
          title: 'Статус',
          dataIndex: 'status',
          key: 'status',
          width: 150,
          render: (value: Appointment['status']) => <Tag color={appointmentStatusColors[value]}>{appointmentStatusLabels[value]}</Tag>,
        },
        { title: 'Врач', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
        { title: 'Кабинет', key: 'room', render: (_, record) => record.room?.name ?? '—' },
        { title: 'Комментарий', dataIndex: 'comment', key: 'comment', render: (value: string | null) => value || '—' },
        {
          title: '',
          key: 'actions',
          width: 110,
          render: (_, record) => (
            <Button size="small" onClick={() => navigate(`/schedule/${record.id}`)}>
              Открыть
            </Button>
          ),
        },
      ]}
    />
  );
}

function OwnerVisitsTab({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const visitsQuery = useQuery({
    queryKey: ['visits', { ownerId, limit: 20, offset: 0 }],
    queryFn: () => listVisits({ ownerId, limit: 20, offset: 0 }),
  });

  if (visitsQuery.isError) {
    return <Typography.Text type="danger">{getErrorMessage(visitsQuery.error)}</Typography.Text>;
  }

  return (
    <Table<VisitListItem>
      rowKey="id"
      className="dense-table"
      dataSource={visitsQuery.data?.items ?? []}
      loading={visitsQuery.isLoading}
      pagination={false}
      locale={{ emptyText: 'Приёмов пока нет' }}
      onRow={(record) => ({ onDoubleClick: () => navigate(`/visits/${record.id}`) })}
      columns={[
        { title: 'Дата', dataIndex: 'startedAt', key: 'startedAt', width: 180, render: formatDate },
        { title: 'Пациент', key: 'animal', render: (_, record) => record.animal?.nickname ?? '—' },
        {
          title: 'Статус',
          dataIndex: 'status',
          key: 'status',
          width: 140,
          render: (value: VisitListItem['status']) => <Tag color={visitStatusColors[value]}>{visitStatusLabels[value]}</Tag>,
        },
        { title: 'Врач', key: 'employee', render: (_, record) => record.employee?.fullName ?? '—' },
        { title: 'Диагнозы', key: 'diagnoses', width: 110, render: (_, record) => record._count?.diagnoses ?? 0 },
        { title: 'Документы', key: 'documents', width: 120, render: (_, record) => record._count?.documents ?? 0 },
        { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', width: 130, render: formatMoney },
        {
          title: '',
          key: 'actions',
          width: 110,
          render: (_, record) => (
            <Button size="small" onClick={() => navigate(`/visits/${record.id}`)}>
              Открыть
            </Button>
          ),
        },
      ]}
    />
  );
}

function OwnerBillsTab({ ownerId }: { ownerId: string }) {
  const navigate = useNavigate();
  const billsQuery = useQuery({
    queryKey: ['bills', { ownerId, limit: 20, offset: 0 }],
    queryFn: () => listBills({ ownerId, limit: 20, offset: 0 }),
  });

  if (billsQuery.isError) {
    return <Typography.Text type="danger">{getErrorMessage(billsQuery.error)}</Typography.Text>;
  }

  return (
    <Table<BillListItem>
      rowKey="id"
      className="dense-table"
      dataSource={billsQuery.data?.items ?? []}
      loading={billsQuery.isLoading}
      pagination={false}
      locale={{ emptyText: 'Счетов пока нет' }}
      onRow={(record) => ({ onDoubleClick: () => navigate(`/bills/${record.id}`) })}
      columns={[
        { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: formatDate },
        { title: 'Источник', dataIndex: 'source', key: 'source', width: 130, render: (value: BillListItem['source']) => billSourceLabels[value] },
        { title: 'Пациент', key: 'animal', render: (_, record) => record.animal?.nickname ?? '—' },
        {
          title: 'Статус',
          dataIndex: 'status',
          key: 'status',
          width: 140,
          render: (value: BillListItem['status']) => <Tag color={paymentStatusColors[value]}>{paymentStatusLabels[value]}</Tag>,
        },
        { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', width: 130, render: formatMoney },
        { title: 'Оплачено', dataIndex: 'paidAmount', key: 'paidAmount', width: 130, render: formatMoney },
        {
          title: '',
          key: 'actions',
          width: 110,
          render: (_, record) => (
            <Button size="small" onClick={() => navigate(`/bills/${record.id}`)}>
              Открыть
            </Button>
          ),
        },
      ]}
    />
  );
}

const balanceOperationSchema = z.object({
  operation: z.enum(['TOP_UP', 'WRITE_OFF']),
  type: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'DEPOSIT', 'OTHER']),
  amount: z.number().min(0.01, 'Введите сумму'),
  comment: z.string().trim().optional(),
});

type BalanceOperationFormValues = z.infer<typeof balanceOperationSchema>;

function BalanceOperationModal({
  open,
  loading,
  currentBalance,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  currentBalance: number;
  onClose: () => void;
  onSubmit: (values: OwnerBalanceOperationInput) => void;
}) {
  const { control, handleSubmit, reset } = useForm<BalanceOperationFormValues>({
    resolver: zodResolver(balanceOperationSchema),
    defaultValues: {
      operation: 'TOP_UP',
      type: 'DEPOSIT',
      amount: 0,
      comment: '',
    },
  });

  function submit(values: BalanceOperationFormValues) {
    onSubmit({
      type: values.type,
      amount: values.operation === 'WRITE_OFF' ? -values.amount : values.amount,
      comment: values.comment || undefined,
    });
  }

  return (
    <Modal
      title="Операция баланса"
      open={open}
      okText="Провести"
      cancelText="Отмена"
      confirmLoading={loading}
      onCancel={onClose}
      onOk={handleSubmit(submit)}
      afterOpenChange={(visible) => {
        if (visible) {
          reset({ operation: 'TOP_UP', type: 'DEPOSIT', amount: 0, comment: '' });
        }
      }}
      destroyOnHidden
      width={520}
    >
      <Form layout="vertical">
        <Typography.Paragraph type="secondary">Текущий баланс: {formatMoney(currentBalance)}</Typography.Paragraph>
        <Controller
          control={control}
          name="operation"
          render={({ field }) => (
            <Form.Item label="Операция">
              <Select
                {...field}
                options={[
                  { value: 'TOP_UP', label: 'Пополнение' },
                  { value: 'WRITE_OFF', label: 'Списание' },
                ]}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <Form.Item label="Тип">
              <Select {...field} options={Object.entries(paymentTypeLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <Form.Item label="Сумма" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <InputNumber className="full-width" min={0.01} value={field.value} onChange={(value) => field.onChange(value ?? 0)} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="comment"
          render={({ field }) => (
            <Form.Item label="Комментарий">
              <Input.TextArea {...field} rows={3} placeholder="Например: аванс за лечение, корректировка, возврат" />
            </Form.Item>
          )}
        />
      </Form>
    </Modal>
  );
}

function formatAllowedChannels(owner: {
  allowTelegram?: boolean;
  allowMax?: boolean;
  allowSms?: boolean;
  allowEmail?: boolean;
}) {
  const values = [
    owner.allowTelegram ? 'Telegram' : null,
    owner.allowMax ? 'MAX' : null,
    owner.allowSms ? 'SMS' : null,
    owner.allowEmail ? 'Email' : null,
  ].filter(Boolean);

  return values.length ? values.join(', ') : '—';
}

function ContextRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="context-row">
      <span>{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}
