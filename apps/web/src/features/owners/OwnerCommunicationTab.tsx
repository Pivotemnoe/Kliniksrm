import { CopyOutlined, LinkOutlined, LockOutlined, MailOutlined, PrinterOutlined, ReloadOutlined, StopOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Checkbox, Descriptions, Drawer, Input, Popconfirm, QRCode, Radio, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { ChangeEvent, RefObject } from 'react';
import { useRef, useState } from 'react';
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
  const webInviteQrRef = useRef<HTMLDivElement | null>(null);
  const telegramInviteQrRef = useRef<HTMLDivElement | null>(null);
  const maxInviteQrRef = useRef<HTMLDivElement | null>(null);
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
  const connectionStatusLoading = portalQuery.isLoading;
  const maxLinked = Boolean(portalAccess?.gatewayStatus?.maxLinked || owner.maxUserId);
  const telegramLinked = Boolean(portalAccess?.gatewayStatus?.telegramLinked || owner.telegramChatId);
  const portalActivatedAt = earliestDateTime(portalAccess?.lastLoginAt, portalAccess?.gatewayStatus?.activatedAt);
  const portalLastSeenAt = latestDateTime(portalAccess?.lastLoginAt, portalAccess?.gatewayStatus?.lastSeenAt);
  const portalActivated = Boolean(portalActivatedAt);
  const portalCanReceive = Boolean(
    portalAccess?.gatewayStatus?.hasSnapshot
      && (portalAccess.status === 'INVITED' || portalAccess.status === 'ENABLED'),
  );
  const additionalDeliveryChannels = [maxLinked ? 'MAX' : null, telegramLinked ? 'Telegram' : null].filter(Boolean).join(', ');
  const inviteToken = lastInvite?.inviteToken ?? portalAccess?.inviteToken ?? null;
  const activeInviteChannel = lastInvite?.inviteChannel ?? inviteChannel;
  const portalInviteLinks = getPortalInviteLinks(lastInvite, inviteToken, portalBaseUrl);
  const inviteLink = portalInviteLinks[activeInviteChannel] ?? lastInvite?.deliveryUrl ?? portalInviteLinks.WEB ?? null;
  const hasCompleteInviteBundle = Boolean(portalInviteLinks.WEB && portalInviteLinks.TELEGRAM && portalInviteLinks.MAX);
  const inviteUsesLoopback = portalInviteLinks.WEB ? isLoopbackUrl(portalInviteLinks.WEB) : false;
  const inviteExpiresAt = lastInvite?.inviteExpiresAt ?? portalAccess?.inviteExpiresAt ?? null;

  function handlePortalBaseUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setPortalBaseUrl(nextValue);
    savePortalBaseUrl(nextValue);
  }

  function handlePrintInvite() {
    if (!hasCompleteInviteBundle || !portalInviteLinks.WEB || !portalInviteLinks.TELEGRAM || !portalInviteLinks.MAX) {
      message.warning('Сначала создайте приглашение');
      return;
    }

    const webQrSvg = webInviteQrRef.current?.querySelector('svg')?.outerHTML;
    const telegramQrSvg = telegramInviteQrRef.current?.querySelector('svg')?.outerHTML;
    const maxQrSvg = maxInviteQrRef.current?.querySelector('svg')?.outerHTML;
    if (!webQrSvg || !telegramQrSvg || !maxQrSvg) {
      message.error('QR-код ещё формируется. Повторите печать через несколько секунд.');
      return;
    }

    const printed = printPortalInvite({
      ownerName: owner.fullName,
      inviteExpiresAt,
      webLink: portalInviteLinks.WEB,
      telegramLink: portalInviteLinks.TELEGRAM,
      maxLink: portalInviteLinks.MAX,
      webQrSvg,
      telegramQrSvg,
      maxQrSvg,
    });
    if (!printed) {
      message.warning('Браузер заблокировал окно печати. Разрешите всплывающие окна и повторите.');
    }
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
            <Tag color={maxLinked ? 'green' : 'default'}>
              MAX: {connectionStatusLoading ? 'проверяем' : maxLinked ? 'подключён' : 'не подключён'}
            </Tag>
            <Tag color={telegramLinked ? 'green' : 'default'}>
              Telegram: {connectionStatusLoading ? 'проверяем' : telegramLinked ? 'подключён' : 'не подключён'}
            </Tag>
            <Typography.Text strong>
              {connectionStatusLoading
                ? 'Проверяем доступ к личному кабинету…'
                : portalCanReceive
                ? portalActivated
                  ? `Владелец вошёл в личный кабинет${additionalDeliveryChannels ? `. Дополнительно подключены: ${additionalDeliveryChannels}` : ''}`
                  : `Приглашение создано, владелец ещё не вошёл${additionalDeliveryChannels ? `. Уже подключены: ${additionalDeliveryChannels}` : ''}`
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
            <Typography.Text strong>Куда дополнительно отправить приглашение, если канал уже подключён?</Typography.Text>
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
                {portalAccess?.status === 'INVITED' ? 'Создать новый комплект QR' : 'Создать комплект приглашения'}
              </Button>
            </div>
          </Space>
          {lastInvite && lastInvite.gatewaySync !== 'synced' ? (
            <Alert
              type="error"
              showIcon
              className="form-alert"
              message="Не удалось подготовить все три QR-кода"
              description="Публичный шлюз личного кабинета недоступен. Проверьте подключение к интернету и создайте комплект ещё раз."
            />
          ) : null}
          {portalAccess?.status === 'INVITED' && !inviteLink && !inviteMutation.isPending ? (
            <Alert
              type="info"
              showIcon
              className="form-alert"
              message="Приглашение уже создано"
              description="Одноразовые ссылки не показываются повторно после обновления страницы. Чтобы снова распечатать три QR-кода, создайте новый комплект — прежний перестанет работать."
            />
          ) : null}
          {inviteLink ? (
            <Alert
              type="success"
              showIcon
              className="form-alert"
              message={hasCompleteInviteBundle ? 'Комплект приглашения: браузер, Telegram и MAX' : `Приглашение: ${formatInviteChannel(activeInviteChannel)}`}
              description={
                <div>
                  <Space direction="vertical" size={8} className="full-width">
                    {inviteUsesLoopback ? (
                      <Typography.Text type="warning">
                        Эта ссылка работает только на серверном компьютере. Для телефона укажите сетевой адрес, например{' '}
                        http://192.168.0.80:3000.
                      </Typography.Text>
                    ) : null}
                    <Input
                      addonBefore="Резервный адрес кабинета"
                      value={portalBaseUrl}
                      placeholder="http://192.168.0.80:3000"
                      onChange={handlePortalBaseUrlChange}
                    />
                    {hasCompleteInviteBundle ? (
                      <div className="portal-invite-qr-grid">
                        <PortalInviteQrCard label="Открыть в браузере" link={portalInviteLinks.WEB!} qrRef={webInviteQrRef} />
                        <PortalInviteQrCard label="Подключить Telegram" link={portalInviteLinks.TELEGRAM!} qrRef={telegramInviteQrRef} />
                        <PortalInviteQrCard label="Подключить MAX" link={portalInviteLinks.MAX!} qrRef={maxInviteQrRef} />
                      </div>
                    ) : (
                      <div className="portal-qr-card" ref={webInviteQrRef}>
                        <QRCode value={inviteLink} size={132} type="svg" />
                      </div>
                    )}
                    <Typography.Text type="secondary">
                      Все три QR-кода используют одно одноразовое приглашение и действуют 24 часа. После регистрации остальные варианты перестанут работать.
                    </Typography.Text>
                    <Space wrap>
                      <Button size="small" icon={<CopyOutlined />} onClick={() => copyInviteLink(inviteLink, message)}>
                        Скопировать выбранную ссылку
                      </Button>
                      <Button size="small" icon={<LinkOutlined />} onClick={() => window.open(inviteLink, '_blank', 'noopener,noreferrer')}>
                        Открыть
                      </Button>
                      <Button size="small" type="primary" icon={<PrinterOutlined />} disabled={!hasCompleteInviteBundle} onClick={handlePrintInvite}>
                        Распечатать А5 — 3 QR-кода
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
              <Descriptions.Item label="Первый вход">{formatDateTime(portalActivatedAt)}</Descriptions.Item>
              <Descriptions.Item label="Последняя активность">{formatDateTime(portalLastSeenAt)}</Descriptions.Item>
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
            <Popconfirm
              title="Приостановить личный кабинет?"
              description="Владелец временно потеряет доступ. Данные владельца и пациентов сохранятся."
              okText="Приостановить"
              cancelText="Отмена"
              onConfirm={() => portalMutation.mutate({ status: 'DISABLED' })}
            >
              <Button icon={<StopOutlined />} loading={portalMutation.isPending}>
                Приостановить кабинет
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Заблокировать личный кабинет?"
              description="Все активные входы владельца будут запрещены до решения клиники. Данные не удаляются."
              okText="Заблокировать"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={() => portalMutation.mutate({ status: 'BLOCKED', blockedReason: 'Заблокировано сотрудником клиники' })}
            >
              <Button danger icon={<LockOutlined />} loading={portalMutation.isPending}>
                Заблокировать
              </Button>
            </Popconfirm>
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

function PortalInviteQrCard({ label, link, qrRef }: { label: string; link: string; qrRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="portal-invite-qr-option">
      <Typography.Text strong>{label}</Typography.Text>
      <div className="portal-qr-card" ref={qrRef}>
        <QRCode value={link} size={132} type="svg" />
      </div>
    </div>
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
  const delivery = metadataDelivery && typeof metadataDelivery === 'object' && !Array.isArray(metadataDelivery)
    ? metadataDelivery as { messengerChannels?: unknown; deliveredMessengerChannels?: unknown }
    : null;
  const labels = Array.from(new Set([
    ...readMessengerChannels(delivery?.messengerChannels),
    ...readMessengerChannels(delivery?.deliveredMessengerChannels),
  ]));

  return labels.length ? `Личный кабинет + ${labels.map((value) => notificationChannelLabels[value]).join(' + ')}` : 'Личный кабинет';
}

function readMessengerChannels(value: unknown): Array<'MAX' | 'TELEGRAM'> {
  return Array.isArray(value)
    ? value.filter((channel): channel is 'MAX' | 'TELEGRAM' => channel === 'MAX' || channel === 'TELEGRAM')
    : [];
}

const portalBaseUrlStorageKey = 'temichevvet.portalBaseUrl';

function buildPortalInviteLink(token: string, baseUrl: string, channel: PortalInviteChannel) {
  return `${normalizePortalBaseUrl(baseUrl)}/portal/${encodeURIComponent(token)}?via=${channel.toLowerCase()}`;
}

function getPortalInviteLinks(
  invite: ClientPortalInvite | null,
  inviteToken: string | null,
  portalBaseUrl: string,
): Partial<Record<PortalInviteChannel, string>> {
  const links = { ...(invite?.deliveryUrls ?? {}) };
  if (invite?.deliveryUrl && invite.inviteChannel) {
    links[invite.inviteChannel] ??= invite.deliveryUrl;
  }
  if (inviteToken) {
    links.WEB ??= buildPortalInviteLink(inviteToken, portalBaseUrl, 'WEB');
  }
  return links;
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

function earliestDateTime(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

function latestDateTime(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
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

const ownerServiceUrl = 'https://temichevvet.ru';

type PortalInvitePrintInput = {
  ownerName: string;
  inviteExpiresAt: string | null;
  webLink: string;
  telegramLink: string;
  maxLink: string;
  webQrSvg: string;
  telegramQrSvg: string;
  maxQrSvg: string;
};

function printPortalInvite(input: PortalInvitePrintInput) {
  const printWindow = window.open('', '_blank', 'width=880,height=760');
  if (!printWindow) {
    return false;
  }

  printWindow.opener = null;
  const expiresAt = input.inviteExpiresAt ? formatDateTime(input.inviteExpiresAt) : 'в течение 24 часов после создания';

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Приглашение в личный кабинет</title>
  <style>
    @page { size: A5 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #182433; font-family: Arial, sans-serif; font-size: 10.5px; line-height: 1.32; }
    h1 { margin: 0 0 4px; color: #17324d; font-size: 19px; }
    h2 { margin: 0 0 3px; color: #17324d; font-size: 12px; }
    p { margin: 3px 0; }
    ul { columns: 2; column-gap: 20px; margin: 5px 0 0; padding-left: 17px; }
    li { margin: 2px 0; break-inside: avoid; }
    .brand { margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #246a73; color: #246a73; font-size: 13px; font-weight: 800; }
    .intro { font-size: 12px; }
    .cta { margin: 7px 0 4px; text-align: center; font-size: 13px; font-weight: 800; }
    .qr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
    .qr-option { min-width: 0; padding: 7px 5px; border: 1px solid #b9ccd4; border-radius: 8px; text-align: center; }
    .qr-option strong { display: block; min-height: 27px; color: #17324d; font-size: 10.5px; }
    .qr-option svg { display: block; width: 104px; height: 104px; max-width: 100%; margin: 3px auto; }
    .qr-option span { display: block; color: #60717d; font-size: 8.5px; }
    .expires { margin-top: 6px; padding: 5px 7px; border-radius: 6px; color: #8a3412; background: #fff7ed; text-align: center; font-weight: 700; }
    .service { margin-top: 7px; padding: 7px 9px; border: 1px solid #cbd8df; border-radius: 8px; background: #f4f8fa; }
    .service a { color: #176b73; font-weight: 700; }
    .footer { margin-top: 6px; color: #60717d; font-size: 8.5px; }
  </style>
</head>
<body>
  <div class="brand">Личный кабинет владельца животного</div>
  <h1>Приглашение в личный кабинет</h1>
  <p class="intro">Уважаемый(ая) <strong>${escapePrintHtml(input.ownerName)}</strong>!</p>
  <p>Зарегистрируйтесь в личном кабинете клиники. После регистрации вы сможете:</p>
  <ul>
    <li>видеть своих питомцев и записи на приём;</li>
    <li>просматривать историю приёмов, рекомендации и документы;</li>
    <li>получать сообщения клиники и информацию по счетам;</li>
    <li>отправлять заявку на новый приём.</li>
  </ul>
  <p class="cta">Выберите удобный способ и отсканируйте один QR-код</p>
  <section class="qr-grid">
    <div class="qr-option"><strong>Открыть в браузере</strong>${input.webQrSvg}<span>Обычная защищённая ссылка</span></div>
    <div class="qr-option"><strong>Подключить Telegram</strong>${input.telegramQrSvg}<span>Откройте бота и нажмите Start</span></div>
    <div class="qr-option"><strong>Подключить MAX</strong>${input.maxQrSvg}<span>Откройте и запустите бота</span></div>
  </section>
  <p class="expires">Приглашение действует до: ${escapePrintHtml(expiresAt)}. Использовать можно только один вариант.</p>
  <section class="service">
    <h2>TemichevVet — сервис для владельцев животных</h2>
    <p>Полезный онлайн-сервис для владельцев собак и кошек: <a href="${ownerServiceUrl}">${ownerServiceUrl}</a></p>
  </section>
  <p class="footer">Если интернет временно недоступен, сохраните приглашение и отсканируйте любой регистрационный QR-код позже, но до окончания указанного срока.</p>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
  return true;
}

function escapePrintHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
