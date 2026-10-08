import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Input, Select, Space, Typography } from 'antd';
import { chatRequest } from './clinicChat.api';
import type { ClinicBookingDraft } from '../onlineRequests/types';
type Offer = { offerToken: string; serviceId: string; serviceTitle: string; employeeName: string; officeName: string; timezone: string; startsAt: string; expiresAt: string };
type Options = { animals: { id: string; nickname: string }[]; services?: { id: string; title: string }[]; offers: Offer[]; selection?: { serviceState: string; dateState: string; message: string; followupQuestion?: boolean; visitKind?: string | null } };
type Confirmation = { appointmentId: string; status: string; startsAt: string; timezone: string; officeName: string; employeeName: string };
type Operation = { id: string; kind: 'OPTIONS' | 'CONFIRM'; status: 'PENDING' | 'DONE' | 'FAILED'; result: Options | Confirmation | null; error: string | null; draftRevision?: number | null; bookingSequence?: number | null };
type Search = { clientKey: string; days: number; serviceId?: string; serviceQuery?: string; preferredTimeText?: string; date?: string; draftRevision?: number; recentVisitAnswer?: boolean };
function timeLabel(at: string, timezone: string) {
  return `${new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, dateStyle: 'long', timeStyle: 'short' }).format(new Date(at))} (${timezone === 'Europe/Moscow' ? 'московское время' : `время филиала, ${timezone}`})`;
}
export function ClinicChatBookingPanel({ conversationId, mode, draft }: { conversationId: string; mode: string; draft?: ClinicBookingDraft | null }) {
  const { message } = App.useApp(), cache = useQueryClient();
  const key = ['clinic-chat-booking', conversationId];
  const optionsKey = useRef(crypto.randomUUID()), confirmKey = useRef(crypto.randomUUID());
  const [animalId, setAnimal] = useState<string>(), [offerToken, setOffer] = useState<string>();
  const [serviceId, setService] = useState<string>(), [date, setDate] = useState('');
  const [recentVisitAnswer, setRecentVisitAnswer] = useState<boolean>();
  const attemptedDraft = useRef<number | undefined>(undefined);
  const [searchDirty, setSearchDirty] = useState(false);
  const [comment, setComment] = useState(''), [contactConsent, setContact] = useState(false), [appointmentConsent, setAppointment] = useState(false);
  const current = useQuery({ queryKey: key, queryFn: async () => (await chatRequest<{ operation: Operation | null }>('/booking-operations')).operation, retry: false,
    refetchInterval: query => query.state.data?.status === 'PENDING' ? 2000 : false });
  const options = useMutation({ mutationFn: (search: Search) => chatRequest<Operation>('/slots', search), onSuccess: data => {
    cache.setQueryData(key, data); optionsKey.current = crypto.randomUUID(); setSearchDirty(false); setOffer(undefined); setAppointment(false); confirmKey.current = crypto.randomUUID(); void cache.invalidateQueries({ queryKey: ['clinic-chat-preview'] });
  }, onError: e => message.error(e.message) });
  const confirm = useMutation({ mutationFn: () => chatRequest<Operation>('/slot-confirmation', { optionsId: current.data?.id, clientKey: confirmKey.current, animalId, offerToken, comment, contactConsent, appointmentConsent }), onSuccess: data => {
    cache.setQueryData(key, data); confirmKey.current = crypto.randomUUID(); void cache.invalidateQueries({ queryKey: ['clinic-chat-preview'] });
  }, onError: e => message.error(e.message) });
  const result = current.data?.kind === 'OPTIONS' && current.data.status === 'DONE' ? current.data.result as Options : null;
  const booked = current.data?.kind === 'CONFIRM' && current.data.status === 'DONE' ? current.data.result as Confirmation : null;
  const selected = result?.offers.find(x => x.offerToken === offerToken);
  const busy = current.data?.status === 'PENDING' || options.isPending || confirm.isPending;
  useEffect(() => {
    if (!draft || mode !== 'ASSISTANT' || !current.isFetched || current.isError || busy) return;
    if (current.data?.draftRevision === draft.revision || (current.data?.kind === 'CONFIRM' && (current.data.bookingSequence || 0) >= draft.revision) || attemptedDraft.current === draft.revision) return;
    attemptedDraft.current = draft.revision; setService(undefined); setDate(''); setOffer(undefined); setAppointment(false); setRecentVisitAnswer(undefined);
    options.mutate({ clientKey: `dialog_options_${draft.revision}`, days: 7, draftRevision: draft.revision,
      ...(draft.serviceQuery ? { serviceQuery: draft.serviceQuery } : {}), ...(draft.preferredTimeText ? { preferredTimeText: draft.preferredTimeText } : {}) });
  }, [draft, mode, current.isFetched, current.isError, current.data, busy, options]);
  const search = (answer = recentVisitAnswer) => options.mutate({ clientKey: optionsKey.current, days: 7,
    ...(serviceId ? { serviceId } : draft?.serviceQuery ? { serviceQuery: draft.serviceQuery } : {}),
    ...(date ? { date } : draft?.preferredTimeText ? { preferredTimeText: draft.preferredTimeText } : {}), ...(draft ? { draftRevision: draft.revision } : {}), ...(answer !== undefined ? { recentVisitAnswer: answer } : {}) });
  const change = (callback: () => void) => { callback(); confirmKey.current = crypto.randomUUID(); setAppointment(false); };
  return <div className="clinic-chat-intake" aria-label="Самостоятельная запись">
    <Typography.Title level={5}>Выбрать время приёма</Typography.Title>
    {current.isError ? <Alert type="warning" message={current.error.message} /> : null}
    {current.data?.status === 'PENDING' ? <Alert type="info" message="Проверяем запись в клинике" description="Время ещё не подтверждено. Результат останется в чате, даже если закрыть страницу." /> : null}
    {current.data?.status === 'FAILED' ? <Alert type="warning" message={current.data.error || 'Не удалось подтвердить время'} description="Обновите свободное время или позовите администратора." /> : null}
    {booked ? <Alert type={booked.status === 'CANCELLED' ? 'warning' : 'success'} message={booked.status === 'CANCELLED' ? 'Запись отменена' : 'Запись подтверждена'} description={`${timeLabel(booked.startsAt, booked.timezone)}. ${booked.officeName}. ${booked.employeeName}.`} /> : null}
    {draft?.serviceQuery || draft?.preferredTimeText ? <Typography.Paragraph>Ваш выбор: {[draft.serviceQuery, draft.preferredTimeText].filter(Boolean).join(', ')}</Typography.Paragraph> : null}
    {result?.services && result.services.length > 1 ? <Select aria-label="Услуга для записи" placeholder="Выберите услугу" value={serviceId} disabled={busy || mode !== 'ASSISTANT'} options={result.services.map(x => ({ value: x.id, label: x.title }))} onChange={value => change(() => { setService(value); setSearchDirty(true); setOffer(undefined); setRecentVisitAnswer(undefined); })} /> : null}
    <Input aria-label="Дата для записи" type="date" value={date} disabled={busy || mode !== 'ASSISTANT'} onChange={e => change(() => { setDate(e.target.value); setSearchDirty(true); setOffer(undefined); })} />
    <Button disabled={busy || mode !== 'ASSISTANT'} loading={options.isPending} onClick={() => search()}>Показать свободное время</Button>
    {result ? <>
      {result.selection?.message ? <Typography.Paragraph>{result.selection.message}</Typography.Paragraph> : !result.offers.length ? <Typography.Paragraph>Свободного времени для самостоятельной записи сейчас нет. Можно оставить заявку администратору.</Typography.Paragraph> : null}
      {result.selection?.followupQuestion ? <Space wrap><Button disabled={busy || mode !== 'ASSISTANT'} onClick={() => { setRecentVisitAnswer(true); search(true); }}>Да, были в течение месяца</Button><Button disabled={busy || mode !== 'ASSISTANT'} onClick={() => { setRecentVisitAnswer(false); search(false); }}>Нет — первичный приём</Button></Space> : null}
      <Select aria-label="Питомец для записи" placeholder="Выберите питомца" value={animalId} disabled={busy} options={result.animals.map(x => ({ value: x.id, label: x.nickname }))} onChange={value => change(() => setAnimal(value))} />
      <Select aria-label="Время приёма" placeholder="Выберите время" value={offerToken} disabled={busy || searchDirty} options={result.offers.map(x => ({ value: x.offerToken, label: `${x.serviceTitle} — ${timeLabel(x.startsAt, x.timezone)}${result.selection?.visitKind ? '' : ` — ${x.employeeName}, ${x.officeName}`}` }))} onChange={value => change(() => setOffer(value))} />
      <Input.TextArea aria-label="Комментарий к записи" placeholder="Причина обращения" maxLength={1000} disabled={busy} value={comment} onChange={e => change(() => setComment(e.target.value))} />
      <Checkbox disabled={busy} checked={contactConsent} onChange={e => { setContact(e.target.checked); confirmKey.current = crypto.randomUUID(); }}>Разрешаю клинике связаться со мной по этой записи</Checkbox>
      <Checkbox disabled={busy || !selected} checked={appointmentConsent} onChange={e => { setAppointment(e.target.checked); confirmKey.current = crypto.randomUUID(); }}>Подтверждаю выбранные услугу, питомца и время приёма</Checkbox>
      <Space><Button type="primary" disabled={busy || searchDirty || mode !== 'ASSISTANT' || !animalId || !selected || !contactConsent || !appointmentConsent || new Date(selected.expiresAt).getTime() <= Date.now()} loading={confirm.isPending} onClick={() => confirm.mutate()}>Подтвердить запись</Button></Space>
    </> : null}
  </div>;
}
