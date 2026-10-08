import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Input, QRCode, Space, Typography } from 'antd';
import type { ClinicConversation } from '../onlineRequests/types';
import { chatAuthor, chatDelivery } from './chatLabels';
import { fromDatetimeLocal } from '../../shared/utils/date';
import { ClinicChatError, chatRequest } from './clinicChat.api';
import { ClinicChatBookingPanel } from './ClinicChatBookingPanel';
import { ClinicChatNotificationPreferences } from './ClinicChatNotificationPreferences';
export function ClinicAssistantPreviewPage() {
  return <div className="page"><Typography.Title level={2}>Проверка ассистента клиники</Typography.Title><Alert showIcon type="info" message="Внутренний пилот" description="Здесь проверяются запись, обращения и ответы посетителю сайта. Используйте вымышленные данные." /><ClinicChat /></div>;
}
export function ClinicChat() {
  const cache = useQueryClient(); const { message } = App.useApp(); const [started, setStarted] = useState(false);
  const [text, setText] = useState(''); const [booking, setBooking] = useState(false); const [link, setLink] = useState<{ url: string; expiresAt: string }>();
  const [form, setForm] = useState({ contactName: '', phone: '', animalNickname: '', comment: '', preferredAt: '', contactConsent: false });
  const key = useRef(crypto.randomUUID()); const bookingKey = useRef(crypto.randomUUID());
  const session = useMutation({ mutationFn: () => chatRequest<ClinicConversation>('/session', {}), onSuccess: data => {
    cache.removeQueries({ queryKey: ['clinic-chat-booking'] });
    cache.removeQueries({ queryKey: ['clinic-notification-preferences'] });
    cache.setQueryData(['clinic-chat-preview'], data); setLink(undefined); setBooking(false); setStarted(true);
  }, onError: e => message.error(e.message) });
  const state = useQuery({ queryKey: ['clinic-chat-preview'], queryFn: () => chatRequest<ClinicConversation>(''), enabled: started, refetchInterval: 3000, retry: false });
  const send = useMutation({ mutationFn: (value: string) => chatRequest<ClinicConversation>('/messages', { clientKey: key.current, text: value }), onSuccess: data => { cache.setQueryData(['clinic-chat-preview'], data); setText(''); key.current = crypto.randomUUID(); }, onError: e => message.error(e.message) });
  const intake = useMutation({ mutationFn: () => chatRequest<ClinicConversation>('/booking', { ...form, preferredAt: form.preferredAt ? fromDatetimeLocal(form.preferredAt) : undefined, clientKey: bookingKey.current }), onSuccess: data => { cache.setQueryData(['clinic-chat-preview'], data); setBooking(false); bookingKey.current = crypto.randomUUID(); }, onError: e => message.error(e.message) });
  const maxLink = useMutation({ mutationFn: () => chatRequest<{ url: string; expiresAt: string }>('/max-link', {}), onSuccess: setLink, onError: e => message.error(e.message) });
  const disconnect = useMutation({ mutationFn: () => chatRequest<ClinicConversation>('/max-disconnect', {}), onSuccess: data => { cache.setQueryData(['clinic-chat-preview'], data); setLink(undefined); }, onError: e => message.error(e.message) });
  const field = (name: keyof typeof form, value: string | boolean) => { setForm(old => ({ ...old, [name]: value })); bookingKey.current = crypto.randomUUID(); };
  if (!started) return <Button type="primary" loading={session.isPending} onClick={() => session.mutate()}>Открыть чат</Button>;
  if (state.error instanceof ClinicChatError && state.error.status === 401) return <Space direction="vertical"><Alert type="warning" message="Сессия изменилась. Откройте чат снова." /><Button type="primary" loading={session.isPending} onClick={() => session.mutate()}>Открыть чат</Button></Space>;
  return <section className="clinic-chat-pilot" aria-label="Чат клиники">
    {state.isError ? <Alert type="warning" message="Нет связи с чатом. Текст сохранён в форме; отправку можно повторить." /> : null}
    <div className="clinic-chat-history">{state.data?.messages.map(item => <div key={item.id} className={`clinic-chat-message clinic-chat-${item.author.toLowerCase()}`}><Typography.Text strong>{chatAuthor[item.author]}</Typography.Text><p>{item.text}</p>{item.author !== 'OWNER' ? <Typography.Text type="secondary">{chatDelivery[item.deliveryStatus]}</Typography.Text> : null}</div>)}</div>
    <Input.TextArea aria-label="Сообщение клинике" value={text} rows={3} maxLength={4000} disabled={send.isPending} onChange={event => { setText(event.target.value); key.current = crypto.randomUUID(); }} />
    <Space wrap><Button type="primary" disabled={!text.trim()} loading={send.isPending} onClick={() => send.mutate(text)}>Отправить</Button><Button onClick={() => setBooking(!booking)}>Заявка на приём</Button><Button disabled={send.isPending} onClick={() => { key.current = crypto.randomUUID(); send.mutate('Хочу поговорить с администратором'); }}>Позвать администратора</Button></Space>
    {state.data?.canAutoBook ? <ClinicChatBookingPanel conversationId={state.data.id} mode={state.data.mode} draft={state.data.bookingDraft} /> : null}
    {state.data?.ownerId ? <ClinicChatNotificationPreferences /> : null}
    {booking ? <div className="clinic-chat-intake"><Input aria-label="Ваше имя" placeholder="Ваше имя" value={form.contactName} onChange={e => field('contactName', e.target.value)} /><Input aria-label="Телефон для связи" placeholder="Телефон для связи" value={form.phone} onChange={e => field('phone', e.target.value)} /><Input aria-label="Кличка питомца" placeholder="Кличка питомца" value={form.animalNickname} onChange={e => field('animalNickname', e.target.value)} /><Input.TextArea aria-label="Причина обращения" placeholder="Причина обращения" value={form.comment} onChange={e => field('comment', e.target.value)} /><Typography.Text>Удобное время</Typography.Text><Input aria-label="Удобное время" type="datetime-local" value={form.preferredAt} onChange={e => field('preferredAt', e.target.value)} /><Checkbox checked={form.contactConsent} onChange={e => field('contactConsent', e.target.checked)}>Разрешаю клинике связаться со мной по этой заявке</Checkbox><Button type="primary" disabled={!form.contactConsent} loading={intake.isPending} onClick={() => intake.mutate()}>Передать заявку</Button></div> : null}
    <Typography.Paragraph>Можно подключить MAX для ответов по этому обращению.</Typography.Paragraph>{state.data?.maxConsent ? <Button loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Отключить MAX</Button> : <Button loading={maxLink.isPending} onClick={() => maxLink.mutate()}>Подключить MAX</Button>}
    {link ? <Space direction="vertical"><QRCode value={link.url} /><a href={link.url} target="_blank" rel="noreferrer">Открыть бота в MAX</a><Typography.Text type="secondary">Ссылка действует 5 минут и используется один раз.</Typography.Text></Space> : null}
  </section>;
}
