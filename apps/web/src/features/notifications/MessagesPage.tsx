import { CloseOutlined, EditOutlined, EyeOutlined, PlusOutlined, RedoOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Descriptions, Drawer, Form, Input, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { fromDatetimeLocal, formatDateTime } from '../../shared/utils/date';
import { getOwner, listOwnerAnimals, listOwners } from '../owners/owners.api';
import {
  cancelNotification,
  createTelegramBroadcast,
  createNotification,
  listNotificationOutbox,
  listNotificationTemplates,
  retryNotification,
  previewTelegramBroadcast,
  upsertNotificationTemplate,
} from './notifications.api';
import {
  CreateNotificationInput,
  NotificationChannel,
  notificationChannelLabels,
  NotificationOutboxItem,
  notificationStatusColors,
  notificationStatusLabels,
  NotificationStatus,
  NotificationTemplate,
  UpsertNotificationTemplateInput,
  TelegramBroadcastDraft,
  TelegramBroadcastPreview,
} from './types';

const pageSize = 10;
const channelOptions = Object.entries(notificationChannelLabels).map(([value, label]) => ({ value, label }));

export function MessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'notifications.manage');
  const [status, setStatus] = useState<NotificationStatus | undefined>();
  const [channel, setChannel] = useState<NotificationChannel | undefined>();
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [composerDefaults, setComposerDefaults] = useState<NotificationComposerDefaults>({});
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [selectedOutbox, setSelectedOutbox] = useState<NotificationOutboxItem | null>(null);

  const outboxQuery = useQuery({
    queryKey: ['notifications', 'outbox', { status, channel, limit: pageSize, offset }],
    queryFn: () => listNotificationOutbox({ status, channel, limit: pageSize, offset }),
    refetchInterval: (query) => query.state.data?.items.some(
      (item) => item.status === 'QUEUED' || item.status === 'SENDING',
    ) ? 2_000 : false,
  });
  const templatesQuery = useQuery({
    queryKey: ['notifications', 'templates'],
    queryFn: () => listNotificationTemplates(),
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateNotificationInput) => createNotification(values),
    onSuccess: async () => {
      await invalidateNotifications(queryClient);
      setCreateOpen(false);
      message.success('Сообщение принято к отправке');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const templateMutation = useMutation({
    mutationFn: (values: UpsertNotificationTemplateInput) => upsertNotificationTemplate(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications', 'templates'] });
      setTemplateOpen(false);
      setEditingTemplate(null);
      message.success('Шаблон сохранён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: ({ item, action }: { item: NotificationOutboxItem; action: 'retry' | 'cancel' }) =>
      action === 'retry' ? retryNotification(item.id) : cancelNotification(item.id),
    onSuccess: async (updated) => {
      await invalidateNotifications(queryClient);
      setSelectedOutbox((current) => (current?.id === updated.id ? updated : current));
      message.success('Статус сообщения обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    if (!selectedOutbox) {
      return;
    }

    const updatedItem = outboxQuery.data?.items.find((item) => item.id === selectedOutbox.id);
    if (updatedItem && updatedItem.updatedAt !== selectedOutbox.updatedAt) {
      setSelectedOutbox(updatedItem);
    }
  }, [outboxQuery.data, selectedOutbox]);

  useEffect(() => {
    if (!canManage || searchParams.get('compose') !== '1') {
      return;
    }

    setComposerDefaults({
      ownerId: searchParams.get('ownerId') ?? '',
      animalId: searchParams.get('animalId') ?? '',
      subject: searchParams.get('subject') ?? '',
      body: searchParams.get('body') ?? '',
    });
    setCreateOpen(true);

    const nextSearchParams = new URLSearchParams(searchParams);
    for (const key of ['compose', 'ownerId', 'animalId', 'subject', 'body']) {
      nextSearchParams.delete(key);
    }
    setSearchParams(nextSearchParams, { replace: true });
  }, [canManage, searchParams, setSearchParams]);

  const outboxColumns = useMemo<ColumnsType<NotificationOutboxItem>>(
    () => [
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 130,
        render: (value: NotificationStatus) => <NotificationStatusTag status={value} />,
      },
      {
        title: 'Канал',
        dataIndex: 'channel',
        key: 'channel',
        width: 120,
        render: (value: NotificationChannel) => formatNotificationChannel(value),
      },
      {
        title: 'Доставка',
        key: 'delivery',
        width: 210,
        render: (_, item) => formatOutboxDelivery(item),
      },
      {
        title: 'Клиент / пациент',
        key: 'ownerAnimal',
        width: 230,
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{item.owner?.fullName ?? 'Владелец не привязан'}</Typography.Text>
            <Typography.Text type="secondary">{getAnimalLabel(item)}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Сообщение',
        dataIndex: 'body',
        key: 'body',
        ellipsis: true,
        render: (value: string, item) => (
          <Space direction="vertical" size={0}>
            {item.subject ? <Typography.Text strong>{item.subject}</Typography.Text> : null}
            <Typography.Text>{value}</Typography.Text>
            {item.template ? <Typography.Text type="secondary">{getTemplateLabel(item)}</Typography.Text> : null}
          </Space>
        ),
      },
      { title: 'Запланировано', dataIndex: 'scheduledAt', key: 'scheduledAt', width: 175, render: formatDateTime },
      { title: 'Отправлено', dataIndex: 'sentAt', key: 'sentAt', width: 175, render: formatDateTime },
      {
        title: 'Действия',
        key: 'actions',
        width: 250,
        render: (_, item) => {
          const isActionLoading = actionMutation.isPending && actionMutation.variables?.item.id === item.id;

          return (
            <Space wrap>
              <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedOutbox(item)}>
                Открыть
              </Button>
              {canManage && canRetryNotification(item) ? (
                <Button
                  size="small"
                  icon={<RedoOutlined />}
                  loading={isActionLoading}
                  onClick={() => actionMutation.mutate({ item, action: 'retry' })}
                >
                  Повторить
                </Button>
              ) : null}
              {canManage && canCancelNotification(item) ? (
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  loading={isActionLoading}
                  onClick={() => actionMutation.mutate({ item, action: 'cancel' })}
                >
                  Отменить
                </Button>
              ) : null}
            </Space>
          );
        },
      },
    ],
    [actionMutation, canManage],
  );

  const templateColumns = useMemo<ColumnsType<NotificationTemplate>>(
    () => [
      { title: 'Канал', dataIndex: 'channel', key: 'channel', width: 120 },
      { title: 'Событие', dataIndex: 'eventCode', key: 'eventCode', width: 200 },
      { title: 'Название', dataIndex: 'title', key: 'title' },
      { title: 'Тема', dataIndex: 'subject', key: 'subject', render: (value: string | null) => value || '—' },
      { title: 'Текст', dataIndex: 'body', key: 'body', ellipsis: true },
      {
        title: 'Активен',
        dataIndex: 'isActive',
        key: 'isActive',
        width: 110,
        render: (value: boolean) => (value ? <Tag color="green">Да</Tag> : <Tag>Нет</Tag>),
      },
      {
        title: '',
        key: 'actions',
        width: 130,
        render: (_, template) =>
          canManage ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openTemplate(template)}>
              Открыть
            </Button>
          ) : null,
      },
    ],
    [canManage],
  );

  function handleTableChange(pagination: TablePaginationConfig) {
    const current = pagination.current ?? 1;
    const size = pagination.pageSize ?? pageSize;
    setOffset((current - 1) * size);
  }

  return (
    <div className="page">
      <PageHeader
        title="Сообщения владельцам"
        description="Выберите конкретного владельца, при необходимости пациента, затем текст и способ доставки."
        extra={
          canManage ? (
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setComposerDefaults({});
                  setCreateOpen(true);
                }}
              >
                Написать владельцу
              </Button>
              <Button icon={<PlusOutlined />} onClick={() => setTemplateOpen(true)}>
                Новый шаблон
              </Button>
              <Button onClick={() => setBroadcastOpen(true)}>
                Массовая Telegram-рассылка
              </Button>
            </Space>
          ) : null
        }
      />
      <Tabs
        items={[
          {
            key: 'outbox',
            label: 'История и очередь',
            children: (
              <div className="list-panel">
                <div className="list-panel-header">
                  <Space wrap>
                    <Select
                      allowClear
                      placeholder="Статус"
                      className="status-filter"
                      value={status}
                      onChange={(value) => {
                        setStatus(value);
                        setOffset(0);
                      }}
                      options={Object.entries(notificationStatusLabels).map(([value, label]) => ({ value, label }))}
                    />
                    <Select
                      allowClear
                      placeholder="Канал"
                      className="status-filter"
                      value={channel}
                      onChange={(value) => {
                        setChannel(value);
                        setOffset(0);
                      }}
                      options={channelOptions}
                    />
                  </Space>
                </div>
                <div className="list-panel-body">
                  {outboxQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(outboxQuery.error)} className="form-alert" /> : null}
                  <Table<NotificationOutboxItem>
                    rowKey="id"
                    columns={outboxColumns}
                    dataSource={outboxQuery.data?.items ?? []}
                    loading={outboxQuery.isLoading}
                    pagination={{
                      current: offset / pageSize + 1,
                      pageSize,
                      total: outboxQuery.data?.total ?? 0,
                      showSizeChanger: false,
                    }}
                    onChange={handleTableChange}
                    className="dense-table"
                    scroll={{ x: 1500 }}
                    onRow={(item) => ({ onDoubleClick: () => setSelectedOutbox(item) })}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'templates',
            label: 'Шаблоны',
            children: (
              <div className="list-panel">
                <div className="list-panel-body">
                  {templatesQuery.isError ? (
                    <Alert type="error" showIcon message={getErrorMessage(templatesQuery.error)} className="form-alert" />
                  ) : null}
                  <Table<NotificationTemplate>
                    rowKey="id"
                    columns={templateColumns}
                    dataSource={templatesQuery.data ?? []}
                    loading={templatesQuery.isLoading}
                    pagination={false}
                    className="dense-table"
                    onRow={(template) => ({ onDoubleClick: () => canManage && openTemplate(template) })}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />
      <NotificationFormDrawer
        open={createOpen}
        initialValues={composerDefaults}
        templates={templatesQuery.data ?? []}
        submitError={createMutation.error}
        isSubmitting={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
      />
      <TelegramBroadcastDrawer
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        onQueued={async () => {
          await invalidateNotifications(queryClient);
          setBroadcastOpen(false);
        }}
      />
      <TemplateFormDrawer
        open={templateOpen}
        template={editingTemplate}
        submitError={templateMutation.error}
        isSubmitting={templateMutation.isPending}
        onClose={closeTemplateDrawer}
        onSubmit={(values) => templateMutation.mutate(values)}
      />
      <NotificationDetailDrawer
        item={selectedOutbox}
        canManage={canManage}
        isSubmitting={actionMutation.isPending && actionMutation.variables?.item.id === selectedOutbox?.id}
        onClose={() => setSelectedOutbox(null)}
        onAction={(item, action) => actionMutation.mutate({ item, action })}
      />
    </div>
  );

  function openTemplate(template: NotificationTemplate) {
    setEditingTemplate(template);
    setTemplateOpen(true);
  }

  function closeTemplateDrawer() {
    setTemplateOpen(false);
    setEditingTemplate(null);
  }
}

function TelegramBroadcastDrawer({ open, onClose, onQueued }: { open: boolean; onClose: () => void; onQueued: () => Promise<void> }) {
  const { message } = App.useApp();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [preview, setPreview] = useState<TelegramBroadcastPreview | null>(null);
  const draft: TelegramBroadcastDraft = {
    subject: subject.trim() || null,
    body: body.trim(),
    scheduledAt: scheduledAt ? fromDatetimeLocal(scheduledAt) : null,
  };
  const previewMutation = useMutation({
    mutationFn: () => previewTelegramBroadcast(draft),
    onSuccess: (result) => {
      setPreview(result);
      setConfirmation('');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const createMutation = useMutation({
    mutationFn: () => createTelegramBroadcast({ ...draft, confirmation: 'ОТПРАВИТЬ' }),
    onSuccess: async (result) => {
      message.success(`В очередь добавлено сообщений: ${result.queued}`);
      await onQueued();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  function resetDrawer(nextOpen: boolean) {
    if (!nextOpen) return;
    setSubject('');
    setBody('');
    setScheduledAt('');
    setConfirmation('');
    setPreview(null);
  }

  function invalidatePreview() {
    setPreview(null);
    setConfirmation('');
  }

  return (
    <Drawer
      title="Рассылка через Telegram"
      width={700}
      open={open}
      onClose={onClose}
      afterOpenChange={resetDrawer}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} className="full-width">
        <Alert
          type="warning"
          showIcon
          message="Сначала обязателен предпросмотр аудитории"
          description="В рассылке нельзя передавать диагнозы, анализы и другие медицинские сведения. Каждое сообщение также появится в защищённом личном кабинете."
        />
        <Form layout="vertical">
          <Form.Item label="Тема">
            <Input value={subject} maxLength={300} onChange={(event) => { setSubject(event.target.value); invalidatePreview(); }} />
          </Form.Item>
          <Form.Item label="Текст" required>
            <Input.TextArea value={body} rows={7} maxLength={4000} onChange={(event) => { setBody(event.target.value); invalidatePreview(); }} />
          </Form.Item>
          <Form.Item label="Отправить после">
            <Input type="datetime-local" value={scheduledAt} onChange={(event) => { setScheduledAt(event.target.value); invalidatePreview(); }} />
          </Form.Item>
        </Form>
        <Button
          onClick={() => previewMutation.mutate()}
          loading={previewMutation.isPending}
          disabled={!body.trim()}
        >
          Проверить аудиторию
        </Button>
        {preview ? (
          <Space direction="vertical" size={12} className="full-width">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Получат в Telegram">{preview.eligible}</Descriptions.Item>
              <Descriptions.Item label="Без разрешённого Telegram">{preview.skippedWithoutTelegramConsent}</Descriptions.Item>
              <Descriptions.Item label="Всего с кабинетом">{preview.portalOwners}</Descriptions.Item>
            </Descriptions>
            {preview.overLimit ? <Alert type="error" showIcon message="Больше 500 получателей — разделите рассылку" /> : null}
            {!preview.gatewayAvailable ? <Alert type="error" showIcon message={preview.warning} /> : null}
            <Typography.Text type="secondary">
              Первые получатели: {preview.recipients.map((owner) => owner.fullName).join(', ') || 'нет'}
            </Typography.Text>
            <Form.Item label="Для подтверждения введите ОТПРАВИТЬ">
              <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </Form.Item>
            <Button
              type="primary"
              danger
              loading={createMutation.isPending}
              disabled={confirmation !== 'ОТПРАВИТЬ' || preview.overLimit || !preview.eligible || !preview.gatewayAvailable}
              onClick={() => createMutation.mutate()}
            >
              Поставить рассылку в очередь
            </Button>
          </Space>
        ) : null}
      </Space>
    </Drawer>
  );
}

function NotificationDetailDrawer({
  item,
  canManage,
  isSubmitting,
  onClose,
  onAction,
}: {
  item: NotificationOutboxItem | null;
  canManage: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onAction: (item: NotificationOutboxItem, action: 'retry' | 'cancel') => void;
}) {
  return (
    <Drawer
      title="Сообщение владельцу"
      width={680}
      open={Boolean(item)}
      onClose={onClose}
      destroyOnHidden
      extra={
        item && canManage ? (
          <Space>
            {canRetryNotification(item) ? (
              <Button icon={<RedoOutlined />} loading={isSubmitting} onClick={() => onAction(item, 'retry')}>
                Повторить
              </Button>
            ) : null}
            {canCancelNotification(item) ? (
              <Button danger icon={<CloseOutlined />} loading={isSubmitting} onClick={() => onAction(item, 'cancel')}>
                Отменить
              </Button>
            ) : null}
          </Space>
        ) : null
      }
    >
      {item ? (
        <Space direction="vertical" size={16} className="full-width">
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Статус">
              <NotificationStatusTag status={item.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Канал">{formatNotificationChannel(item.channel)}</Descriptions.Item>
            <Descriptions.Item label="Доставка">{formatOutboxDelivery(item)}</Descriptions.Item>
            <Descriptions.Item label="Владелец">{item.owner?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Пациент">{getAnimalLabel(item)}</Descriptions.Item>
            <Descriptions.Item label="Шаблон">{getTemplateLabel(item)}</Descriptions.Item>
            <Descriptions.Item label="Создал">{item.createdBy?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Запланировано">{formatDateTime(item.scheduledAt)}</Descriptions.Item>
            <Descriptions.Item label="Отправлено">{formatDateTime(item.sentAt)}</Descriptions.Item>
            <Descriptions.Item label="Создано">{formatDateTime(item.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Обновлено">{formatDateTime(item.updatedAt)}</Descriptions.Item>
          </Descriptions>
          {getDeliveryIssueText(item) ? <Alert type="warning" showIcon message={getDeliveryIssueText(item)} /> : null}
          <div>
            <Typography.Title level={5} className="compact-title">
              Текст сообщения
            </Typography.Title>
            {item.subject ? <Typography.Text strong>{item.subject}</Typography.Text> : null}
            <Typography.Paragraph className="notification-message-box">{item.body}</Typography.Paragraph>
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}

const notificationSchema = z.object({
  channel: z.enum(['INTERNAL', 'MESSENGER', 'TELEGRAM', 'MAX', 'SMS', 'EMAIL', 'PUSH']),
  ownerId: nullableString(),
  animalId: nullableString(),
  templateId: nullableString(),
  recipient: z.string().trim().max(300),
  subject: nullableString(300),
  body: z.string().trim().min(1, 'Введите текст').max(4000),
  scheduledAt: nullableDateTime(),
  messengerChannels: z.array(z.enum(['MAX', 'TELEGRAM'])),
}).superRefine((values, context) => {
  if (values.channel === 'MESSENGER' && !values.ownerId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'Выберите владельца' });
  }

  if (values.channel !== 'MESSENGER' && values.recipient.length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipient'], message: 'Укажите получателя' });
  }
});

type NotificationFormValues = z.infer<typeof notificationSchema>;
type NotificationFormInput = z.input<typeof notificationSchema>;
type NotificationComposerDefaults = Partial<Pick<NotificationFormInput, 'ownerId' | 'animalId' | 'subject' | 'body'>>;

function NotificationFormDrawer({
  open,
  initialValues,
  templates,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialValues: Partial<NotificationComposerDefaults>;
  templates: NotificationTemplate[];
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: CreateNotificationInput) => void;
}) {
  const { control, handleSubmit, reset, setValue } = useForm<NotificationFormInput, unknown, NotificationFormValues>({
    resolver: zodResolver(notificationSchema),
    defaultValues: getNotificationDefaults(),
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const ownerId = useWatch({ control, name: 'ownerId' });
  const ownersQuery = useQuery({
    queryKey: ['owners', { search: ownerSearch, limit: 20, offset: 0 }],
    queryFn: () => listOwners({ search: ownerSearch, limit: 20, offset: 0 }),
    enabled: open,
  });
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals'],
    queryFn: () => listOwnerAnimals(ownerId!),
    enabled: open && Boolean(ownerId),
  });
  const selectedOwnerQuery = useQuery({
    queryKey: ['owners', ownerId],
    queryFn: () => getOwner(ownerId!),
    enabled: open && Boolean(ownerId),
  });
  const selectedOwner = selectedOwnerQuery.data;
  const ownerOptions = useMemo(() => {
    const options = (ownersQuery.data?.items ?? []).map((owner) => ({
      value: owner.id,
      label: owner.phone ? `${owner.fullName}, ${owner.phone}` : owner.fullName,
    }));

    if (selectedOwner && !options.some((option) => option.value === selectedOwner.id)) {
      options.unshift({
        value: selectedOwner.id,
        label: selectedOwner.phone ? `${selectedOwner.fullName}, ${selectedOwner.phone}` : selectedOwner.fullName,
      });
    }

    return options;
  }, [ownersQuery.data, selectedOwner]);
  const maxConnected = Boolean(selectedOwner?.allowMax && selectedOwner.maxUserId);
  const telegramConnected = Boolean(selectedOwner?.allowTelegram && selectedOwner.telegramChatId);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getNotificationDefaults(initialValues));
      setOwnerSearch('');
    }
  }

  function submit(values: NotificationFormValues) {
    onSubmit({
      channel: values.channel,
      ownerId: values.ownerId,
      animalId: values.animalId,
      templateId: values.templateId,
      recipient: values.channel === 'MESSENGER' ? undefined : values.recipient,
      subject: values.subject,
      body: values.body,
      scheduledAt: values.scheduledAt ? fromDatetimeLocal(values.scheduledAt) : null,
      messengerChannels: values.messengerChannels,
    });
  }

  return (
    <Drawer
      title="Сообщение владельцу"
      width={680}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            Отправить сообщение
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <Typography.Title level={5}>1. Кому отправить</Typography.Title>
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="ownerId"
            render={({ field, fieldState }) => (
              <Form.Item
                label="Владелец — получатель"
                required
                validateStatus={fieldState.error ? 'error' : undefined}
                help={fieldState.error?.message ?? 'Начните вводить фамилию, имя или телефон.'}
              >
                <Select
                  {...field}
                  allowClear
                  showSearch
                  filterOption={false}
                  onSearch={setOwnerSearch}
                  loading={ownersQuery.isLoading}
                  placeholder="Найти владельца по имени или телефону"
                  options={ownerOptions}
                  onChange={(value) => {
                    field.onChange(value ?? '');
                    setValue('animalId', '');
                    setValue('messengerChannels', []);
                  }}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="animalId"
            render={({ field }) => (
              <Form.Item label="Пациент — необязательно">
                <Select
                  {...field}
                  allowClear
                  disabled={!ownerId}
                  loading={animalsQuery.isLoading}
                  placeholder="Выберите пациента"
                  options={animalsQuery.data?.map((animal) => ({ value: animal.id, label: animal.nickname }))}
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </Form.Item>
            )}
          />
        </div>
        <Alert
          type={ownerId ? 'success' : 'warning'}
          showIcon
          className="form-alert"
          message={ownerId ? `Получатель: ${selectedOwner?.fullName ?? 'загружается…'}` : 'Сначала выберите владельца'}
          description={ownerId
            ? 'Основная копия сохраняется в личном кабинете владельца. Если у него подключены MAX или Telegram, их можно отметить ниже.'
            : 'Без выбранного владельца сообщение отправить нельзя.'}
        />
        <Typography.Title level={5}>2. Куда доставить</Typography.Title>
        <Controller
          control={control}
          name="messengerChannels"
          render={({ field }) => (
            <Form.Item label="Дополнительные каналы">
              <Checkbox.Group value={field.value} onChange={field.onChange}>
                <Space direction="vertical">
                  <Checkbox value="MAX" disabled={!maxConnected}>
                    MAX {ownerId && !maxConnected ? '— не подключён' : ''}
                  </Checkbox>
                  <Checkbox value="TELEGRAM" disabled={!telegramConnected}>
                    Telegram {ownerId && !telegramConnected ? '— не подключён' : ''}
                  </Checkbox>
                </Space>
              </Checkbox.Group>
            </Form.Item>
          )}
        />
        <Typography.Title level={5}>3. Что написать</Typography.Title>
        <Controller
          control={control}
          name="templateId"
          render={({ field }) => (
            <Form.Item label="Шаблон">
              <Select
                {...field}
                allowClear
                placeholder="Выбрать готовый текст или написать вручную"
                options={templates.filter((template) => template.isActive).map((template) => ({
                  value: template.id,
                  label: template.title,
                }))}
                onChange={(value) => {
                  field.onChange(value ?? '');
                  const template = templates.find((item) => item.id === value);
                  if (template) {
                    setValue('channel', 'MESSENGER');
                    setValue('subject', template.subject ?? '');
                    setValue('body', template.body);
                  }
                }}
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="subject"
          render={({ field }) => (
            <Form.Item label="Тема">
              <Input {...field} value={field.value ?? ''} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="body"
          render={({ field, fieldState }) => (
            <Form.Item label="Текст" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={6} placeholder="Напишите, что нужно сообщить владельцу" {...field} />
            </Form.Item>
          )}
        />
        <Typography.Title level={5}>4. Когда отправить</Typography.Title>
        <Controller
          control={control}
          name="scheduledAt"
          render={({ field }) => (
            <Form.Item label="Дата и время" help="Оставьте поле пустым, чтобы отправить сразу.">
              <Input type="datetime-local" {...field} value={field.value ?? ''} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}

const templateSchema = z.object({
  channel: z.string().trim().min(2, 'Укажите канал').max(80),
  eventCode: z.string().trim().min(2, 'Укажите событие').max(120),
  title: z.string().trim().min(2, 'Укажите название').max(200),
  subject: nullableString(300),
  body: z.string().trim().min(1, 'Введите текст шаблона').max(4000),
  isActive: z.boolean(),
});

type TemplateFormValues = z.infer<typeof templateSchema>;
type TemplateFormInput = z.input<typeof templateSchema>;

function TemplateFormDrawer({
  open,
  template,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  template?: NotificationTemplate | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: UpsertNotificationTemplateInput) => void;
}) {
  const { control, handleSubmit, reset } = useForm<TemplateFormInput, unknown, TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      channel: 'TELEGRAM',
      eventCode: '',
      title: '',
      subject: '',
      body: '',
      isActive: true,
    },
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(
        template
          ? {
              channel: template.channel,
              eventCode: template.eventCode,
              title: template.title,
              subject: template.subject ?? '',
              body: template.body,
              isActive: template.isActive,
            }
          : { channel: 'TELEGRAM', eventCode: '', title: '', subject: '', body: '', isActive: true },
      );
    }
  }

  return (
    <Drawer
      title={template ? 'Редактирование шаблона' : 'Новый шаблон'}
      width={620}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            Сохранить
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="channel"
            render={({ field, fieldState }) => (
              <Form.Item label="Канал" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} disabled={Boolean(template)} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="eventCode"
            render={({ field, fieldState }) => (
              <Form.Item label="Событие" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} disabled={Boolean(template)} placeholder="appointment_reminder" />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            <Form.Item label="Название" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="subject"
          render={({ field }) => (
            <Form.Item label="Тема">
              <Input {...field} value={field.value ?? ''} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="body"
          render={({ field, fieldState }) => (
            <Form.Item label="Текст" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={7} {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
              Активен
            </Checkbox>
          )}
        />
      </Form>
    </Drawer>
  );
}

function getNotificationDefaults(initialValues: Partial<NotificationComposerDefaults> = {}): NotificationFormInput {
  return {
    channel: 'MESSENGER',
    ownerId: initialValues.ownerId ?? '',
    animalId: initialValues.animalId ?? '',
    templateId: '',
    recipient: '',
    subject: initialValues.subject ?? '',
    body: initialValues.body ?? '',
    scheduledAt: '',
    messengerChannels: [],
  };
}

async function invalidateNotifications(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

function NotificationStatusTag({ status }: { status: NotificationStatus }) {
  return <Tag color={notificationStatusColors[status]}>{notificationStatusLabels[status]}</Tag>;
}

function formatNotificationChannel(value: NotificationChannel | string | null | undefined) {
  if (!value) {
    return '—';
  }

  return (notificationChannelLabels as Record<string, string>)[value] ?? value;
}

function formatOutboxDelivery(item: NotificationOutboxItem) {
  if (item.channel !== 'MESSENGER') {
    return formatNotificationChannel(item.channel);
  }

  const delivery = item.metadata?.delivery;
  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) {
    return 'Личный кабинет';
  }

  const requested = readDeliveryChannels((delivery as { messengerChannels?: unknown }).messengerChannels);
  const delivered = readDeliveryChannels((delivery as { deliveredMessengerChannels?: unknown }).deliveredMessengerChannels);
  const channels = [...new Set([...requested, ...delivered])];

  return channels.length
    ? `Личный кабинет + ${channels.map((value) => notificationChannelLabels[value]).join(' + ')}`
    : 'Личный кабинет';
}

function getDeliveryIssueText(item: NotificationOutboxItem) {
  if (!item.lastError) {
    return null;
  }

  return item.status === 'FAILED'
    ? 'Не удалось доставить сообщение. Проверьте подключение владельца и повторите отправку.'
    : 'Доставка временно задержана. Система повторит попытку автоматически.';
}

function readDeliveryChannels(value: unknown): Array<'MAX' | 'TELEGRAM'> {
  return Array.isArray(value)
    ? value.filter((channel): channel is 'MAX' | 'TELEGRAM' => channel === 'MAX' || channel === 'TELEGRAM')
    : [];
}

function getAnimalLabel(item: NotificationOutboxItem) {
  if (!item.animal) {
    return 'Пациент не привязан';
  }

  const details = [item.animal.species, item.animal.breed].filter(Boolean).join(', ');
  return details ? `${item.animal.nickname} - ${details}` : item.animal.nickname;
}

function getTemplateLabel(item: NotificationOutboxItem) {
  if (!item.template) {
    return '—';
  }

  return `${item.template.title} (${formatNotificationChannel(item.template.channel)}, ${item.template.eventCode})`;
}

function canRetryNotification(item: NotificationOutboxItem) {
  return item.status === 'FAILED';
}

function canCancelNotification(item: NotificationOutboxItem) {
  return item.status === 'QUEUED' || item.status === 'SENDING';
}

function nullableString(maxLength?: number) {
  let schema = z.string().trim();

  if (maxLength) {
    schema = schema.max(maxLength);
  }

  return schema.transform((value) => (value === '' ? null : value));
}

function nullableDateTime() {
  return z
    .string()
    .trim()
    .refine((value) => !value || Boolean(fromDatetimeLocal(value)), 'Укажите корректную дату и время')
    .transform((value) => (value === '' ? null : value));
}
