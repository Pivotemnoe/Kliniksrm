import {
  CalendarOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Empty, Form, Input, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { AnimalSpeciesLabel } from '../../shared/ui/AnimalSpeciesIcon';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { fromDatetimeLocal, formatDate, formatDateTime } from '../../shared/utils/date';
import { AnimalCatalogFields } from '../animals/AnimalCatalogFields';
import { createPortalOnlineRequest, getClientPortalSummary, requestClientPortalCode, verifyClientPortalCode } from './clientPortal.api';
import {
  ClientPortalDeliveryChannel,
  CreatePortalOnlineRequestInput,
  PortalAnimal,
  PortalAppointment,
  PortalBill,
  PortalNotification,
  PortalOnlineRequest,
  PortalVisit,
} from './types';

const requestSchema = z.object({
  animalId: z.string().optional(),
  animalNickname: z.string().optional(),
  animalSpecies: z.string().optional(),
  animalBreed: z.string().optional(),
  preferredAt: z.string().optional(),
  comment: z.string().max(1000, 'До 1000 символов').optional(),
});
const portalLoginSchema = z.object({
  phone: z.string().trim().min(7, 'Укажите телефон').max(32, 'До 32 символов'),
  code: z.string().trim().optional(),
});

type RequestFormValues = z.infer<typeof requestSchema>;
type PortalLoginFormValues = z.infer<typeof portalLoginSchema>;

const appointmentStatusLabels: Record<string, string> = {
  PLANNED: 'Запланирована',
  ARRIVED: 'Пришёл',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Не пришёл',
};

const requestStatusLabels: Record<string, string> = {
  NEW: 'Новая',
  IN_REVIEW: 'В обработке',
  ACCEPTED: 'Принята',
  CANCELLED: 'Отменена',
  ARCHIVED: 'Архив',
};

const billStatusLabels: Record<string, string> = {
  UNPAID: 'Не оплачен',
  PARTIAL: 'Частично',
  PAID: 'Оплачен',
  REFUNDED: 'Возврат',
  CANCELLED: 'Отменён',
};

const documentStatusLabels: Record<string, string> = {
  DRAFT: 'Черновик',
  GENERATED: 'Сформирован',
  SIGNED: 'Подписан',
  CANCELLED: 'Отменён',
};

type PortalDocumentRow = PortalVisit['documents'][number] & {
  visitStartedAt: string;
  animal: PortalVisit['animal'];
};

export function ClientPortalPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const portalQuery = useQuery({
    queryKey: ['client-portal', token],
    queryFn: () => getClientPortalSummary(token),
    enabled: Boolean(token),
  });
  const form = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { animalId: undefined, preferredAt: '', comment: '' },
  });
  const selectedAnimalId = useWatch({ control: form.control, name: 'animalId' });
  const selectedAnimal = portalQuery.data?.owner.animals.find((animal) => animal.id === selectedAnimalId);
  const createMutation = useMutation({
    mutationFn: (values: CreatePortalOnlineRequestInput) => createPortalOnlineRequest(token, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['client-portal', token] });
      form.reset({ animalId: selectedAnimalId, preferredAt: '', comment: '' });
      message.success('Заявка отправлена в клинику');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const data = portalQuery.data;

  const appointmentColumns = useMemo<ColumnsType<PortalAppointment>>(
    () => [
      { title: 'Дата', dataIndex: 'startsAt', key: 'startsAt', width: 180, render: formatDateTime },
      { title: 'Пациент', key: 'animal', render: (_, item) => <AnimalSpeciesLabel species={item.animal.species} fallback={item.animal.nickname} /> },
      { title: 'Статус', dataIndex: 'status', key: 'status', width: 140, render: (value: string) => statusTag(appointmentStatusLabels[value] ?? value) },
      { title: 'Врач', key: 'employee', render: (_, item) => item.employee?.fullName ?? '—' },
      { title: 'Кабинет', key: 'room', render: (_, item) => item.room?.name ?? '—' },
      { title: 'Комментарий', dataIndex: 'comment', key: 'comment', render: (value: string | null) => value || '—' },
    ],
    [],
  );
  const visitColumns = useMemo<ColumnsType<PortalVisit>>(
    () => [
      { title: 'Дата', dataIndex: 'startedAt', key: 'startedAt', width: 170, render: formatDateTime },
      { title: 'Пациент', key: 'animal', render: (_, item) => <AnimalSpeciesLabel species={item.animal.species} fallback={item.animal.nickname} /> },
      { title: 'Статус', dataIndex: 'status', key: 'status', width: 130, render: (value: string) => statusTag(value) },
      { title: 'Диагнозы', key: 'diagnoses', render: (_, item) => item.diagnoses.map((diagnosis) => diagnosis.title).join(', ') || '—' },
      { title: 'Рекомендации', key: 'recommendation', render: (_, item) => item.recommendation?.treatmentPlan || item.recommendation?.careNotes || '—' },
      { title: 'Документы', key: 'documents', width: 120, render: (_, item) => item.documents.length || '—' },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: formatMoney },
    ],
    [],
  );
  const billColumns = useMemo<ColumnsType<PortalBill>>(
    () => [
      { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: formatDateTime },
      { title: 'Пациент', key: 'animal', render: (_, item) => item.animal?.nickname ?? '—' },
      { title: 'Статус', dataIndex: 'status', key: 'status', width: 130, render: (value: string) => statusTag(billStatusLabels[value] ?? value) },
      { title: 'Сумма', dataIndex: 'totalAmount', key: 'totalAmount', width: 130, render: formatMoney },
      { title: 'Оплачено', dataIndex: 'paidAmount', key: 'paidAmount', width: 130, render: formatMoney },
      { title: 'Позиции', key: 'items', render: (_, item) => item.items.map((billItem) => billItem.title).join(', ') || '—' },
    ],
    [],
  );
  const notificationColumns = useMemo<ColumnsType<PortalNotification>>(
    () => [
      { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: formatDateTime },
      { title: 'Канал', dataIndex: 'channel', key: 'channel', width: 110 },
      { title: 'Статус', dataIndex: 'status', key: 'status', width: 120, render: statusTag },
      { title: 'Сообщение', key: 'body', render: (_, item) => item.subject ? `${item.subject}: ${item.body}` : item.body },
    ],
    [],
  );
  const documentRows = useMemo<PortalDocumentRow[]>(
    () =>
      data?.visits.flatMap((visit) =>
        visit.documents.map((document) => ({
          ...document,
          visitStartedAt: visit.startedAt,
          animal: visit.animal,
        })),
      ) ?? [],
    [data?.visits],
  );
  const documentColumns = useMemo<ColumnsType<PortalDocumentRow>>(
    () => [
      { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: formatDateTime },
      { title: 'Документ', dataIndex: 'title', key: 'title' },
      { title: 'Пациент', key: 'animal', render: (_, item) => <AnimalSpeciesLabel species={item.animal.species} fallback={item.animal.nickname} /> },
      { title: 'Приём', dataIndex: 'visitStartedAt', key: 'visitStartedAt', width: 170, render: formatDateTime },
      {
        title: 'Статус',
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (value: string) => statusTag(documentStatusLabels[value] ?? value),
      },
    ],
    [],
  );
  const requestColumns = useMemo<ColumnsType<PortalOnlineRequest>>(
    () => [
      { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: formatDateTime },
      { title: 'Пациент', key: 'animal', render: (_, item) => item.animal?.nickname ?? '—' },
      { title: 'Желаемое время', dataIndex: 'preferredAt', key: 'preferredAt', width: 180, render: formatDateTime },
      { title: 'Статус', dataIndex: 'status', key: 'status', width: 140, render: (value: string) => statusTag(requestStatusLabels[value] ?? value) },
      { title: 'Комментарий', dataIndex: 'comment', key: 'comment', render: (value: string | null) => value || '—' },
    ],
    [],
  );

  function submitRequest(values: RequestFormValues) {
    const animal = data?.owner.animals.find((item) => item.id === values.animalId);
    createMutation.mutate({
      animalId: values.animalId || undefined,
      animalNickname: animal?.nickname ?? values.animalNickname,
      animalSpecies: animal?.species ?? values.animalSpecies,
      animalBreed: animal?.breed ?? values.animalBreed,
      preferredAt: fromDatetimeLocal(values.preferredAt),
      comment: values.comment,
    });
  }

  if (!token) {
    return <ClientPortalLoginPage onVerified={(verifiedToken) => navigate(`/portal/${verifiedToken}`, { replace: true })} />;
  }

  if (portalQuery.isLoading) {
    return <div className="screen-loader">Загружаем личный кабинет...</div>;
  }

  if (portalQuery.isError || !data) {
    return (
      <div className="portal-screen">
        <PortalHeader />
        <div className="portal-error">
          <Alert type="error" showIcon message={getErrorMessage(portalQuery.error)} />
        </div>
      </div>
    );
  }

  return (
    <div className="portal-screen">
      <PortalHeader ownerName={data.owner.fullName} />
      <main className="portal-page">
        <section className="portal-summary">
          <div>
            <Typography.Title level={1}>Личный кабинет</Typography.Title>
            <Typography.Text type="secondary">Данные владельца, пациенты, история клиники и онлайн-заявки.</Typography.Text>
          </div>
          <Space wrap>
            <Statistic title="Пациентов" value={data.owner.animals.length} />
            <Statistic title="Баланс" value={formatMoney(data.owner.balance)} />
          </Space>
        </section>

        <section className="portal-grid">
          <div className="list-panel portal-owner-panel">
            <div className="list-panel-header">
              <Typography.Title level={4} className="compact-title">Владелец</Typography.Title>
            </div>
            <div className="list-panel-body">
              <InfoRow label="ФИО" value={data.owner.fullName} />
              <InfoRow label="Телефон" value={data.owner.phone} />
              <InfoRow label="Email" value={data.owner.email} />
              <InfoRow label="Адрес" value={data.owner.address} />
            </div>
          </div>

          <div className="list-panel">
            <div className="list-panel-header">
              <Space direction="vertical" size={2}>
                <Typography.Title level={4} className="compact-title">Новая заявка</Typography.Title>
                <Typography.Text type="secondary">Администратор увидит её в разделе онлайн-записи.</Typography.Text>
              </Space>
              <CalendarOutlined />
            </div>
            <div className="list-panel-body">
              {createMutation.error ? <Alert type="error" showIcon message={getErrorMessage(createMutation.error)} className="form-alert" /> : null}
              <Form layout="vertical" onFinish={form.handleSubmit(submitRequest)}>
                <Controller
                  control={form.control}
                  name="animalId"
                  render={({ field }) => (
                    <Form.Item label="Пациент">
                      <Select
                        {...field}
                        allowClear
                        placeholder="Выберите пациента"
                        options={data.owner.animals.map((animal) => ({ value: animal.id, label: `${animal.nickname}${animal.species ? `, ${animal.species}` : ''}` }))}
                      />
                    </Form.Item>
                  )}
                />
                {!selectedAnimal ? (
                  <div className="form-grid two-columns">
                    <Controller control={form.control} name="animalNickname" render={({ field }) => <Form.Item label="Кличка"><Input {...field} /></Form.Item>} />
                    <AnimalCatalogFields control={form.control} setValue={form.setValue} speciesName="animalSpecies" breedName="animalBreed" />
                  </div>
                ) : null}
                <Controller
                  control={form.control}
                  name="preferredAt"
                  render={({ field }) => (
                    <Form.Item label="Желаемая дата и время">
                      <Input {...field} type="datetime-local" />
                    </Form.Item>
                  )}
                />
                <Controller
                  control={form.control}
                  name="comment"
                  render={({ field }) => (
                    <Form.Item label="Комментарий">
                      <Input.TextArea {...field} rows={3} placeholder="Что случилось или на что записаться" />
                    </Form.Item>
                  )}
                />
                <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={createMutation.isPending}>
                  Отправить заявку
                </Button>
              </Form>
            </div>
          </div>
        </section>

        <Tabs
          className="portal-tabs"
          items={[
            {
              key: 'animals',
              label: 'Пациенты',
              children: <AnimalList animals={data.owner.animals} />,
            },
            {
              key: 'appointments',
              label: 'Записи',
              children: <PortalTable columns={appointmentColumns} data={data.appointments} icon={<CalendarOutlined />} emptyText="Записей пока нет" />,
            },
            {
              key: 'visits',
              label: 'История приёмов',
              children: <PortalTable columns={visitColumns} data={data.visits} icon={<HistoryOutlined />} emptyText="Приёмов пока нет" />,
            },
            {
              key: 'bills',
              label: 'Счета',
              children: <PortalTable columns={billColumns} data={data.bills} icon={<WalletOutlined />} emptyText="Счетов пока нет" />,
            },
            {
              key: 'documents',
              label: 'Документы',
              children: <PortalDocumentsTable columns={documentColumns} data={documentRows} />,
            },
            {
              key: 'requests',
              label: 'Заявки',
              children: <PortalTable columns={requestColumns} data={data.onlineRequests} icon={<ReloadOutlined />} emptyText="Заявок пока нет" />,
            },
            {
              key: 'notifications',
              label: 'Уведомления',
              children: <PortalTable columns={notificationColumns} data={data.notifications} icon={<MessageOutlined />} emptyText="Уведомлений пока нет" />,
            },
          ]}
        />
      </main>
    </div>
  );
}

function PortalHeader({ ownerName }: { ownerName?: string }) {
  return (
    <header className="portal-header">
      <img src="/brand/temichevvet-logo.jpg" alt="TemichevVet" />
      <div>
        <Typography.Text strong>TemichevVet</Typography.Text>
        {ownerName ? <Typography.Text type="secondary">{ownerName}</Typography.Text> : null}
      </div>
    </header>
  );
}

function ClientPortalLoginPage({ onVerified }: { onVerified: (token: string) => void }) {
  const { message } = App.useApp();
  const form = useForm<PortalLoginFormValues>({
    resolver: zodResolver(portalLoginSchema),
    defaultValues: { phone: '', code: '' },
  });
  const [codeRequested, setCodeRequested] = useState(false);
  const [debugCode, setDebugCode] = useState<string | undefined>();
  const [expiresAt, setExpiresAt] = useState<string | undefined>();
  const [deliveryChannel, setDeliveryChannel] = useState<ClientPortalDeliveryChannel | undefined>();
  const requestCodeMutation = useMutation({
    mutationFn: (values: Pick<PortalLoginFormValues, 'phone'>) => requestClientPortalCode(values),
    onSuccess: (response) => {
      setCodeRequested(true);
      setDebugCode(response.debugCode);
      setExpiresAt(response.expiresAt);
      setDeliveryChannel(response.deliveryChannel);
      message.success('Код подтверждения создан');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const verifyCodeMutation = useMutation({
    mutationFn: (values: { phone: string; code: string }) => verifyClientPortalCode(values),
    onSuccess: (response) => {
      message.success('Вход выполнен');
      onVerified(response.token);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  function submit(values: PortalLoginFormValues) {
    if (!codeRequested) {
      requestCodeMutation.mutate({ phone: values.phone });
      return;
    }

    if (!values.code?.trim()) {
      form.setError('code', { message: 'Введите код подтверждения' });
      return;
    }

    verifyCodeMutation.mutate({ phone: values.phone, code: values.code.trim() });
  }

  function resetPhone() {
    setCodeRequested(false);
    setDebugCode(undefined);
    setExpiresAt(undefined);
    setDeliveryChannel(undefined);
    form.setValue('code', '');
  }

  return (
    <div className="portal-screen">
      <PortalHeader />
      <main className="portal-auth-page">
        <section className="portal-auth-copy">
          <Typography.Title level={1}>Личный кабинет</Typography.Title>
          <Typography.Text type="secondary">Вход для владельцев пациентов TemichevVet по телефону из карточки клиента.</Typography.Text>
        </section>
        <div className="list-panel portal-auth-card">
          <div className="list-panel-header">
            <Space direction="vertical" size={2}>
              <Typography.Title level={4} className="compact-title">Вход по телефону</Typography.Title>
              <Typography.Text type="secondary">
                {codeRequested ? `Код действует до ${formatDateTime(expiresAt)}` : 'Запросите код подтверждения.'}
              </Typography.Text>
            </Space>
          </div>
          <div className="list-panel-body">
            {requestCodeMutation.error ? <Alert type="error" showIcon message={getErrorMessage(requestCodeMutation.error)} className="form-alert" /> : null}
            {verifyCodeMutation.error ? <Alert type="error" showIcon message={getErrorMessage(verifyCodeMutation.error)} className="form-alert" /> : null}
            {debugCode ? (
              <Alert
                type="info"
                showIcon
                className="form-alert"
                message={`Тестовый код: ${debugCode}`}
                description="В рабочем режиме этот код будет уходить через подключённый канал уведомлений."
              />
            ) : codeRequested ? (
              <Alert type="success" showIcon className="form-alert" message={`Код отправлен: ${formatPortalDeliveryChannel(deliveryChannel)}`} />
            ) : null}
            <Form layout="vertical" onFinish={form.handleSubmit(submit)}>
              <Controller
                control={form.control}
                name="phone"
                render={({ field, fieldState }) => (
                  <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                    <RussianPhoneInput {...field} disabled={codeRequested} />
                  </Form.Item>
                )}
              />
              {codeRequested ? (
                <Controller
                  control={form.control}
                  name="code"
                  render={({ field, fieldState }) => (
                    <Form.Item label="Код подтверждения" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                      <Input {...field} inputMode="numeric" maxLength={8} placeholder="6 цифр" />
                    </Form.Item>
                  )}
                />
              ) : null}
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={requestCodeMutation.isPending || verifyCodeMutation.isPending}>
                  {codeRequested ? 'Войти' : 'Получить код'}
                </Button>
                {codeRequested ? <Button onClick={resetPhone}>Изменить телефон</Button> : null}
              </Space>
            </Form>
          </div>
        </div>
      </main>
    </div>
  );
}

function AnimalList({ animals }: { animals: PortalAnimal[] }) {
  if (!animals.length) {
    return <Empty description="Пациенты пока не добавлены" />;
  }

  return (
    <div className="portal-animal-grid">
      {animals.map((animal) => (
        <article className="portal-animal" key={animal.id}>
          <div className="portal-animal-title">
            <AnimalSpeciesLabel species={animal.species} fallback={animal.nickname} size={24} />
            <Tag>{animal.sex === 'MALE' ? 'Самец' : animal.sex === 'FEMALE' ? 'Самка' : 'Пол не указан'}</Tag>
          </div>
          <InfoRow label="Порода" value={animal.breed} />
          <InfoRow label="Дата рождения" value={formatDate(animal.birthDate)} />
          <InfoRow label="Вес" value={animal.weights[0] ? `${animal.weights[0].weightKg} кг` : '—'} />
          <InfoRow label="Микрочип" value={animal.microchip} />
          <div className="portal-animal-vaccines">
            <Typography.Text strong>Вакцинации</Typography.Text>
            {animal.vaccinations.length ? (
              animal.vaccinations.map((vaccination) => (
                <span key={vaccination.id}>
                  {vaccination.title}
                  {vaccination.expiresAt ? ` до ${formatDate(vaccination.expiresAt)}` : ''}
                </span>
              ))
            ) : (
              <Typography.Text type="secondary">Нет данных</Typography.Text>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function PortalTable<T extends { id: string }>({ columns, data, icon, emptyText }: { columns: ColumnsType<T>; data: T[]; icon: ReactNode; emptyText: string }) {
  return (
    <div className="list-panel">
      <div className="list-panel-header">
        <span />
        {icon}
      </div>
      <div className="list-panel-body">
        <Table<T>
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={false}
          className="dense-table"
          locale={{ emptyText }}
          scroll={{ x: 920 }}
        />
      </div>
    </div>
  );
}

function PortalDocumentsTable({ columns, data }: { columns: ColumnsType<PortalDocumentRow>; data: PortalDocumentRow[] }) {
  return (
    <div className="list-panel">
      <div className="list-panel-header">
        <span />
        <FileTextOutlined />
      </div>
      <div className="list-panel-body">
        <Table<PortalDocumentRow>
          rowKey="id"
          columns={columns}
          dataSource={data}
          pagination={false}
          className="dense-table"
          locale={{ emptyText: 'Документов пока нет' }}
          scroll={{ x: 920 }}
          expandable={{
            expandedRowRender: (document) => (
              <Typography.Paragraph className="portal-document-body">
                {document.body || 'Текст документа не заполнен.'}
              </Typography.Paragraph>
            ),
            rowExpandable: (document) => Boolean(document.body),
          }}
        />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="portal-info-row">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
    </div>
  );
}

function statusTag(value: string) {
  return <Tag>{value}</Tag>;
}

function formatPortalDeliveryChannel(channel?: ClientPortalDeliveryChannel) {
  const labels: Record<ClientPortalDeliveryChannel, string> = {
    TELEGRAM: 'Telegram',
    MAX: 'MAX',
    SMS: 'SMS',
    EMAIL: 'Email',
    LOCAL: 'локально',
  };

  return channel ? labels[channel] : 'локально';
}

function formatMoney(value: string | number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return `${numberValue.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}
