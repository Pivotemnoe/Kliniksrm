import { hasPermission } from '../auth/permissions';
import { useCurrentEmployee } from '../auth/useAuth';
import { dismissVaccinationReminders } from '../features/animals/animals.api';
import { ExclamationCircleOutlined, EyeOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Input, List, Modal, Space, Tag, Typography } from 'antd';
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
  clinicalOnly = false,
  onOpenAlerts,
}: {
  internalMessages?: InternalMessageConversationsResponse;
  remoteAccessMode?: 'read-only' | 'director' | null;
  clinicalOnly?: boolean;
  onOpenAlerts?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const canDismiss = remoteAccessMode !== 'read-only' && (hasPermission(auth?.employee, 'animals.manage') || hasPermission(auth?.employee, 'visits.manage'));
  const [dismissing, setDismissing] = useState<StaffAlertItem | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const dismissMutation = useMutation({
    mutationFn: () => dismissVaccinationReminders(dismissing!.vaccination!.animalId, dismissing!.vaccination!.vaccines.map(v => v.id), dismissReason.trim()),
    onSuccess: async () => {
      setDismissing(null); setDismissReason('');
      await Promise.all(['staff-alerts', 'tasks', 'animals'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      message.success('Напоминание убрано');
    },
    onError: error => message.error(getErrorMessage(error)),
  });
  const onDismiss = canDismiss ? (item: StaffAlertItem) => { setDismissReason(''); setDismissing(item); } : undefined;
  const [vaccinationsOpen, setVaccinationsOpen] = useState(false);
  const [alertsErrorDismissed, setAlertsErrorDismissed] = useState(() => {
    try { return sessionStorage.getItem('crm-staff-alert-error-dismissed') === '1'; } catch { return false; }
  });
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
  const otherUnreadAlerts = activeAlerts.filter((item) => !clinicalOnly && item.unread && ![
    'UNFINISHED_VISIT',
    'TODAY_VACCINATION',
    'OVERDUE_VACCINATION',
  ].includes(item.kind));
  const unreadConversations = (internalMessages?.items ?? [])
    .filter((conversation) => conversation.unreadCount > 0)
    .sort((left, right) => new Date(right.lastMessage.createdAt).getTime() - new Date(left.lastMessage.createdAt).getTime());
  const latestUnreadConversation = clinicalOnly ? undefined : unreadConversations[0];

  async function openAlert(item: StaffAlertItem) {
    if (item.unread) await markReadMutation.mutateAsync(item.key);
    setVaccinationsOpen(false);
    navigate(item.href);
  }

  const alertsUnavailable = alertsQuery.isError && !alertsQuery.data && !alertsErrorDismissed;
  if (!alertsUnavailable && !remoteAccessMode && !latestUnreadConversation && !overdueVisits.length && !vaccinationAlerts.length && !otherUnreadAlerts.length) return null;

  return (
    <div className="global-operational-alerts compact-operational-alerts operational-focus-bar" aria-label="Рабочие предупреждения клиники">
      {alertsUnavailable ? (
        <div className="operational-connection-error" role="alert">
          <ExclamationCircleOutlined />
          <span>Не удалось проверить незавершённые приёмы и вакцинации</span>
          <Button size="small" onClick={() => void alertsQuery.refetch()}>Проверить снова</Button>
          <Button size="small" type="text" onClick={() => {
            setAlertsErrorDismissed(true);
            try { sessionStorage.setItem('crm-staff-alert-error-dismissed', '1'); } catch {}
          }}>Скрыть</Button>
        </div>
      ) : null}
      <div className="operational-focus-content">
        {remoteAccessMode && !clinicalOnly ? <Tag icon={<EyeOutlined />} className="operational-remote-mode" title={remoteAccessMode === 'director' ? 'Изменения разрешены по вашим правам и сохраняются в аудите' : 'Удалённый просмотр: изменение рабочих данных заблокировано'}>{remoteAccessMode === 'director' ? 'Удалённая работа директора' : 'Удалённый просмотр'}</Tag> : null}
        <span className="operational-focus-label">{overdueVisits.length || vaccinationAlerts.length ? 'Требуют внимания' : 'Оповещения'}</span>
        <div className="operational-focus-actions">
          {overdueVisits.length ? <button type="button" className="operational-focus-pill is-urgent" onClick={() => void openAlert(overdueVisits[0])}
            aria-label={`Незавершённые приёмы более часа: ${overdueVisits.length}. Открыть самый давний приём.`}>
            <ExclamationCircleOutlined /><span>Приёмы</span><strong>{overdueVisits.length}</strong>
          </button> : null}
          {vaccinationAlerts.length ? <button type="button" className={`operational-focus-pill${overdueVaccinations.length ? ' is-urgent' : ''}`} onClick={() => setVaccinationsOpen(true)} aria-label={`Вакцинации: ${vaccinationAlerts.length}. Показать полный список.`}>
            <MedicineBoxOutlined /><span>Вакцинации</span><strong>{vaccinationAlerts.length}</strong>
          </button> : null}
          {onOpenAlerts ? <Button type="text" size="small" className="operational-open-center" onClick={onOpenAlerts}>Все оповещения{otherUnreadAlerts.length + Number(Boolean(latestUnreadConversation)) > 0 ? <span className="operational-new-count">+{otherUnreadAlerts.length + Number(Boolean(latestUnreadConversation))}</span> : null} →</Button> : null}
        </div>
      </div>
      <Drawer
        title="Вакцинации, требующие внимания"
        open={vaccinationsOpen}
        onClose={() => setVaccinationsOpen(false)}
        width={620}
        destroyOnHidden
      >
        <VaccinationAlertsList title="Сегодня" items={todayVaccinations} onOpen={openAlert} onDismiss={onDismiss} />
        <VaccinationAlertsList title="Просроченные" items={overdueVaccinations} onOpen={openAlert} onDismiss={onDismiss} danger />
      </Drawer>
      <Modal title="Убрать напоминание" open={Boolean(dismissing)} okText="Убрать напоминание" cancelText="Отмена"
        confirmLoading={dismissMutation.isPending} okButtonProps={{ disabled: dismissReason.trim().length < 2 }}
        onCancel={() => { if (!dismissMutation.isPending) setDismissing(null); }} onOk={() => dismissMutation.mutate()}>
        <Typography.Paragraph>{dismissing?.vaccination?.animalName}: {dismissing?.vaccination?.vaccines.map(v => v.title).join(', ')}</Typography.Paragraph>
        <Typography.Paragraph>Напоминание и задача ревакцинации будут закрыты. Запланированные сообщения владельцу по этим напоминаниям отменятся. Сделанные прививки останутся в истории, начисления не изменятся.</Typography.Paragraph>
        <Space wrap style={{ marginBottom: 12 }}><Button onClick={() => setDismissReason('Отказались')}>Отказались</Button><Button onClick={() => setDismissReason('Не придут')}>Не придут</Button></Space>
        <Input.TextArea aria-label="Причина снятия напоминания" placeholder="Причина" value={dismissReason} onChange={event => setDismissReason(event.target.value)} maxLength={500} rows={3} />
      </Modal>
    </div>
  );
}

function VaccinationAlertsList({
  title,
  items,
  danger = false,
  onOpen,
  onDismiss,
}: {
  title: string;
  items: StaffAlertItem[];
  danger?: boolean;
  onOpen: (item: StaffAlertItem) => Promise<void>;
  onDismiss?: (item: StaffAlertItem) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="global-vaccination-list">
      <Space>
        <Typography.Title level={5}>{title}</Typography.Title>
        <Tag color={danger ? 'red' : 'gold'}>{items.length}</Tag>
      </Space>
      {Array.from(new Set(items.map(item => item.vaccination?.ownerId ?? item.key))).map(ownerKey => {
        const ownerItems = items.filter(item => (item.vaccination?.ownerId ?? item.key) === ownerKey);
        return <section className="vaccination-owner-group" key={ownerKey}>
          {ownerItems[0].vaccination ? <Typography.Text strong>{ownerItems[0].vaccination.ownerName}</Typography.Text> : null}
          <List dataSource={ownerItems} renderItem={item => (
            <List.Item actions={item.vaccination && onDismiss ? [<Button key="dismiss" onClick={() => onDismiss(item)}>Убрать напоминание</Button>] : undefined}>
              <List.Item.Meta
                title={<Button type="link" onClick={() => void onOpen(item)}>{item.vaccination?.animalName ?? item.title}</Button>}
                description={item.vaccination
                  ? <ul>{item.vaccination.vaccines.map(vaccine => <li key={vaccine.id}>{vaccine.title} · {formatDate(vaccine.dueAt)}</li>)}</ul>
                  : `${item.description} · ${formatDate(item.occurredAt)}`}
              />
            </List.Item>
          )} />
        </section>;
      })}
    </section>
  );
}
