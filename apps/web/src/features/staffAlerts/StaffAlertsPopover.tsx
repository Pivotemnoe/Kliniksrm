import { BellOutlined, CheckOutlined, ExclamationCircleOutlined, InfoCircleOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Badge, Button, Collapse, Drawer, Empty, Input, Segmented, Spin, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { formatDateTime } from '../../shared/utils/date';
import { listStaffAlerts, markAllStaffAlertsRead, markStaffAlertRead } from './staffAlerts.api';
import type { StaffAlertItem } from './types';
import { useCurrentEmployee } from '../../auth/useAuth';
import { alertActionLabel, presentStaffAlerts, type AlertView } from './presentation';

export function StaffAlertsPopover({ unreadMessages = 0, open: controlledOpen, onOpenChange }: {
  unreadMessages?: number; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { data: auth } = useCurrentEmployee();
  const [ownOpen, setOwnOpen] = useState(false);
  const [view, setView] = useState<AlertView>('action');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const open = controlledOpen ?? ownOpen;
  function changeOpen(next: boolean) { setOwnOpen(next); onOpenChange?.(next); }
  const alertsQuery = useQuery({ queryKey: ['staff-alerts'], queryFn: listStaffAlerts, refetchInterval: 30_000 });
  const { refetch } = alertsQuery;
  useEffect(() => { if (open) void refetch(); }, [open, refetch]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff-alerts'] });
  const onError = (error: unknown) => message.error(getErrorMessage(error));
  const markReadMutation = useMutation({ mutationFn: markStaffAlertRead, onSuccess: refresh, onError });
  const markAllMutation = useMutation({ mutationFn: markAllStaffAlertsRead, onSuccess: refresh, onError });
  const items = alertsQuery.data?.items ?? [];
  const unread = alertsQuery.data?.unreadTotal ?? 0;
  const groups = presentStaffAlerts(items, view, search);
  const actionCount = items.filter(item => !['NEWS', 'DIRECTOR_BRIEFING'].includes(item.kind)).length;
  const informationCount = items.length - actionCount;

  async function openAlert(item: StaffAlertItem) {
    try {
      if (item.unread) await markReadMutation.mutateAsync(item.key);
      changeOpen(false);
      navigate(item.href);
    } catch { /* The mutation displays its error; retain the event and drawer. */ }
  }

  return <>
    <Badge count={unread + unreadMessages || undefined} size="small" overflowCount={99}>
      <Button type="text" shape="circle" icon={<BellOutlined />} aria-label="Непросмотренные оповещения" onClick={() => changeOpen(true)} />
    </Badge>
    <Drawer title="Оповещения" open={open} onClose={() => changeOpen(false)} width={520}
      rootClassName="crm-alert-center-root" className="crm-alert-center" styles={{ body: { padding: 0 } }}>
      <div className="alert-center-toolbar">
        <div className="alert-center-summary"><span>Новых событий: <strong>{unread}</strong></span>
          {unread > 0 ? <Button type="text" size="small" icon={<CheckOutlined />} loading={markAllMutation.isPending} onClick={() => markAllMutation.mutate()}>Просмотрено всё</Button> : null}
        </div>
        <Segmented block aria-label="Группы оповещений" value={view} onChange={value => setView(value as AlertView)} options={[
          { value: 'action', label: `К работе · ${actionCount}` },
          { value: 'information', label: `Информация · ${informationCount}` },
          { value: 'all', label: 'Все' },
        ]} />
        <Input allowClear prefix={<SearchOutlined />} aria-label="Поиск в оповещениях" placeholder="Пациент, владелец или событие" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <div className="alert-center-body">
        {auth?.accessType === 'REMOTE' ? <Alert type="info" showIcon className="alert-center-remote"
          message={auth.employee.roles.includes('director') ? 'Удалённая работа директора' : 'Удалённый просмотр'}
          description={auth.employee.roles.includes('director') ? 'Изменения по вашим правам, с аудитом.' : 'Изменение рабочих данных заблокировано.'} /> : null}
        {unreadMessages > 0 ? <Button block className="alert-center-messages" onClick={() => { changeOpen(false); navigate('/staff-messages'); }}>Сообщения сотрудникам: {unreadMessages}</Button> : null}
        {alertsQuery.isLoading ? <div className="staff-alerts-loading"><Spin /></div>
          : alertsQuery.isError && !alertsQuery.data ? <Alert type="error" showIcon message="Не удалось загрузить оповещения" description="Проверьте соединение и повторите запрос." action={<Button onClick={() => void refetch()}>Повторить</Button>} />
          : groups.length ? <Collapse key={`${view}:${search.trim()}`} defaultActiveKey={groups.length === 1 ? [groups[0].id] : []} expandIconPosition="end" className="alert-center-groups" items={groups.map(group => ({
            key: group.id,
            label: <span className="alert-group-heading"><span className={`alert-group-dot${group.urgent ? ' is-urgent' : ''}`} /><strong>{group.title}</strong><span className="alert-group-count" aria-label={`Событий в группе: ${group.items.length}`}>{group.items.length}</span>{group.unread ? <span className="alert-group-new">новых {group.unread}</span> : null}<span className="alert-group-preview">{group.items.length === 1 ? `${group.items[0].title}${group.items[0].count > 1 ? ` · ${group.items[0].count}` : ''}` : group.id === 'visits' ? `Самый давний: ${formatDateTime(group.items[0].occurredAt)}` : `Событий: ${group.items.length}`}</span></span>,
            children: <>
              {group.items.slice(0, expanded.includes(group.id) ? undefined : 3).map(item => <button key={item.key} type="button" className={`staff-alert-item${item.unread ? ' is-unread' : ''}`} onClick={() => void openAlert(item)}>
                <span className={`staff-alert-icon staff-alert-icon-${item.severity}`}>{getAlertIcon(item)}</span>
                <span className="staff-alert-copy">
                  <span className="staff-alert-title-row"><Typography.Text strong>{item.title}</Typography.Text>{item.count > 1 ? <Tag>{item.count}</Tag> : null}</span>
                  <span className="staff-alert-description">{item.description}</span>
                  <span className="staff-alert-time">{formatDateTime(item.occurredAt)}{!item.unread ? ' · Просмотрено' : ''}</span>
                  <span className="staff-alert-action">{alertActionLabel(item)} →</span>
                </span>
              </button>)}
              {group.items.length > 3 ? <Button block type="text" className="alert-show-more" onClick={() => setExpanded(current => current.includes(group.id) ? current.filter(id => id !== group.id) : [...current, group.id])}>{expanded.includes(group.id) ? 'Свернуть список' : `Показать ещё ${group.items.length - 3}`}</Button> : null}
            </>,
          }))} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search ? 'По этому запросу ничего не найдено' : view === 'action' ? 'Рабочих оповещений нет' : 'Оповещений нет'} />}
      </div>
      <div className="alert-center-footer">Отметка «Просмотрено» не завершает приём и не снимает напоминание.</div>
    </Drawer>
  </>;
}

function getAlertIcon(item: StaffAlertItem) {
  if (item.severity === 'error') return <ExclamationCircleOutlined />;
  if (item.severity === 'warning') return <WarningOutlined />;
  return <InfoCircleOutlined />;
}
