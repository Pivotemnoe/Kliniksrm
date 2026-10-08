import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Checkbox, Input, Select, Space, Typography } from 'antd';
import { chatRequest } from './clinicChat.api';
type Preference = { enabled: boolean; appointmentChanges: boolean; appointmentReminders: boolean; revisitReminders: boolean; vaccinationReminders: boolean; channel: 'MAX'; timezone: string; quietStartMinute: number; quietEndMinute: number };
type Result = { preference: Preference; maxLinked: boolean };
const initial: Preference = { enabled: true, appointmentChanges: true, appointmentReminders: true, revisitReminders: true, vaccinationReminders: true, channel: 'MAX', timezone: 'Europe/Moscow', quietStartMinute: 1320, quietEndMinute: 480 };
const zones = [['Europe/Kaliningrad','Калининград (UTC+2)'],['Europe/Moscow','Москва (UTC+3)'],['Europe/Samara','Самара (UTC+4)'],['Asia/Yekaterinburg','Екатеринбург (UTC+5)'],['Asia/Omsk','Омск (UTC+6)'],['Asia/Krasnoyarsk','Красноярск (UTC+7)'],['Asia/Irkutsk','Иркутск (UTC+8)'],['Asia/Yakutsk','Якутск (UTC+9)'],['Asia/Vladivostok','Владивосток (UTC+10)'],['Asia/Magadan','Магадан (UTC+11)'],['Asia/Kamchatka','Камчатка (UTC+12)']];
export function ClinicChatNotificationPreferences() {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(initial);
  const query = useQuery({ queryKey: ['clinic-notification-preferences'], queryFn: () => chatRequest<Result>('/notification-preferences'), enabled: open, retry: false });
  const fill = (result: Result) => setDraft(Object.fromEntries(Object.keys(initial).map(key => [key, result.preference[key as keyof Preference]])) as Preference);
  useEffect(() => { if (query.data) fill(query.data); }, [query.data]);
  const save = useMutation({ mutationFn: () => chatRequest<Result>('/notification-preferences', draft), onSuccess: result => { fill(result); void query.refetch(); message.success('Настройки уведомлений сохранены'); }, onError: error => message.error(error.message) });
  const stop = useMutation({ mutationFn: () => chatRequest<Result>('/notification-unsubscribe', {}), onSuccess: result => { fill(result); void query.refetch(); message.success('Напоминания отключены'); }, onError: error => message.error(error.message) });
  const pending = save.isPending || stop.isPending;
  const options = [['appointmentChanges', 'Подтверждение, перенос и отмена записи'], ['appointmentReminders', 'Напоминание о приёме'], ['revisitReminders', 'Напоминание о повторном визите'], ['vaccinationReminders', 'Напоминание о вакцинации']] as const;
  return <div className="clinic-chat-intake"><Button onClick={() => setOpen(!open)}>Настроить напоминания</Button>{open ? <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Text>Уведомления в MAX</Typography.Text>
    {query.isError ? <Alert showIcon type="warning" message="Войдите в личный кабинет, чтобы настроить напоминания." /> : query.data ? <>
      {!query.data.maxLinked ? <Alert showIcon type="info" message="MAX пока не подключён в личном кабинете." description="Привязка чата разрешает ответы по обращению. Для напоминаний используйте MAX-бота регистрации личного кабинета." /> : null}
      <Checkbox checked={draft.enabled} disabled={pending} onChange={e => setDraft(x => ({ ...x, enabled: e.target.checked }))}>Получать уведомления клиники</Checkbox>
      {options.map(([key, label]) => <Checkbox key={key} checked={draft[key]} disabled={pending || !draft.enabled} onChange={e => setDraft(x => ({ ...x, [key]: e.target.checked }))}>{label}</Checkbox>)}
      <Typography.Text>Часовой пояс</Typography.Text><Select aria-label="Часовой пояс уведомлений" value={draft.timezone} disabled={pending} style={{ width: '100%' }} options={zones.map(([value,label]) => ({ value,label }))} onChange={timezone => setDraft(x => ({ ...x, timezone }))} />
      <Typography.Text>Не отправлять с</Typography.Text><Input aria-label="Начало тихих часов" type="time" disabled={pending} value={time(draft.quietStartMinute)} onChange={e => { const value = minutes(e.target.value); if (value !== null) setDraft(x => ({ ...x, quietStartMinute: value })); }} />
      <Typography.Text>до</Typography.Text><Input aria-label="Конец тихих часов" type="time" disabled={pending} value={time(draft.quietEndMinute)} onChange={e => { const value = minutes(e.target.value); if (value !== null) setDraft(x => ({ ...x, quietEndMinute: value })); }} />
      <Typography.Text type="secondary">Одинаковое время отключает тихие часы. Время приёма указано по часовому поясу филиала.</Typography.Text>
      <Space wrap><Button type="primary" loading={save.isPending} disabled={pending} onClick={() => save.mutate()}>Сохранить уведомления</Button><Button loading={stop.isPending} disabled={pending} onClick={() => stop.mutate()}>Отключить все напоминания</Button></Space>
    </> : null}
  </Space> : null}</div>;
}
function time(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function minutes(value: string) { if (!/^\d{2}:\d{2}$/.test(value)) return null; const [h,m] = value.split(':').map(Number); return h < 24 && m < 60 ? h * 60 + m : null; }
