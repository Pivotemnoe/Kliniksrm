import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, Popconfirm, Space, Tag, Typography } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { useCurrentEmployee } from '../../auth/useAuth';
import { claimOnlineRequest, getConversationJobs, getOnlineRequest, retryConversationJob, sendConversationCommand } from './onlineRequests.api';
import { formatDateTime } from '../../shared/utils/date';
import { chatAuthor, chatDelivery } from '../clinicAssistant/chatLabels';
import { discardQueuedReply, flushQueuedReplies, queueClinicReply, readQueuedReplies, retryQueuedReply, subscribeQueuedReplies } from './conversationOutbox';
export function ConversationPanel({ requestId }: { requestId: string }) {
  const cache = useQueryClient(); const { message } = App.useApp(); const { data: auth } = useCurrentEmployee();
  const request = useQuery({ queryKey: ['online-request-conversation', requestId], queryFn: () => getOnlineRequest(requestId), refetchInterval: 10_000 });
  const jobs = useQuery({ queryKey: ['online-request-conversation-jobs', requestId], queryFn: () => getConversationJobs(requestId), refetchInterval: 10_000 });
  const [text, setText] = useState('');
  const [outbox, setOutbox] = useState(() => auth?.employee.id ? readQueuedReplies(auth.employee.id) : []);
  useEffect(() => {
    const refreshOutbox = () => setOutbox(auth?.employee.id ? readQueuedReplies(auth.employee.id) : []);
    refreshOutbox();
    return subscribeQueuedReplies(refreshOutbox);
  }, [auth?.employee.id]);
  const refresh = async () => { await Promise.all(['online-request-conversation', 'online-request-conversation-jobs', 'online-request-card', 'online-request-attention', 'online-requests'].map(q => cache.invalidateQueries({ queryKey: [q] }))); };
  const claim = useMutation({ mutationFn: () => claimOnlineRequest(requestId), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  const retry = useMutation({ mutationFn: (jobId: string) => retryConversationJob(requestId, jobId), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  const send = useMutation({ mutationFn: (action: 'RESUME' | 'RESOLVE') => sendConversationCommand(requestId, { clientKey: crypto.randomUUID(), action }),
    onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  function submitReply() {
    if (!auth?.employee.id || !text.trim()) return;
    try {
      queueClinicReply(auth.employee.id, requestId, text);
      setText('');
      void flushQueuedReplies(auth.employee.id, () => void refresh());
      message.success('Ответ сохранён. Если связь прервана, он отправится автоматически после восстановления в этой вкладке.');
    } catch (error) { message.error(getErrorMessage(error)); }
  }
  const conversation = request.data?.conversationSnapshot;
  const mine = request.data?.assignedEmployeeId === auth?.employee.id;
  const canClaim = !request.data?.assignedEmployeeId || request.data.assignedEmployee?.status === 'BLOCKED';
  return <section className="clinic-conversation-panel" aria-label="Переписка владельца">
    <Typography.Title level={4}>Переписка</Typography.Title>
    {request.isError ? <Alert type="error" message="Переписка не обновлена. Показана последняя полученная история." /> : null}
    <Tag>{conversation?.mode === 'ASSISTANT' ? 'Отвечает ассистент' : conversation?.mode === 'RESOLVED' ? 'Обработано' : 'Отвечает администратор'}</Tag>
    {conversation?.historyLimited ? <Alert type="info" message="Показаны последние 200 сообщений" /> : null}
    <div className="clinic-chat-history">
      {conversation?.messages.map(item => <div key={item.id} className={`clinic-chat-message clinic-chat-${item.author.toLowerCase()}`}>
        <Typography.Text strong>{chatAuthor[item.author] || item.author}</Typography.Text> <Typography.Text type="secondary">{formatDateTime(item.createdAt)} · {item.channel === 'MAX' ? 'MAX' : 'Сайт'}</Typography.Text>
        <p>{item.text}</p><Typography.Text type={['FAILED', 'UNKNOWN'].includes(item.deliveryStatus) ? 'danger' : 'secondary'}>{chatDelivery[item.deliveryStatus] || item.deliveryStatus}</Typography.Text>
      </div>)}
      {jobs.data?.filter(job => job.status !== 'DONE').map(job => <div key={job.id} className="clinic-chat-message"><Typography.Text strong>Ответ администратора</Typography.Text><p>{job.payload.text || (job.payload.action === 'RESUME' ? 'Вернуть ассистенту' : 'Завершить обращение')}</p><Typography.Text type={job.status === 'FAILED' ? 'danger' : 'secondary'}>{job.status === 'FAILED' ? 'Не отправлено — требуется проверка' : 'Сохранено, ожидает передачи в чат'}</Typography.Text>{job.status === 'FAILED' && mine ? <Button size="small" loading={retry.isPending} onClick={() => retry.mutate(job.id)}>Повторить передачу</Button> : null}</div>)}
      {outbox.filter(item => item.requestId === requestId).map(item => <div key={item.clientKey} className="clinic-chat-message">
        <Typography.Text strong>Ответ администратора · {item.state === 'queued' ? 'ожидает связи с CRM' : 'требуется проверка'}</Typography.Text>
        <p>{item.text}</p>
        {item.error ? <Typography.Text type="danger">{item.error}</Typography.Text> : <Typography.Text type="secondary">Сохранён только в этой вкладке. Не закрывайте её до отправки.</Typography.Text>}
        {item.state === 'needs-review' && mine ? <Button size="small" onClick={() => { retryQueuedReply(item.employeeId, item.clientKey); void flushQueuedReplies(item.employeeId, () => void refresh()); }}>Повторить</Button> : null}
        {mine ? <Popconfirm title="Удалить неотправленный ответ?" okText="Удалить" cancelText="Отмена" onConfirm={() => discardQueuedReply(item.employeeId, item.clientKey)}><Button size="small" danger>Не отправлять</Button></Popconfirm> : null}
      </div>)}
    </div>
    {!mine && canClaim ? <Button loading={claim.isPending} onClick={() => claim.mutate()}>Взять переписку в работу</Button> : null}
    {!mine ? <Typography.Paragraph type="secondary">Отвечать может ответственный администратор.</Typography.Paragraph> : <>
      <Input.TextArea aria-label="Ответ владельцу" value={text} rows={3} maxLength={4000} onChange={event => setText(event.target.value)} disabled={send.isPending} />
      <Space wrap><Button type="primary" disabled={!text.trim()} onClick={submitReply}>Ответить в чат</Button><Button disabled={send.isPending || request.isError} onClick={() => send.mutate('RESUME')}>Вернуть ассистенту</Button><Button disabled={send.isPending || request.isError} onClick={() => send.mutate('RESOLVE')}>Завершить переписку</Button></Space>
    </>}
  </section>;
}
