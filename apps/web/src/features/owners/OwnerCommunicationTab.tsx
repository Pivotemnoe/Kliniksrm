import { CopyOutlined, LinkOutlined, LockOutlined, MailOutlined, ReloadOutlined, StopOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Descriptions, Drawer, Input, Popconfirm, QRCode, Radio, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime, fromDatetimeLocal } from '../../shared/utils/date';
import {
  createNotification,
  createPortalInvite,
  getPortalAccess,
  listNotificationOutbox,
  resetPortalConnection,
  syncPortalSnapshot,
  updatePortalAccess,
} from '../notifications/notifications.api';
import {
  ClientPortalAccess,
  ClientPortalInvite,
  notificationChannelLabels,
  NotificationOutboxItem,
  NotificationChannel,
  notificationStatusColors,
  notificationStatusLabels,
  NotificationStatus,
  PortalInviteChannel,
  portalStatusColors,
  portalStatusLabels,
} from '../notifications/types';
import { Owner } from './types';

type OwnerCommunicationTabProps = {
  owner: Owner;
};

export function OwnerCommunicationTab({ owner }: OwnerCommunicationTabProps) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [lastInvite, setLastInvite] = useState<ClientPortalInvite | null>(null);
  const [inviteChannel, setInviteChannel] = useState<PortalInviteChannel>(() => getInitialInviteChannel(owner));
  const [portalBaseUrl, setPortalBaseUrl] = useState(() => getInitialPortalBaseUrl());
  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);
  const [messageSubject, setMessageSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageScheduledAt, setMessageScheduledAt] = useState('');
  const [messageMessengerChannels, setMessageMessengerChannels] = useState<Array<'MAX' | 'TELEGRAM'>>([]);
  const portalQuery = useQuery({
    queryKey: ['owners', owner.id, 'portal-access'],
    queryFn: () => getPortalAccess(owner.id),
    refetchInterval: 30_000,
  });
  const outboxQuery = useQuery({
    queryKey: ['notifications', 'outbox', { ownerId: owner.id, limit: 20, offset: 0 }],
    queryFn: () => listNotificationOutbox({ ownerId: owner.id, limit: 20, offset: 0 }),
    refetchInterval: (query) => query.state.data?.items.some(
      (item) => item.status === 'QUEUED' || item.status === 'SENDING',
    ) ? 2_000 : false,
  });
  const portalMutation = useMutation({
    mutationFn: (values: { status: ClientPortalAccess['status']; blockedReason?: string | null }) => updatePortalAccess(owner.id, values),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['owners', owner.id, 'portal-access'] });
      setLastInvite(null);
      if (result.gatewaySync === 'failed') {
        message.warning('Не удалось подтвердить отключение кабинета. Проверьте интернет и повторите.');
      } else {
        message.success('Доступ обновлён');
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const inviteMutation = useMutation({
    mutationFn: (channel: PortalInviteChannel) => createPortalInvite(owner.id, { channel }),
    onSuccess: async (invite) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', owner.id, 'portal-access'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', owner.id] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
      ]);
      setLastInvite(invite);
      if (invite.gatewaySync === 'failed') {
        message.error('Не удалось создать приглашение. Проверьте интернет и повторите.');
      } else if (invite.gatewaySync === 'skipped_not_configured' && invite.inviteChannel !== 'WEB') {
        message.error('Отправка приглашений в мессенджер пока не настроена.');
      } else if (invite.automaticDelivery === 'sent') {
        message.success(`Приглашение создано и отправлено в ${formatInviteChannel(invite.inviteChannel)}`);
      } else if (invite.automaticDelivery === 'failed') {
        message.warning('Приглашение создано, но отправить его автоматически не удалось');
      } else {
        message.success('Приглашение создано на 24 часа');
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const syncMutation = useMutation({
    mutationFn: () => syncPortalSnapshot(owner.id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['owners', owner.id, 'portal-access'] });
      if (result.status === 'synced') {
        message.success('Данные личного кабинета обновлены');
      } else if (result.status === 'skipped_not_configured') {
        message.warning('Обновление личного кабинета пока не настроено');
      } else {
        message.warning('Не удалось обновить данные личного кабинета. Проверьте интернет и повторите.');
      }
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const resetMutation = useMutation({
    mutationFn: (channel: 'MAX' | 'TELEGRAM') => resetPortalConnection(owner.id, channel),
    onSuccess: async (_, channel) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['owners', owner.id, 'portal-access'] }),
        queryClient.invalidateQueries({ queryKey: ['owners', owner.id] }),
        queryClient.invalidateQueries({ queryKey: ['owners'] }),
      ]);
      setLastInvite(null);
      message.success(`Привязка ${channel === 'MAX' ? 'MAX' : 'Telegram'}, старые приглашения и активные входы сброшены`);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const sendMessageMutation = useMutation({
    mutationFn: () => createNotification({
      channel: 'MESSENGER',
      ownerId: owner.id,
      subject: messageSubject.trim() || null,
      body: messageBody.trim(),
      scheduledAt: messageScheduledAt ? fromDatetimeLocal(messageScheduledAt) : null,
      messengerChannels: messageMessengerChannels,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setMessageDrawerOpen(false);
      setMessageSubject('');
      setMessageBody('');
      setMessageScheduledAt('');
      setMessageMessengerChannels([]);
      message.success(messageScheduledAt ? 'Сообщение запланировано' : 'Сообщение поставлено на доставку');
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  const columns: ColumnsType<NotificationOutboxItem> = [
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: NotificationStatus) => <Tag color={notificationStatusColors[value]}>{notificationStatusLabels[value]}</Tag>,
    },
    {
      title: 'Канал',
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (value: NotificationChannel, item) => formatOutboxDelivery(value, item),
    },
    { title: 'Текст', dataIndex: 'body', key: 'body', ellipsis: true },
    { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: formatDateTime },
  ];

  const portalAccess = portalQuery.data;
  const maxLinked = Boolean(portalAccess?.gatewayStatus?.maxLinked || owner.maxUserId);
  const telegramLinked = Boolean(portalAccess?.gatewayStatus?.telegramLinked || owner.telegramChatId);
  const portalCanReceive = Boolean(
    portalAccess?.gatewayStatus?.hasSnapshot
      && (portalAccess.status === 'INVITED' || portalAccess.status === 'ENABLED'),
  );
  const additionalDeliveryChannels = [maxLinked ? 'MAX' : null, telegramLinked ? 'Telegram' : null].filter(Boolean).join(', ');
  const inviteToken = lastInvite?.inviteToken ?? portalAccess?.inviteToken ?? null;
  const activeInviteChannel = lastInvite?.inviteChannel ?? inviteChannel;
  const portalInviteLink = inviteToken ? buildPortalInviteLink(inviteToken, portalBaseUrl, activeInviteChannel) : null;
  const publicMessengerInviteUnavailable = Boolean(
    lastInvite
      && activeInviteChannel !== 'WEB'
      && lastInvite.gatewaySync !== 'synced',
  );
  const inviteLink = lastInvite?.deliveryUrl ?? (publicMessengerInviteUnavailable ? null : portalInviteLink);
  const inviteUsesLoopback = inviteLink ? isLoopbackUrl(inviteLink) : false;

  function handlePortalBaseUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setPortalBaseUrl(nextValue);
    savePortalBaseUrl(nextValue);
  }

  return (
    <Space direction="vertical" size={16} className="full-width">
      <div className="list-panel">
        <div className="list-panel-header">
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} className="compact-title">Связь с владельцем</Typography.Title>
            <Typography.Text type="secondary">Подключённые способы отправки сообщений.</Typography.Text>
          </Space>
          <Button
            type="primary"
            icon={<MailOutlined />}
            onClick={() => {
              setMessageMessengerChannels([]);
              setMessageDrawerOpen(true);
            }}
          >
            Написать владельцу
          </Button>
        </div>
        <div className="list-panel-body">
          <Space wrap size={12}>
            <Tag color={maxLinked ? 'green' : 'default'}>MAX: {maxLinked ? 'подключён' : 'не подключён'}</Tag>
            <Tag color={telegramLinked ? 'green' : 'default'}>Telegram: {telegramLinked ? 'подключён' : 'не подключён'}</Tag>
            <Typography.Text strong>
              {portalCanReceive
                ? `Личный кабинет доступен${additionalDeliveryChannels ? `. Дополнительно подключены: ${additionalDeliveryChannels}` : ''}`
                : 'Сначала создайте владельцу личный кабинет'}
            </Typography.Text>
          </Space>
        </div>
      </div>

      <div className="list-panel">
        <div className="list-panel-header">
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} className="compact-title">
              Личный кабинет
            </Typography.Title>
            <Typography.Text type="secondary">Доступ владельца к пациентам, приёмам, документам и сообщениям клиники.</Typography.Text>
          </Space>
          {portalAccess ? (
            <Tag color={portalStatusColors[portalAccess.status]}>{portalStatusLabels[portalAccess.status]}</Tag>
          ) : null}
        </div>
        <div className="list-panel-body">
          {portalQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(portalQuery.error)} className="form-alert" /> : null}
          {portalMutation.error ? <Alert type="error" showIcon message={getErrorMessage(portalMutation.error)} className="form-alert" /> : null}
          {inviteMutation.error ? <Alert type="error" showIcon message={getErrorMessage(inviteMutation.error)} className="form-alert" /> : null}
          <Space direction="vertical" size={8} className="full-width form-alert">
            <Typography.Text strong>Куда владелец хочет получить приглашение?</Typography.Text>
            <Radio.Group
              value={inviteChannel}
              optionType="button"
              buttonStyle="solid"
              onChange={(event) => setInviteChannel(event.target.value as PortalInviteChannel)}
            >
              <Radio.Button value="MAX">MAX</Radio.Button>
              <Radio.Button value="TELEGRAM">Telegram</Radio.Button>
              <Radio.Button value="WEB">Ссылка / QR</Radio.Button>
            </Radio.Group>
            <Typography.Text type="secondary">{getChannelPrompt(inviteChannel, owner)}</Typography.Text>
            <div>
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                loading={inviteMutation.isPending}
                onClick={() => inviteMutation.mutate(inviteChannel)}
              >
                {portalAccess?.status === 'INVITED' ? 'Создать новую ссылку / QR' : 'Создать приглашение'}
              </Button>
            </div>
          </Space>
          {publicMessengerInviteUnavailable ? (
            <Alert
              type="error"
              showIcon
              className="form-alert"
              message="Не удалось создать приглашение"
              description="Проверьте подключение к интернету и нажмите «Создать приглашение» ещё раз."
            />
          ) : null}
          {portalAccess?.status === 'INVITED' && !inviteLink && !inviteMutation.isPending ? (
            <Alert
              type="info"
              showIcon
              className="form-alert"
              message="Приглашение уже создано"
              description="Одноразовая ссылка не показывается повторно после обновления страницы. Чтобы снова получить ссылку или QR-код, нажмите «Создать новую ссылку / QR» — прежняя ссылка перестанет работать."
            />
          ) : null}
          {inviteLink ? (
            <Alert
              type="success"
              showIcon
              className="form-alert"
              message={`Приглашение: ${formatInviteChannel(activeInviteChannel)}`}
              description={
                <div className="portal-invite-layout">
                  <div className="portal-qr-card">
                    <QRCode value={inviteLink} size={132} />
                  </div>
                  <Space direction="vertical" size={8} className="full-width">
                    {activeInviteChannel === 'WEB' && inviteUsesLoopback ? (
                      <Typography.Text type="warning">
                        Эта ссылка работает только на серверном компьютере. Для телефона укажите сетевой адрес, например{' '}
                        http://192.168.0.80:3000.
                      </Typography.Text>
                    ) : null}
                    {activeInviteChannel === 'WEB' ? (
                      <Input
                        addonBefore="Адрес кабинета"
                        value={portalBaseUrl}
                        placeholder="http://192.168.0.80:3000"
                        onChange={handlePortalBaseUrlChange}
                      />
                    ) : null}
                    <Typography.Text className="portal-invite-link">{inviteLink}</Typography.Text>
                    <Typography.Text type="secondary">
                      {getGeneratedInviteHint(
                        activeInviteChannel,
                        lastInvite?.directDeliveryAvailable ?? false,
                        Boolean(lastInvite?.deliveryUrl),
                        lastInvite?.automaticDelivery,
                      )}
                    </Typography.Text>
                    <Space wrap>
                      <Button size="small" icon={<CopyOutlined />} onClick={() => copyInviteLink(inviteLink, message)}>
                        Скопировать ссылку
                      </Button>
                      <Button size="small" icon={<LinkOutlined />} onClick={() => window.open(inviteLink, '_blank', 'noopener,noreferrer')}>
                        Открыть
                      </Button>
                    </Space>
                  </Space>
                </div>
              }
            />
          ) : null}
          {portalAccess ? (
            <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} className="form-alert">
              <Descriptions.Item label="Приглашён">{formatDateTime(portalAccess.invitedAt)}</Descriptions.Item>
              <Descriptions.Item label="Действует до">{formatDateTime(portalAccess.inviteExpiresAt)}</Descriptions.Item>
              <Descriptions.Item label="Последний вход">{formatDateTime(portalAccess.lastLoginAt)}</Descriptions.Item>
              <Descriptions.Item label="Причина блокировки">{portalAccess.blockedReason || '—'}</Descriptions.Item>
            </Descriptions>
          ) : null}
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              Обновить данные кабинета
            </Button>
            {inviteLink ? (
              <Button icon={<LinkOutlined />} onClick={() => window.open(inviteLink ?? '', '_blank', 'noopener,noreferrer')}>
                Открыть приглашение
              </Button>
            ) : null}
            <Button
              icon={<StopOutlined />}
              loading={portalMutation.isPending}
              onClick={() => portalMutation.mutate({ status: 'DISABLED' })}
            >
              Выключить
            </Button>
            <Button
              icon={<LockOutlined />}
              loading={portalMutation.isPending}
              onClick={() => portalMutation.mutate({ status: 'BLOCKED', blockedReason: 'Заблокировано сотрудником клиники' })}
            >
              Заблокировать
            </Button>
            <Popconfirm
              title="Сбросить подключение MAX?"
              description="Старые приглашения и все текущие входы в кабинет перестанут работать. Данные владельца и пациентов сохранятся."
              okText="Сбросить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => resetMutation.mutate('MAX')}
            >
              <Button danger icon={<StopOutlined />} loading={resetMutation.isPending && resetMutation.variables === 'MAX'}>
                Сбросить MAX и входы
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Сбросить подключение Telegram?"
              description="Старые приглашения и все текущие входы в кабинет перестанут работать. Данные владельца и пациентов сохранятся."
              okText="Сбросить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => resetMutation.mutate('TELEGRAM')}
            >
              <Button danger icon={<StopOutlined />} loading={resetMutation.isPending && resetMutation.variables === 'TELEGRAM'}>
                Сбросить Telegram и входы
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </div>

      <div className="list-panel">
        <div className="list-panel-header">
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} className="compact-title">
              История сообщений
            </Typography.Title>
            <Typography.Text type="secondary">Последние сообщения владельцу.</Typography.Text>
          </Space>
          <MailOutlined />
        </div>
        <div className="list-panel-body">
          {outboxQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(outboxQuery.error)} className="form-alert" /> : null}
          <Table<NotificationOutboxItem>
            rowKey="id"
            columns={columns}
            dataSource={outboxQuery.data?.items ?? []}
            loading={outboxQuery.isLoading}
            pagination={false}
            className="dense-table"
          />
        </div>
      </div>

      <Drawer
        title={`Сообщение владельцу: ${owner.fullName}`}
        width={620}
        open={messageDrawerOpen}
        onClose={() => setMessageDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setMessageDrawerOpen(false)}>Отмена</Button>
            <Button
              type="primary"
              loading={sendMessageMutation.isPending}
              disabled={!portalCanReceive || !messageBody.trim()}
              onClick={() => sendMessageMutation.mutate()}
            >
              {messageScheduledAt ? 'Запланировать' : 'Отправить'}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={16} className="full-width">
          <Alert
            type={portalCanReceive ? 'success' : 'warning'}
            showIcon
            message={portalCanReceive
              ? 'Сообщение обязательно появится в личном кабинете'
              : 'Сначала создайте владельцу личный кабинет или обновите его данные'}
          />
          {sendMessageMutation.error ? (
            <Alert type="error" showIcon message={getErrorMessage(sendMessageMutation.error)} />
          ) : null}
          <div>
            <Typography.Text strong>Куда доставить</Typography.Text>
            <Space direction="vertical" size={6} className="full-width">
              <Checkbox checked disabled>Личный кабинет (обязательно)</Checkbox>
              <Checkbox
                checked={messageMessengerChannels.includes('MAX')}
                disabled={!maxLinked}
                onChange={(event) => setMessageMessengerChannels((current) => toggleChannel(current, 'MAX', event.target.checked))}
              >
                MAX{maxLinked ? '' : ' (не подключён)'}
              </Checkbox>
              <Checkbox
                checked={messageMessengerChannels.includes('TELEGRAM')}
                disabled={!telegramLinked}
                onChange={(event) => setMessageMessengerChannels((current) => toggleChannel(current, 'TELEGRAM', event.target.checked))}
              >
                Telegram{telegramLinked ? '' : ' (не подключён)'}
              </Checkbox>
            </Space>
            <Typography.Text type="secondary">
              Можно выбрать один или оба подключённых мессенджера. Без галочек сообщение останется только в личном кабинете.
            </Typography.Text>
          </div>
          <div>
            <Typography.Text strong>Тема</Typography.Text>
            <Input
              value={messageSubject}
              maxLength={300}
              placeholder="Необязательно"
              onChange={(event) => setMessageSubject(event.target.value)}
            />
          </div>
          <div>
            <Typography.Text strong>Сообщение</Typography.Text>
            <Input.TextArea
              value={messageBody}
              maxLength={4000}
              rows={7}
              autoFocus
              placeholder="Напишите сообщение владельцу"
              onChange={(event) => setMessageBody(event.target.value)}
            />
          </div>
          <div>
            <Typography.Text strong>Когда отправить</Typography.Text>
            <Input
              type="datetime-local"
              value={messageScheduledAt}
              onChange={(event) => setMessageScheduledAt(event.target.value)}
            />
            <Typography.Text type="secondary">Оставьте пустым, чтобы отправить сейчас.</Typography.Text>
          </div>
        </Space>
      </Drawer>
    </Space>
  );
}

function toggleChannel(
  channels: Array<'MAX' | 'TELEGRAM'>,
  channel: 'MAX' | 'TELEGRAM',
  checked: boolean,
) {
  return checked ? Array.from(new Set([...channels, channel])) : channels.filter((value) => value !== channel);
}

function formatOutboxDelivery(channel: NotificationChannel, item: NotificationOutboxItem) {
  if (channel === 'MAX' || channel === 'TELEGRAM') {
    return `Личный кабинет + ${notificationChannelLabels[channel]}`;
  }
  if (channel !== 'MESSENGER') {
    return notificationChannelLabels[channel] ?? channel;
  }

  const metadataDelivery = item.metadata?.delivery;
  const messengerChannels = metadataDelivery && typeof metadataDelivery === 'object' && !Array.isArray(metadataDelivery)
    ? (metadataDelivery as { messengerChannels?: unknown }).messengerChannels
    : null;
  const labels = Array.isArray(messengerChannels)
    ? messengerChannels.filter((value): value is 'MAX' | 'TELEGRAM' => value === 'MAX' || value === 'TELEGRAM')
    : [];

  return labels.length ? `Личный кабинет + ${labels.map((value) => notificationChannelLabels[value]).join(' + ')}` : 'Личный кабинет';
}

const portalBaseUrlStorageKey = 'temichevvet.portalBaseUrl';

function buildPortalInviteLink(token: string, baseUrl: string, channel: PortalInviteChannel) {
  return `${normalizePortalBaseUrl(baseUrl)}/portal/${encodeURIComponent(token)}?via=${channel.toLowerCase()}`;
}

function getInitialPortalBaseUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(portalBaseUrlStorageKey) || window.location.origin;
}

function savePortalBaseUrl(value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(portalBaseUrlStorageKey, value);
}

function normalizePortalBaseUrl(value: string) {
  const fallback = typeof window === 'undefined' ? '' : window.location.origin;
  const normalized = (value.trim() || fallback).replace(/\/+$/, '');
  return normalized && !/^[a-z][a-z\d+\-.]*:\/\//i.test(normalized) ? `http://${normalized}` : normalized;
}

function isLoopbackUrl(value: string) {
  try {
    const host = new URL(value).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

async function copyInviteLink(inviteLink: string, message: ReturnType<typeof App.useApp>['message']) {
  try {
    await navigator.clipboard.writeText(inviteLink);
    message.success('Ссылка скопирована');
  } catch {
    message.warning('Не удалось скопировать ссылку автоматически');
  }
}

function getInitialInviteChannel(owner: Owner): PortalInviteChannel {
  if (owner.preferredNotificationChannel === 'MAX') {
    return 'MAX';
  }

  if (owner.preferredNotificationChannel === 'TELEGRAM') {
    return 'TELEGRAM';
  }

  return 'WEB';
}

function formatInviteChannel(channel: PortalInviteChannel) {
  if (channel === 'WEB') {
    return 'ссылка или QR-код';
  }

  return channel === 'MAX' ? 'MAX' : 'Telegram';
}

function getChannelPrompt(channel: PortalInviteChannel, owner: Owner) {
  if (channel === 'MAX') {
    return owner.maxUserId
      ? 'MAX уже связан с владельцем. Создайте новую защищённую ссылку.'
      : 'Первое подключение MAX: покажите QR-код или передайте ссылку владельцу.';
  }

  if (channel === 'TELEGRAM') {
    return owner.telegramChatId
      ? 'Telegram уже связан с владельцем. Создайте новую защищённую ссылку.'
      : 'Первое подключение Telegram: владелец должен сам открыть ссылку и запустить бота.';
  }

  return 'Владелец откроет кабинет обычной ссылкой в браузере, без мессенджера.';
}

function getGeneratedInviteHint(
  channel: PortalInviteChannel,
  directDeliveryAvailable: boolean,
  messengerLinkConfigured: boolean,
  automaticDelivery?: ClientPortalInvite['automaticDelivery'],
) {
  if (channel === 'WEB') {
    return 'Покажите QR-код владельцу или скопируйте ссылку. Она действует 24 часа.';
  }

  if (automaticDelivery === 'sent') {
    return `Приглашение уже отправлено владельцу в ${formatInviteChannel(channel)}. QR-код и ссылка остаются резервным вариантом.`;
  }

  if (automaticDelivery === 'failed') {
    return `Автоматическая отправка в ${formatInviteChannel(channel)} завершилась ошибкой. Покажите QR-код или передайте ссылку вручную.`;
  }

  if (!messengerLinkConfigured) {
    return `Не удалось подготовить переход в ${formatInviteChannel(channel)}. Скопируйте обычную ссылку на кабинет или повторите позже.`;
  }

  if (directDeliveryAvailable) {
    return `${formatInviteChannel(channel)} уже связан с владельцем. При необходимости покажите QR-код или отправьте ссылку вручную.`;
  }

  return `Это первое подключение через ${formatInviteChannel(channel)}. Покажите QR-код или передайте ссылку: она откроет бота и привяжет канал к владельцу.`;
}
