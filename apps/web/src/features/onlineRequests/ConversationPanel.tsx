import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Input, Space, Tag, Typography } from 'antd';
import { getErrorMessage } from '../../api/errors';
import { useCurrentEmployee } from '../../auth/useAuth';
import { claimOnlineRequest, getConversationJobs, getOnlineRequest, retryConversationJob, sendConversationCommand } from './onlineRequests.api';
import { formatDateTime } from '../../shared/utils/date';
import { chatAuthor, chatDelivery } from '../clinicAssistant/chatLabels';
export function ConversationPanel({ requestId }: { requestId: string }) {
  const cache = useQueryClient(); const { message } = App.useApp(); const { data: auth } = useCurrentEmployee();
  const request = useQuery({ queryKey: ['online-request-conversation', requestId], queryFn: () => getOnlineRequest(requestId), refetchInterval: 10_000 });
  const jobs = useQuery({ queryKey: ['online-request-conversation-jobs', requestId], queryFn: () => getConversationJobs(requestId), refetchInterval: 10_000 });
  const [text, setText] = useState(''); const key = useRef(crypto.randomUUID());
  const refresh = async () => { await Promise.all(['online-request-conversation', 'online-request-conversation-jobs', 'online-request-attention', 'online-requests'].map(q => cache.invalidateQueries({ queryKey: [q] }))); };
  const claim = useMutation({ mutationFn: () => claimOnlineRequest(requestId), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  const retry = useMutation({ mutationFn: (jobId: string) => retryConversationJob(requestId, jobId), onSuccess: refresh, onError: e => message.error(getErrorMessage(e)) });
  const send = useMutation({ mutationFn: (action: 'REPLY' | 'RESUME' | 'RESOLVE') => sendConversationCommand(requestId, { clientKey: key.current, action, ...(action === 'REPLY' ? { text } : {}) }),
    onSuccess: async () => { setText(''); key.current = crypto.randomUUID(); await refresh(); }, onError: e => message.error(getErrorMessage(e)) });
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
    </div>
    {!mine && canClaim ? <Button loading={claim.isPending} onClick={() => claim.mutate()}>Взять переписку в работу</Button> : null}
    {!mine ? <Typography.Paragraph type="secondary">Отвечать может ответственный администратор.</Typography.Paragraph> : <>
      <Input.TextArea aria-label="Ответ владельцу" value={text} rows={3} maxLength={4000} onChange={event => { setText(event.target.value); key.current = crypto.randomUUID(); }} disabled={send.isPending} />
      <Space wrap><Button type="primary" loading={send.isPending} disabled={!text.trim() || request.isError} onClick={() => send.mutate('REPLY')}>Ответить в чат</Button><Button disabled={send.isPending || request.isError} onClick={() => { key.current = crypto.randomUUID(); send.mutate('RESUME'); }}>Вернуть ассистенту</Button><Button disabled={send.isPending || request.isError} onClick={() => { key.current = crypto.randomUUID(); send.mutate('RESOLVE'); }}>Завершить переписку</Button></Space>
    </>}
  </section>;
}
