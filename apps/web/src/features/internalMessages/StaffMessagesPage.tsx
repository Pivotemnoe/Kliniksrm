import { NotificationOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Avatar, Badge, Button, Empty, Input, Select, Spin, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { useCurrentEmployee } from '../../auth/useAuth';
import { hasPermission } from '../../auth/permissions';
import { PageHeader } from '../../shared/ui/PageHeader';
import { formatDateTime } from '../../shared/utils/date';
import {
  listInternalMessageConversations,
  listInternalMessageRecipients,
  listInternalMessageThread,
  markInternalMessageConversationRead,
  sendInternalMessage,
} from './internalMessages.api';
import { InternalMessageEmployee } from './types';

const { TextArea } = Input;

export function StaffMessagesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(searchParams.get('with') ?? '');
  const [body, setBody] = useState('');
  const recipientsQuery = useQuery({
    queryKey: ['internal-messages', 'recipients'],
    queryFn: listInternalMessageRecipients,
    refetchInterval: 60_000,
  });
  const conversationsQuery = useQuery({
    queryKey: ['internal-messages', 'conversations'],
    queryFn: listInternalMessageConversations,
    refetchInterval: 10_000,
  });
  const threadQuery = useQuery({
    queryKey: ['internal-messages', 'thread', selectedEmployeeId],
    queryFn: () => listInternalMessageThread(selectedEmployeeId),
    enabled: Boolean(selectedEmployeeId),
    refetchInterval: 10_000,
  });
  const employees = useMemo(() => mergeEmployees(
    recipientsQuery.data ?? [],
    (conversationsQuery.data?.items ?? []).map((item) => item.employee),
  ), [recipientsQuery.data, conversationsQuery.data]);
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const latestUnreadIncomingId = [...(threadQuery.data?.items ?? [])]
    .reverse()
    .find((item) => item.recipient.id === auth?.employee.id && !item.readAt)?.id ?? '';

  const sendMutation = useMutation({
    mutationFn: sendInternalMessage,
    onSuccess: async () => {
      setBody('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['internal-messages', 'thread', selectedEmployeeId] }),
        queryClient.invalidateQueries({ queryKey: ['internal-messages', 'conversations'] }),
      ]);
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });

  useEffect(() => {
    if (selectedEmployeeId || !conversationsQuery.data?.items.length) return;
    const firstEmployeeId = conversationsQuery.data.items[0].employee.id;
    setSelectedEmployeeId(firstEmployeeId);
    setSearchParams({ with: firstEmployeeId }, { replace: true });
  }, [conversationsQuery.data, selectedEmployeeId, setSearchParams]);

  useEffect(() => {
    if (!selectedEmployeeId || !latestUnreadIncomingId) return;
    let cancelled = false;
    void markInternalMessageConversationRead(selectedEmployeeId)
      .then(async () => {
        if (cancelled) return;
        await queryClient.invalidateQueries({ queryKey: ['internal-messages', 'conversations'] });
      })
      .catch((error) => {
        if (!cancelled) message.error(getErrorMessage(error));
      });
    return () => { cancelled = true; };
  }, [latestUnreadIncomingId, message, queryClient, selectedEmployeeId]);

  const chooseEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setSearchParams({ with: employeeId }, { replace: true });
  };
  const submit = () => {
    const trimmed = body.trim();
    if (!selectedEmployeeId) {
      message.warning('Сначала выберите сотрудника');
      return;
    }
    if (!trimmed) {
      message.warning('Введите сообщение');
      return;
    }
    sendMutation.mutate({ recipientId: selectedEmployeeId, body: trimmed });
  };

  return (
    <div className="page">
      <PageHeader
        title="Сообщения сотрудникам"
        description="Личная переписка внутри CRM. Сообщения видят только отправитель и выбранный получатель."
        extra={hasPermission(auth?.employee, 'notifications.read') ? (
          <Button icon={<NotificationOutlined />} onClick={() => navigate('/messages')}>
            Сообщения владельцам
          </Button>
        ) : undefined}
      />
      <div className="staff-messages-layout">
        <aside className="staff-conversations-panel">
          <Typography.Title level={4}>Сотрудники</Typography.Title>
          <Select
            showSearch
            value={selectedEmployeeId || undefined}
            placeholder="Выберите сотрудника"
            optionFilterProp="label"
            options={employees.map((employee) => ({ value: employee.id, label: employeeLabel(employee) }))}
            onChange={chooseEmployee}
          />
          <div className="staff-conversations-list">
            {(conversationsQuery.data?.items ?? []).map((conversation) => (
              <button
                key={conversation.employee.id}
                type="button"
                className={`staff-conversation-button${conversation.employee.id === selectedEmployeeId ? ' is-active' : ''}`}
                onClick={() => chooseEmployee(conversation.employee.id)}
              >
                <Badge count={conversation.unreadCount || undefined} size="small">
                  <Avatar>{conversation.employee.fullName.trim().slice(0, 1)}</Avatar>
                </Badge>
                <span className="staff-conversation-copy">
                  <Typography.Text strong ellipsis>{conversation.employee.fullName}</Typography.Text>
                  <Typography.Text type="secondary" ellipsis>{conversation.lastMessage.body}</Typography.Text>
                </span>
                <Typography.Text type="secondary" className="staff-conversation-time">
                  {formatDateTime(conversation.lastMessage.createdAt)}
                </Typography.Text>
              </button>
            ))}
            {!conversationsQuery.isLoading && !conversationsQuery.data?.items.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Переписок пока нет" />
            ) : null}
          </div>
        </aside>
        <section className="staff-thread-panel">
          {selectedEmployee ? (
            <>
              <div className="staff-thread-header">
                <Avatar icon={<TeamOutlined />}>{selectedEmployee.fullName.trim().slice(0, 1)}</Avatar>
                <div>
                  <Typography.Text strong>{selectedEmployee.fullName}</Typography.Text>
                  <div><Typography.Text type="secondary">{employeeSubtitle(selectedEmployee)}</Typography.Text></div>
                </div>
              </div>
              <div className="staff-thread-messages">
                {threadQuery.isLoading ? <Spin /> : null}
                {(threadQuery.data?.items ?? []).map((item) => {
                  const outgoing = item.sender.id === auth?.employee.id;
                  return (
                    <div key={item.id} className={`staff-message-row${outgoing ? ' is-outgoing' : ''}`}>
                      <div className="staff-message-bubble">
                        <Typography.Paragraph>{item.body}</Typography.Paragraph>
                        <span className="staff-message-meta">
                          {formatDateTime(item.createdAt)}
                          {outgoing ? ` · ${item.readAt ? 'прочитано' : 'доставлено'}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {!threadQuery.isLoading && !threadQuery.data?.items.length ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Начните переписку" />
                ) : null}
              </div>
              <div className="staff-message-compose">
                <TextArea
                  value={body}
                  maxLength={4000}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  placeholder={`Сообщение для ${selectedEmployee.fullName}`}
                  onChange={(event) => setBody(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                <Button type="primary" icon={<SendOutlined />} loading={sendMutation.isPending} onClick={submit}>
                  Отправить
                </Button>
              </div>
            </>
          ) : (
            <Empty description="Выберите сотрудника, чтобы написать сообщение" />
          )}
        </section>
      </div>
    </div>
  );
}

function mergeEmployees(...groups: InternalMessageEmployee[][]) {
  const employees = new Map<string, InternalMessageEmployee>();
  for (const group of groups) {
    for (const employee of group) employees.set(employee.id, employee);
  }
  return [...employees.values()].sort((left, right) => left.fullName.localeCompare(right.fullName, 'ru'));
}

function employeeLabel(employee: InternalMessageEmployee) {
  return `${employee.fullName}${employee.position ? ` · ${employee.position}` : ''}`;
}

function employeeSubtitle(employee: InternalMessageEmployee) {
  const roles = employee.roles.map((item) => item.role.title).join(', ');
  return [employee.position, roles].filter(Boolean).join(' · ') || 'Сотрудник клиники';
}
