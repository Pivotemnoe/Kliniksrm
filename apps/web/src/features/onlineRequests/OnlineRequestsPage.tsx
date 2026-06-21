import { CalendarOutlined, CheckCircleOutlined, CloseOutlined, CopyOutlined, InboxOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Drawer, Form, Input, QRCode, Select, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { formatDateTime, fromDatetimeLocal, toDatetimeLocal } from '../../shared/utils/date';
import { getSchedulingResources } from '../scheduling/scheduling.api';
import { listOwnerAnimals, listOwners } from '../owners/owners.api';
import {
  acceptOnlineRequest,
  archiveOnlineRequest,
  cancelOnlineRequest,
  createOnlineRequest,
  listOnlineRequests,
  updateOnlineRequest,
} from './onlineRequests.api';
import {
  AcceptOnlineRequestInput,
  CreateOnlineRequestInput,
  OnlineAppointmentRequest,
  OnlineRequestStatus,
  onlineRequestStatusColors,
  onlineRequestStatusLabels,
  UpdateOnlineRequestInput,
} from './types';

const pageSize = 10;
const activeStatuses: OnlineRequestStatus[] = ['NEW', 'IN_REVIEW'];
const statusOptions = Object.entries(onlineRequestStatusLabels).map(([value, label]) => ({ value, label }));

const requestSchema = z.object({
  ownerName: z.string().trim().min(2, 'Укажите имя владельца').max(200),
  phone: z.string().trim().min(5, 'Укажите телефон').max(32),
  email: z.string().trim().email('Некорректный email').or(z.literal('')).optional(),
  animalNickname: z.string().trim().min(1, 'Укажите кличку').max(160),
  animalSpecies: z.string().trim().max(120).optional(),
  animalBreed: z.string().trim().max(160).optional(),
  preferredAt: z.string().optional(),
  comment: z.string().trim().max(1000).optional(),
  internalComment: z.string().trim().max(1000).optional(),
});

const acceptSchema = z.object({
  ownerId: z.string().trim().min(1, 'Выберите владельца'),
  animalId: z.string().trim().min(1, 'Выберите пациента'),
  officeId: z.string().optional(),
  employeeId: z.string().optional(),
  roomId: z.string().optional(),
  startsAt: z.string().min(1, 'Укажите дату и время'),
  endsAt: z.string().optional(),
  comment: z.string().trim().max(1000).optional(),
});

type RequestFormValues = z.infer<typeof requestSchema>;
type AcceptFormValues = z.infer<typeof acceptSchema>;

export function OnlineRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canManage = hasPermission(auth?.employee, 'appointments.manage');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OnlineRequestStatus | undefined>();
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<OnlineAppointmentRequest | null>(null);
  const publicRequestUrl = useMemo(() => getPublicOnlineRequestUrl(), []);

  const requestsQuery = useQuery({
    queryKey: ['online-requests', { search, status, limit: pageSize, offset }],
    queryFn: () => listOnlineRequests({ search, status, limit: pageSize, offset }),
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateOnlineRequestInput) => createOnlineRequest(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['online-requests'] });
      message.success('Заявка создана');
      setCreateOpen(false);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: ({ request, action }: { request: OnlineAppointmentRequest; action: 'cancel' | 'archive' }) =>
      action === 'cancel' ? cancelOnlineRequest(request.id) : archiveOnlineRequest(request.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['online-requests'] });
      message.success('Статус заявки обновлён');
      setSelectedRequest(null);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns = useMemo<ColumnsType<OnlineAppointmentRequest>>(
    () => [
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (value: OnlineRequestStatus) => <Tag color={onlineRequestStatusColors[value]}>{onlineRequestStatusLabels[value]}</Tag>,
      },
      {
        title: 'Клиент',
        key: 'owner',
        render: (_, request) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{request.ownerName}</Typography.Text>
            <Typography.Text type="secondary">{request.phone}</Typography.Text>
          </Space>
        ),
      },
      {
        title: 'Пациент',
        key: 'animal',
        render: (_, request) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{request.animalNickname}</Typography.Text>
            <Typography.Text type="secondary">
              {[request.animalSpecies, request.animalBreed].filter(Boolean).join(', ') || 'Вид не указан'}
            </Typography.Text>
          </Space>
        ),
      },
      { title: 'Желаемое время', dataIndex: 'preferredAt', key: 'preferredAt', width: 180, render: formatDateTime },
      {
        title: 'Запись',
        key: 'appointment',
        width: 190,
        render: (_, request) =>
          request.appointment ? (
            <Button type="link" className="table-link" onClick={() => navigate(`/schedule/${request.appointment!.id}`)}>
              {formatDateTime(request.appointment.startsAt)}
            </Button>
          ) : (
            '—'
          ),
      },
      { title: 'Создана', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: formatDateTime },
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
        title="Онлайн-запись"
        description="Заявки клиентов из публичной формы или личного кабинета владельца."
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              Новая заявка
            </Button>
          ) : null
        }
      />
      <div className="public-link-panel">
        <div className="public-link-copy">
          <Space direction="vertical" size={2}>
            <Typography.Text strong>Публичная форма записи</Typography.Text>
            <Typography.Text type="secondary">Ссылка для сайта клиники, QR-кода на стойке и сообщений клиентам.</Typography.Text>
          </Space>
          <Typography.Text className="portal-invite-link">{publicRequestUrl}</Typography.Text>
          <Space wrap>
            <Button icon={<CopyOutlined />} onClick={() => copyPublicOnlineRequestUrl(publicRequestUrl, message)}>
              Скопировать
            </Button>
            <Button icon={<LinkOutlined />} onClick={() => window.open(publicRequestUrl, '_blank', 'noopener,noreferrer')}>
              Открыть
            </Button>
          </Space>
        </div>
        <QRCode value={publicRequestUrl} size={96} bordered={false} />
      </div>
      <div className="list-panel">
        <div className="list-panel-header">
          <Space wrap>
            <Input.Search
              allowClear
              className="search-input"
              placeholder="Поиск по клиенту, телефону или пациенту"
              onSearch={(value) => {
                setSearch(value);
                setOffset(0);
              }}
            />
            <Select
              allowClear
              className="status-filter"
              placeholder="Статус"
              value={status}
              options={statusOptions}
              onChange={(value) => {
                setStatus(value);
                setOffset(0);
              }}
            />
          </Space>
          <Space wrap>
            <Button icon={<InboxOutlined />} onClick={() => setStatus(undefined)}>
              Все
            </Button>
            <Button icon={<CalendarOutlined />} onClick={() => setStatus(activeStatuses[0])}>
              Новые
            </Button>
          </Space>
        </div>
        <div className="list-panel-body">
          {requestsQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(requestsQuery.error)} className="form-alert" /> : null}
          <Table<OnlineAppointmentRequest>
            rowKey="id"
            className="dense-table"
            columns={columns}
            dataSource={requestsQuery.data?.items ?? []}
            loading={requestsQuery.isLoading}
            pagination={{
              current: offset / pageSize + 1,
              pageSize,
              total: requestsQuery.data?.total ?? 0,
              showSizeChanger: false,
            }}
            onChange={handleTableChange}
            onRow={(request) => ({ onDoubleClick: () => setSelectedRequest(request) })}
          />
        </div>
      </div>
      <CreateRequestDrawer
        open={createOpen}
        loading={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
      />
      <RequestDrawer
        request={selectedRequest}
        canManage={canManage}
        actionLoading={actionMutation.isPending}
        onClose={() => setSelectedRequest(null)}
        onAction={(request, action) => actionMutation.mutate({ request, action })}
      />
    </div>
  );
}

function CreateRequestDrawer({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: CreateOnlineRequestInput) => void;
}) {
  const { control, handleSubmit, reset } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: getRequestDefaults(null),
  });

  useEffect(() => {
    if (open) {
      reset(getRequestDefaults(null));
    }
  }, [open, reset]);

  function submit(values: RequestFormValues) {
    onSubmit({
      ...values,
      email: values.email || null,
      preferredAt: values.preferredAt ? fromDatetimeLocal(values.preferredAt) : null,
      source: 'STAFF',
    });
  }

  return (
    <Drawer
      title="Новая онлайн-заявка"
      width={620}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={loading} onClick={handleSubmit(submit)}>
            Создать
          </Button>
        </Space>
      }
    >
      <RequestFields control={control} />
    </Drawer>
  );
}

function RequestDrawer({
  request,
  canManage,
  actionLoading,
  onClose,
  onAction,
}: {
  request: OnlineAppointmentRequest | null;
  canManage: boolean;
  actionLoading: boolean;
  onClose: () => void;
  onAction: (request: OnlineAppointmentRequest, action: 'cancel' | 'archive') => void;
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [ownerSearch, setOwnerSearch] = useState('');
  const updateForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: getRequestDefaults(request),
  });
  const acceptForm = useForm<AcceptFormValues>({
    resolver: zodResolver(acceptSchema),
    defaultValues: getAcceptDefaults(request),
  });
  const ownerId = useWatch({ control: acceptForm.control, name: 'ownerId' });
  const officeId = useWatch({ control: acceptForm.control, name: 'officeId' });
  const ownersQuery = useQuery({
    queryKey: ['owners', { search: ownerSearch, limit: 20, offset: 0 }],
    queryFn: () => listOwners({ search: ownerSearch, limit: 20, offset: 0 }),
    enabled: Boolean(request),
  });
  const animalsQuery = useQuery({
    queryKey: ['owners', ownerId, 'animals'],
    queryFn: () => listOwnerAnimals(ownerId),
    enabled: Boolean(request && ownerId),
  });
  const resourcesQuery = useQuery({
    queryKey: ['scheduling', 'resources'],
    queryFn: getSchedulingResources,
    enabled: Boolean(request),
  });
  const updateMutation = useMutation({
    mutationFn: (values: UpdateOnlineRequestInput) => updateOnlineRequest(request!.id, values),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['online-requests'] });
      message.success('Заявка сохранена');
      updateForm.reset(getRequestDefaults(updated));
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const acceptMutation = useMutation({
    mutationFn: (values: AcceptOnlineRequestInput) => acceptOnlineRequest(request!.id, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['online-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      ]);
      message.success('Заявка переведена в запись');
      onClose();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    updateForm.reset(getRequestDefaults(request));
    acceptForm.reset(getAcceptDefaults(request));
    setOwnerSearch('');
  }, [acceptForm, request, updateForm]);

  function submitUpdate(values: RequestFormValues) {
    updateMutation.mutate({
      ...values,
      preferredAt: values.preferredAt ? fromDatetimeLocal(values.preferredAt) : null,
    });
  }

  function submitAccept(values: AcceptFormValues) {
    acceptMutation.mutate({
      ...values,
      officeId: values.officeId || undefined,
      employeeId: values.employeeId || undefined,
      roomId: values.roomId || undefined,
      startsAt: fromDatetimeLocal(values.startsAt),
      endsAt: values.endsAt ? fromDatetimeLocal(values.endsAt) : undefined,
      comment: values.comment || undefined,
    });
  }

  const rooms = resourcesQuery.data?.rooms.filter((room) => !officeId || room.officeId === officeId) ?? [];
  const locked = request?.status === 'ACCEPTED' || request?.status === 'ARCHIVED' || request?.status === 'CANCELLED';

  return (
    <Drawer
      title={request ? `Заявка ${onlineRequestStatusLabels[request.status]}` : 'Заявка'}
      width={760}
      open={Boolean(request)}
      onClose={onClose}
      destroyOnHidden
      extra={request ? <Tag color={onlineRequestStatusColors[request.status]}>{onlineRequestStatusLabels[request.status]}</Tag> : null}
    >
      {request ? (
        <Space direction="vertical" size={18} className="full-width">
          <Form layout="vertical">
            <RequestFields control={updateForm.control} disabled={!canManage || locked} />
            {canManage && !locked ? (
              <Button loading={updateMutation.isPending} onClick={updateForm.handleSubmit(submitUpdate)}>
                Сохранить заявку
              </Button>
            ) : null}
          </Form>
          <div className="list-panel">
            <div className="list-panel-header">
              <Typography.Text strong>Перевод в расписание</Typography.Text>
            </div>
            <div className="list-panel-body">
              <Form layout="vertical">
                <div className="form-grid two-columns">
                  <Controller
                    control={acceptForm.control}
                    name="ownerId"
                    render={({ field, fieldState }) => (
                      <Form.Item label="Владелец" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                        <Select
                          {...field}
                          showSearch
                          filterOption={false}
                          disabled={locked}
                          loading={ownersQuery.isLoading}
                          placeholder="Найти владельца"
                          onSearch={setOwnerSearch}
                          options={ownersQuery.data?.items.map((owner) => ({
                            value: owner.id,
                            label: owner.phone ? `${owner.fullName}, ${owner.phone}` : owner.fullName,
                          }))}
                          onChange={(value) => {
                            field.onChange(value ?? '');
                            acceptForm.setValue('animalId', '');
                          }}
                        />
                      </Form.Item>
                    )}
                  />
                  <Controller
                    control={acceptForm.control}
                    name="animalId"
                    render={({ field, fieldState }) => (
                      <Form.Item label="Пациент" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                        <Select
                          {...field}
                          disabled={!ownerId || locked}
                          loading={animalsQuery.isLoading}
                          placeholder="Выберите пациента"
                          options={animalsQuery.data?.map((animal) => ({ value: animal.id, label: animal.nickname }))}
                          onChange={(value) => field.onChange(value ?? '')}
                        />
                      </Form.Item>
                    )}
                  />
                  <Controller
                    control={acceptForm.control}
                    name="startsAt"
                    render={({ field, fieldState }) => (
                      <Form.Item label="Дата и время" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                        <Input {...field} disabled={locked} type="datetime-local" />
                      </Form.Item>
                    )}
                  />
                  <Controller
                    control={acceptForm.control}
                    name="officeId"
                    render={({ field }) => (
                      <Form.Item label="Филиал">
                        <Select
                          {...field}
                          allowClear
                          disabled={locked}
                          loading={resourcesQuery.isLoading}
                          options={resourcesQuery.data?.offices.map((office) => ({ value: office.id, label: office.name }))}
                          onChange={(value) => {
                            field.onChange(value ?? '');
                            acceptForm.setValue('roomId', '');
                          }}
                        />
                      </Form.Item>
                    )}
                  />
                  <Controller
                    control={acceptForm.control}
                    name="roomId"
                    render={({ field }) => (
                      <Form.Item label="Кабинет">
                        <Select
                          {...field}
                          allowClear
                          disabled={locked}
                          loading={resourcesQuery.isLoading}
                          options={rooms.map((room) => ({ value: room.id, label: room.name }))}
                          onChange={(value) => field.onChange(value ?? '')}
                        />
                      </Form.Item>
                    )}
                  />
                  <Controller
                    control={acceptForm.control}
                    name="employeeId"
                    render={({ field }) => (
                      <Form.Item label="Сотрудник">
                        <Select
                          {...field}
                          allowClear
                          disabled={locked}
                          loading={resourcesQuery.isLoading}
                          options={resourcesQuery.data?.employees.map((employee) => ({ value: employee.id, label: employee.fullName }))}
                          onChange={(value) => field.onChange(value ?? '')}
                        />
                      </Form.Item>
                    )}
                  />
                </div>
                <Controller
                  control={acceptForm.control}
                  name="comment"
                  render={({ field }) => (
                    <Form.Item label="Комментарий к записи">
                      <Input.TextArea {...field} disabled={locked} rows={3} />
                    </Form.Item>
                  )}
                />
                <Space wrap>
                  {canManage && !locked ? (
                    <Button type="primary" icon={<CheckCircleOutlined />} loading={acceptMutation.isPending} onClick={acceptForm.handleSubmit(submitAccept)}>
                      Принять в расписание
                    </Button>
                  ) : null}
                  {canManage && request.status !== 'CANCELLED' && request.status !== 'ACCEPTED' ? (
                    <Button icon={<CloseOutlined />} loading={actionLoading} onClick={() => onAction(request, 'cancel')}>
                      Отменить
                    </Button>
                  ) : null}
                  {canManage && request.status !== 'ARCHIVED' ? (
                    <Button loading={actionLoading} onClick={() => onAction(request, 'archive')}>
                      В архив
                    </Button>
                  ) : null}
                </Space>
              </Form>
            </div>
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}

function RequestFields({ control, disabled = false }: { control: ReturnType<typeof useForm<RequestFormValues>>['control']; disabled?: boolean }) {
  return (
    <>
      <div className="form-grid two-columns">
        <Controller
          control={control}
          name="ownerName"
          render={({ field, fieldState }) => (
            <Form.Item label="Владелец" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} disabled={disabled} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <RussianPhoneInput {...field} disabled={disabled} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Form.Item label="Email" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} disabled={disabled} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="preferredAt"
          render={({ field }) => (
            <Form.Item label="Желаемая дата">
              <Input {...field} disabled={disabled} type="datetime-local" />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="animalNickname"
          render={({ field, fieldState }) => (
            <Form.Item label="Пациент" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} disabled={disabled} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="animalSpecies"
          render={({ field }) => (
            <Form.Item label="Вид">
              <Input {...field} disabled={disabled} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="animalBreed"
          render={({ field }) => (
            <Form.Item label="Порода">
              <Input {...field} disabled={disabled} />
            </Form.Item>
          )}
        />
      </div>
      <Controller
        control={control}
        name="comment"
        render={({ field }) => (
          <Form.Item label="Комментарий клиента">
            <Input.TextArea {...field} disabled={disabled} rows={3} />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="internalComment"
        render={({ field }) => (
          <Form.Item label="Комментарий клиники">
            <Input.TextArea {...field} disabled={disabled} rows={3} />
          </Form.Item>
        )}
      />
    </>
  );
}

function getRequestDefaults(request: OnlineAppointmentRequest | null): RequestFormValues {
  return {
    ownerName: request?.ownerName ?? '',
    phone: request?.phone ?? '',
    email: request?.email ?? '',
    animalNickname: request?.animalNickname ?? '',
    animalSpecies: request?.animalSpecies ?? '',
    animalBreed: request?.animalBreed ?? '',
    preferredAt: request?.preferredAt ? toDatetimeLocal(request.preferredAt) : '',
    comment: request?.comment ?? '',
    internalComment: request?.internalComment ?? '',
  };
}

function getAcceptDefaults(request: OnlineAppointmentRequest | null): AcceptFormValues {
  return {
    ownerId: request?.ownerId ?? '',
    animalId: request?.animalId ?? '',
    officeId: '',
    employeeId: request?.appointment?.employee?.id ?? '',
    roomId: request?.appointment?.room?.id ?? '',
    startsAt: request?.preferredAt ? toDatetimeLocal(request.preferredAt) : '',
    endsAt: '',
    comment: request?.comment ?? '',
  };
}

function getPublicOnlineRequestUrl() {
  return `${window.location.origin}/online`;
}

async function copyPublicOnlineRequestUrl(url: string, message: ReturnType<typeof App.useApp>['message']) {
  try {
    await navigator.clipboard.writeText(url);
    message.success('Ссылка скопирована');
  } catch {
    message.warning('Не удалось скопировать ссылку автоматически');
  }
}
