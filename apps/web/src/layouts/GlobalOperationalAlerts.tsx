import { ExclamationCircleOutlined, EyeOutlined, MedicineBoxOutlined, MessageOutlined, NotificationOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Drawer, List, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/errors';
import { formatDate } from '../shared/utils/date';
import { listStaffAlerts, markStaffAlertRead } from '../features/staffAlerts/staffAlerts.api';
import type { StaffAlertItem } from '../features/staffAlerts/types';
import type { InternalMessageConversationsResponse } from '../features/internalMessages/types';

export function GlobalOperationalAlerts({
  internalMessages,
  remoteAccessMode = null,
}: {
  internalMessages?: InternalMessageConversationsResponse;
  remoteAccessMode?: 'read-only' | 'director' | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [vaccinationsOpen, setVaccinationsOpen] = useState(false);
  const alertsQuery = useQuery({
    queryKey: ['staff-alerts'],
    queryFn: listStaffAlerts,
    refetchInterval: 30_000,
  });
  const markReadMutation = useMutation({
    mutationFn: markStaffAlertRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-alerts'] }),
    onError: (error) => message.error(getErrorMessage(error)),
  });
  const activeAlerts = alertsQuery.data?.items ?? [];
  const overdueVisits = activeAlerts
    .filter((item) => item.kind === 'UNFINISHED_VISIT')
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
  const todayVaccinations = activeAlerts.filter((item) => item.kind === 'TODAY_VACCINATION');
  const overdueVaccinations = activeAlerts.filter((item) => item.kind === 'OVERDUE_VACCINATION');
  const vaccinationAlerts = [...todayVaccinations, ...overdueVaccinations];
  const otherUnreadAlerts = activeAlerts.filter((item) => item.unread && ![
    'UNFINISHED_VISIT',
    'TODAY_VACCINATION',
    'OVERDUE_VACCINATION',
  ].includes(item.kind));
  const unreadConversations = (internalMessages?.items ?? [])
    .filter((conversation) => conversation.unreadCount > 0)
    .sort((left, right) => new Date(right.lastMessage.createdAt).getTime() - new Date(left.lastMessage.createdAt).getTime());
  const latestUnreadConversation = unreadConversations[0];

  async function openAlert(item: StaffAlertItem) {
    if (item.unread) await markReadMutation.mutateAsync(item.key);
    setVaccinationsOpen(false);
    navigate(item.href);
  }

  const alertsUnavailable = alertsQuery.isError && !alertsQuery.data;

  if (!alertsUnavailable && !remoteAccessMode && !latestUnreadConversation && !overdueVisits.length && !vaccinationAlerts.length && !otherUnreadAlerts.length) return null;

  return (
    <div className="global-operational-alerts" aria-label="Рабочие предупреждения клиники">
      {alertsUnavailable ? (
        <div className="dashboard-overdue-banner dashboard-vaccination-banner-danger" role="alert">
          <span className="dashboard-overdue-banner-copy">
            <ExclamationCircleOutlined />
            <strong>Не удалось проверить незавершённые приёмы и вакцинации</strong>
            <span>Связь с сервером оповещений прервана</span>
          </span>
          <button
            type="button"
            className="dashboard-overdue-banner-action"
            onClick={() => void alertsQuery.refetch()}
          >
            Проверить снова
          </button>
        </div>
      ) : null}
      {remoteAccessMode ? (
        <div className="dashboard-overdue-banner remote-read-only-banner" role="status">
          <span className="dashboard-overdue-banner-copy">
            <EyeOutlined />
            <strong>{remoteAccessMode === 'director' ? 'Удалённая работа директора' : 'Удалённый просмотр'}</strong>
            <span>{remoteAccessMode === 'director'
              ? 'Изменения разрешены по вашим правам и сохраняются в аудите'
              : 'Разделы доступны по вашей роли; изменение рабочих данных заблокировано'}</span>
          </span>
        </div>
      ) : null}
      {latestUnreadConversation ? (
        <button
          type="button"
          className="dashboard-overdue-banner staff-message-banner"
          onClick={() => navigate(`/staff-messages?with=${encodeURIComponent(latestUnreadConversation.employee.id)}`)}
        >
          <span className="dashboard-overdue-banner-copy">
            <MessageOutlined />
            <strong>Новое сообщение от {latestUnreadConversation.employee.fullName}</strong>
            <span>Непрочитанных сообщений: {internalMessages?.totalUnread ?? latestUnreadConversation.unreadCount}</span>
          </span>
          <span className="dashboard-overdue-banner-action">Открыть переписку</span>
        </button>
      ) : null}
      {otherUnreadAlerts.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`dashboard-overdue-banner staff-notice-banner${item.severity === 'error' ? ' dashboard-vaccination-banner-danger' : item.severity === 'warning' ? ' dashboard-vaccination-banner' : ''}`}
          onClick={() => void openAlert(item)}
        >
          <span className="dashboard-overdue-banner-copy">
            <NotificationOutlined />
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </span>
          <span className="dashboard-overdue-banner-action">Открыть</span>
        </button>
      ))}
      {overdueVisits.length ? (
        <button
          type="button"
          className="dashboard-overdue-banner"
          onClick={() => void openAlert(overdueVisits[0])}
          aria-label={`Незавершённые приёмы более часа: ${overdueVisits.length}. Открыть самый давний приём.`}
        >
          <span className="dashboard-overdue-banner-copy">
            <ExclamationCircleOutlined />
            <strong>Незавершённые приёмы</strong>
            <span>Более часа: {overdueVisits.length}</span>
          </span>
          <span className="dashboard-overdue-banner-action">Открыть самый давний</span>
        </button>
      ) : null}
      {vaccinationAlerts.length ? (
        <button
          type="button"
          className={`dashboard-overdue-banner dashboard-vaccination-banner${overdueVaccinations.length ? ' dashboard-vaccination-banner-danger' : ''}`}
          onClick={() => setVaccinationsOpen(true)}
        >
          <span className="dashboard-overdue-banner-copy">
            <MedicineBoxOutlined />
            <strong>{overdueVaccinations.length ? 'Вакцинации требуют внимания' : 'Внимание: сегодня назначена вакцинация'}</strong>
            {todayVaccinations.length ? <span>Сегодня: {todayVaccinations.length}</span> : null}
            {overdueVaccinations.length ? <span>Просрочено: {overdueVaccinations.length}</span> : null}
          </span>
          <span className="dashboard-overdue-banner-action">Показать полный список</span>
        </button>
      ) : null}
      <Drawer
        title="Вакцинации, требующие внимания"
        open={vaccinationsOpen}
        onClose={() => setVaccinationsOpen(false)}
        width={620}
        destroyOnHidden
      >
        <VaccinationAlertsList title="Сегодня" items={todayVaccinations} onOpen={openAlert} />
        <VaccinationAlertsList title="Просроченные" items={overdueVaccinations} onOpen={openAlert} danger />
      </Drawer>
    </div>
  );
}

function VaccinationAlertsList({
  title,
  items,
  danger = false,
  onOpen,
}: {
  title: string;
  items: StaffAlertItem[];
  danger?: boolean;
  onOpen: (item: StaffAlertItem) => Promise<void>;
}) {
  if (!items.length) return null;
  return (
    <section className="global-vaccination-list">
      <Space>
        <Typography.Title level={5}>{title}</Typography.Title>
        <Tag color={danger ? 'red' : 'gold'}>{items.length}</Tag>
      </Space>
      <List
        bordered
        dataSource={items}
        renderItem={(item) => (
          <List.Item className="global-vaccination-item" onClick={() => void onOpen(item)}>
            <List.Item.Meta
              title={item.title}
              description={`${item.description} · ${formatDate(item.occurredAt)}`}
            />
          </List.Item>
        )}
      />
    </section>
  );
}
