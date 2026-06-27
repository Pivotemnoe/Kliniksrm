import { CheckCircleOutlined, CopyOutlined, LinkOutlined, LockOutlined, MailOutlined, StopOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Alert, Button, Descriptions, Input, QRCode, Space, Table, Tag, Typography } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import {
  getPortalAccess,
  listNotificationOutbox,
  updatePortalAccess,
} from '../notifications/notifications.api';
import {
  ClientPortalAccess,
  notificationChannelLabels,
  NotificationOutboxItem,
  NotificationChannel,
  notificationStatusColors,
  notificationStatusLabels,
  NotificationStatus,
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
  const [lastInviteToken, setLastInviteToken] = useState<string | null>(null);
  const [portalBaseUrl, setPortalBaseUrl] = useState(() => getInitialPortalBaseUrl());
  const portalQuery = useQuery({
    queryKey: ['owners', owner.id, 'portal-access'],
    queryFn: () => getPortalAccess(owner.id),
  });
  const outboxQuery = useQuery({
    queryKey: ['notifications', 'outbox', { ownerId: owner.id, limit: 20, offset: 0 }],
    queryFn: () => listNotificationOutbox({ ownerId: owner.id, limit: 20, offset: 0 }),
  });
  const portalMutation = useMutation({
    mutationFn: (values: { status: ClientPortalAccess['status']; blockedReason?: string | null }) => updatePortalAccess(owner.id, values),
    onSuccess: async (access) => {
      await queryClient.invalidateQueries({ queryKey: ['owners', owner.id, 'portal-access'] });
      setLastInviteToken(access.inviteToken ?? null);
      message.success(access.inviteToken ? 'Приглашение создано' : 'Доступ обновлён');
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
      render: (value: NotificationChannel) => notificationChannelLabels[value] ?? value,
    },
    { title: 'Получатель', dataIndex: 'recipient', key: 'recipient', width: 180 },
    { title: 'Текст', dataIndex: 'body', key: 'body', ellipsis: true },
    { title: 'Дата', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: formatDateTime },
  ];

  const portalAccess = portalQuery.data;
  const inviteToken = lastInviteToken ?? portalAccess?.inviteToken ?? null;
  const inviteLink = inviteToken ? buildPortalInviteLink(inviteToken, portalBaseUrl) : null;
  const inviteUsesLoopback = inviteLink ? isLoopbackUrl(inviteLink) : false;

  function handlePortalBaseUrlChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setPortalBaseUrl(nextValue);
    savePortalBaseUrl(nextValue);
  }

  return (
    <Space direction="vertical" size={16} className="full-width">
      <Descriptions bordered column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="Предпочтительный канал">
          {owner.preferredNotificationChannel ? notificationChannelLabels[owner.preferredNotificationChannel] : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Разрешённые каналы">{getAllowedChannels(owner).join(', ') || '—'}</Descriptions.Item>
        <Descriptions.Item label="Telegram chat id">{owner.telegramChatId || '—'}</Descriptions.Item>
        <Descriptions.Item label="MAX user id">{owner.maxUserId || '—'}</Descriptions.Item>
      </Descriptions>

      <div className="list-panel">
        <div className="list-panel-header">
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} className="compact-title">
              Личный кабинет
            </Typography.Title>
            <Typography.Text type="secondary">Доступ клиента к будущему кабинету владельца.</Typography.Text>
          </Space>
          {portalAccess ? (
            <Tag color={portalStatusColors[portalAccess.status]}>{portalStatusLabels[portalAccess.status]}</Tag>
          ) : null}
        </div>
        <div className="list-panel-body">
          {portalQuery.isError ? <Alert type="error" showIcon message={getErrorMessage(portalQuery.error)} className="form-alert" /> : null}
          {portalMutation.error ? <Alert type="error" showIcon message={getErrorMessage(portalMutation.error)} className="form-alert" /> : null}
          {inviteLink ? (
            <Alert
              type="success"
              showIcon
              className="form-alert"
              message="Ссылка приглашения создана"
              description={
                <div className="portal-invite-layout">
                  <div className="portal-qr-card">
                    <QRCode value={inviteLink} size={132} />
                  </div>
                  <Space direction="vertical" size={8} className="full-width">
                    {inviteUsesLoopback ? (
                      <Typography.Text type="warning">
                        С телефона 127.0.0.1 не откроется. Укажите адрес серверного компьютера в сети, например{' '}
                        http://192.168.0.80:3000.
                      </Typography.Text>
                    ) : null}
                    <Input
                      addonBefore="Адрес сервера"
                      value={portalBaseUrl}
                      placeholder="http://192.168.0.80:3000"
                      onChange={handlePortalBaseUrlChange}
                    />
                    <Typography.Text className="portal-invite-link">{inviteLink}</Typography.Text>
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
              icon={<UserAddOutlined />}
              loading={portalMutation.isPending}
              onClick={() => portalMutation.mutate({ status: 'INVITED' })}
            >
              Создать приглашение
            </Button>
            {inviteLink ? (
              <Button icon={<LinkOutlined />} onClick={() => window.open(inviteLink ?? '', '_blank', 'noopener,noreferrer')}>
                Открыть кабинет
              </Button>
            ) : null}
            <Button
              icon={<CheckCircleOutlined />}
              loading={portalMutation.isPending}
              onClick={() => portalMutation.mutate({ status: 'ENABLED' })}
            >
              Включить
            </Button>
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
          </Space>
        </div>
      </div>

      <div className="list-panel">
        <div className="list-panel-header">
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} className="compact-title">
              История уведомлений
            </Typography.Title>
            <Typography.Text type="secondary">Последние сообщения, поставленные в локальную очередь.</Typography.Text>
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
    </Space>
  );
}

const portalBaseUrlStorageKey = 'temichevvet.portalBaseUrl';

function buildPortalInviteLink(token: string, baseUrl: string) {
  return `${normalizePortalBaseUrl(baseUrl)}/portal/${token}`;
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

function getAllowedChannels(owner: Owner) {
  return [
    owner.allowTelegram ? 'Telegram' : null,
    owner.allowMax ? 'MAX' : null,
    owner.allowSms ? 'SMS' : null,
    owner.allowEmail ? 'Email' : null,
  ].filter(Boolean) as string[];
}
