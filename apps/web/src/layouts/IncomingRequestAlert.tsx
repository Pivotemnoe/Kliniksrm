import { App, Button, Space, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentEmployee } from '../auth/useAuth';
import { getErrorMessage } from '../api/errors';
import { claimOnlineRequest, listOnlineRequestAttention, snoozeOnlineRequest } from '../features/onlineRequests/onlineRequests.api';
import { formatDateTime } from '../shared/utils/date';

export function IncomingRequestAlert({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: auth } = useCurrentEmployee();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const attention = useQuery({
    queryKey: ['online-request-attention'], queryFn: listOnlineRequestAttention, enabled,
    refetchInterval: 10_000, refetchIntervalInBackground: true, staleTime: 0,
  });
  const refresh = async () => {
    await Promise.all(['online-request-attention', 'online-requests', 'staff-alerts', 'dashboard'].map(key =>
      queryClient.invalidateQueries({ queryKey: [key] })));
  };
  const claim = useMutation({
    mutationFn: claimOnlineRequest,
    onSuccess: async (request) => {
      await refresh();
      navigate(`/online-requests?request=${encodeURIComponent(request.id)}`);
    },
    onError: async (error) => { message.error(getErrorMessage(error)); await refresh(); },
  });
  const snooze = useMutation({ mutationFn: snoozeOnlineRequest, onSuccess: refresh,
    onError: (error) => message.error(getErrorMessage(error)) });
  if (!enabled) return null;
  const openId = location.pathname === '/online-requests' ? new URLSearchParams(location.search).get('request') : null;
  const item = attention.data?.items.find(row => row.id !== openId);
  if (!item) return attention.isError ? (
    <div className="incoming-request-alert" role="status">
      <Typography.Text strong>Не удалось проверить новые заявки</Typography.Text>
      <Button onClick={() => void attention.refetch()}>Проверить снова</Button>
    </div>
  ) : null;
  const source = item.source === 'OWNER_GATEWAY' ? 'Личный кабинет' : item.source === 'MAX' ? 'MAX' : 'Сайт';
  const overdue = Boolean(item.assignedEmployeeId);
  const canClaim = !item.assignedEmployeeId || item.assignedEmployee?.status === 'BLOCKED' || (item.conversationNeedsAttention && item.assignedEmployeeId === auth?.employee.id);
  return (
    <section className="incoming-request-alert" aria-label="Заявка требует внимания">
      <div aria-live="polite" aria-atomic="true">
        <Typography.Title level={4}>{item.conversationNeedsAttention ? 'Новое обращение в чате' : overdue ? 'Заявка остаётся в работе' : 'Новая заявка на приём'}</Typography.Title>
        <Tag color={overdue ? 'orange' : 'blue'}>{source}</Tag>
        {attention.data!.total > 1 ? <Tag>Ожидают внимания: {attention.data!.total}</Tag> : null}
      </div>
      <Typography.Text strong>{item.ownerName} · {item.animalNickname}</Typography.Text>
      <Typography.Text>{item.phone}</Typography.Text>
      <Typography.Text type="secondary">Получена: {formatDateTime(item.createdAt)}</Typography.Text>
      {item.preferredAt ? <Typography.Text>Желаемое время: {formatDateTime(item.preferredAt)}</Typography.Text> : null}
      {item.comment ? <p className="incoming-request-comment">{item.comment}</p> : null}
      {item.assignedEmployee ? <Typography.Text>В работе: {item.assignedEmployee.fullName}</Typography.Text> : null}
      {attention.isError ? <Typography.Text type="danger">Связь прервана. Показана последняя полученная заявка.</Typography.Text> : null}
      <Space wrap>
        {canClaim ? <Button type="primary" loading={claim.isPending} disabled={snooze.isPending || attention.isError} onClick={() => claim.mutate(item.id)}>Взять в работу</Button> : null}
        <Button onClick={() => navigate(`/online-requests?request=${encodeURIComponent(item.id)}`)}>Открыть заявку</Button>
        <Button loading={snooze.isPending} disabled={claim.isPending || attention.isError} onClick={() => snooze.mutate(item.id)}>Напомнить через 2 минуты</Button>
      </Space>
    </section>
  );
}
