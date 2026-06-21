import { CloseOutlined, EditOutlined, EyeOutlined, PlusOutlined, RedoOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Descriptions, Drawer, Form, Input, Select, Space, Table, Tabs, Tag, Tooltip, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { fromDatetimeLocal, formatDateTime } from '../../shared/utils/date';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import {
  cancelNotification,
  createNotification,
  listNotificationOutbox,
  listNotificationTemplates,
  retryNotification,
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
} from './types';

const pageSize = 10;
const channelOptions = Object.entries(notificationChannelLabels).map(([value, label]) => ({ value, label }));

export function MessagesPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'notifications.manage');
  const [status, setStatus] = useState<NotificationStatus | undefined>();
  const [channel, setChannel] = useState<NotificationChannel | undefined>();
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [selectedOutbox, setSelectedOutbox] = useState<NotificationOutboxItem | null>(null);

  const outboxQuery = useQuery({
    queryKey: ['notifications', 'outbox', { status, channel, limit: pageSize, offset }],
    queryFn: () => listNotificationOutbox({ status, channel, limit: pageSize, offset }),
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
      message.success('Уведомление поставлено в очередь');
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
      message.success('Статус уведомления обновлён');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

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
        title: 'Получатель',
        dataIndex: 'recipient',
        key: 'recipient',
        width: 190,
        ellipsis: true,
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
      {
        title: 'Попытки',
        dataIndex: 'attempts',
        key: 'attempts',
        width: 95,
        render: (value: number) => value || 0,
      },
      {
        title: 'Ошибка',
        dataIndex: 'lastError',
        key: 'lastError',
        width: 220,
        ellipsis: true,
        render: (value: string | null) =>
          value ? (
            <Tooltip title={value}>
              <Typography.Text type="danger">{value}</Typography.Text>
            </Tooltip>
          ) : (
            '—'
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
        title="Сообщения"
        description="Локальная очередь уведомлений, шаблоны и будущие внешние каналы Telegram, MAX, SMS, email."
        extra={
          canManage ? (
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => setTemplateOpen(true)}>
                Новый шаблон
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                Создать уведомление
              </Button>
            </Space>
          ) : null
        }
      />
      <Tabs
        items={[
          {
            key: 'outbox',
            label: 'Очередь отправки',
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
        templates={templatesQuery.data ?? []}
        submitError={createMutation.error}
        isSubmitting={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
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
      title="Сообщение в очереди"
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
            <Descriptions.Item label="Получатель">{item.recipient}</Descriptions.Item>
            <Descriptions.Item label="Владелец">{item.owner?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Пациент">{getAnimalLabel(item)}</Descriptions.Item>
            <Descriptions.Item label="Шаблон">{getTemplateLabel(item)}</Descriptions.Item>
            <Descriptions.Item label="Создал">{item.createdBy?.fullName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Попытки">{item.attempts || 0}</Descriptions.Item>
            <Descriptions.Item label="Запланировано">{formatDateTime(item.scheduledAt)}</Descriptions.Item>
            <Descriptions.Item label="Отправлено">{formatDateTime(item.sentAt)}</Descriptions.Item>
            <Descriptions.Item label="Создано">{formatDateTime(item.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Обновлено">{formatDateTime(item.updatedAt)}</Descriptions.Item>
          </Descriptions>
          {item.lastError ? <Alert type="error" showIcon message="Ошибка отправки" description={item.lastError} /> : null}
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
  channel: z.enum(['INTERNAL', 'TELEGRAM', 'MAX', 'SMS', 'EMAIL', 'PUSH']),
  ownerId: nullableString(),
  animalId: nullableString(),
  templateId: nullableString(),
  recipient: z.string().trim().min(2, 'Укажите получателя').max(300),
  subject: nullableString(300),
  body: z.string().trim().min(1, 'Введите текст').max(4000),
  scheduledAt: nullableDateTime(),
});

type NotificationFormValues = z.infer<typeof notificationSchema>;
type NotificationFormInput = z.input<typeof notificationSchema>;

function NotificationFormDrawer({
  open,
  templates,
  submitError,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
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

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getNotificationDefaults());
      setOwnerSearch('');
    }
  }

  function submit(values: NotificationFormValues) {
    onSubmit({
      channel: values.channel,
      ownerId: values.ownerId,
      animalId: values.animalId,
      templateId: values.templateId,
      recipient: values.recipient,
      subject: values.subject,
      body: values.body,
      scheduledAt: values.scheduledAt ? fromDatetimeLocal(values.scheduledAt) : null,
    });
  }

  return (
    <Drawer
      title="Новое уведомление"
      width={680}
      open={open}
      onClose={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>
            Поставить в очередь
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
            render={({ field }) => (
              <Form.Item label="Канал">
                <Select {...field} options={channelOptions} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="scheduledAt"
            render={({ field }) => (
              <Form.Item label="Отправить после">
                <Input type="datetime-local" {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="ownerId"
            render={({ field }) => (
              <Form.Item label="Владелец">
                <Select
                  {...field}
                  allowClear
                  showSearch
                  filterOption={false}
                  onSearch={setOwnerSearch}
                  loading={ownersQuery.isLoading}
                  placeholder="Найти владельца"
                  options={ownersQuery.data?.items.map((owner) => ({
                    value: owner.id,
                    label: owner.phone ? `${owner.fullName}, ${owner.phone}` : owner.fullName,
                  }))}
                  onChange={(value) => {
                    field.onChange(value ?? '');
                    setValue('animalId', '');
                  }}
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
        <Controller
          control={control}
          name="templateId"
          render={({ field }) => (
            <Form.Item label="Шаблон">
              <Select
                {...field}
                allowClear
                placeholder="Без шаблона"
                options={templates.map((template) => ({
                  value: template.id,
                  label: `${template.channel}: ${template.title}`,
                }))}
                onChange={(value) => {
                  field.onChange(value ?? '');
                  const template = templates.find((item) => item.id === value);
                  if (template) {
                    setValue('channel', template.channel as NotificationChannel);
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
          name="recipient"
          render={({ field, fieldState }) => (
            <Form.Item label="Получатель" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} placeholder="chat id, телефон, email или внутренний идентификатор" />
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
              <Input.TextArea rows={6} {...field} />
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

function getNotificationDefaults(): NotificationFormInput {
  return {
    channel: 'TELEGRAM',
    ownerId: '',
    animalId: '',
    templateId: '',
    recipient: '',
    subject: '',
    body: '',
    scheduledAt: '',
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
