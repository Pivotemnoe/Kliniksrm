import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Badge, Button, Drawer, Empty, Form, Input, Modal, Popconfirm, Segmented, Space, Spin, Tag } from 'antd';
import { BellOutlined, CalendarOutlined, PlusOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { apiRequest } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useCurrentEmployee, useIdleLogout, useLoginMutation, useUnauthorizedListener, isUnauthorized } from '../../auth/useAuth';
import { at, day, statusLabels, time } from '../grooming/grooming.api';
import { appointmentStatusLabels } from '../appointments/types';
import { mobileApi, staffAppBase, type MobileBooking, type MobileProfile } from './staffApp.api';
import { canUseWorker, staffCommandKey, staffWorker } from './staffPlatform';
import { BookingForm } from './StaffBookingForm';
import { Account, InstallApp, PasswordForm, PushSetup } from './StaffAccount';
const StaffSettings = lazy(() => import('./StaffAppSettingsPage').then(module => ({ default: module.StaffAppSettingsPage })));
const bookingStatusLabel = (status: string, grooming: boolean) => ((grooming ? statusLabels : appointmentStatusLabels) as Record<string, string>)[status] || status;

const command = <T,>(path: string, body: unknown) => {
  if (!navigator.onLine) return Promise.reject(new Error('Нет связи. Действие не отправлено.'));
  return apiRequest<T>(`${staffAppBase}/${path}`, { method: 'POST', body });
};

export function StaffApp() {
  const auth = useCurrentEmployee();
  useUnauthorizedListener('/login');
  useIdleLogout(Boolean(auth.data?.employee), '/login');
  if (auth.isPending) return <main className="staff-loading"><Spin size="large" /></main>;
  if (auth.isError && !isUnauthorized(auth.error) && !auth.data) return <main className="staff-login"><Problem error={auth.error} retry={() => void auth.refetch()} /></main>;
  if (!auth.data?.employee || isUnauthorized(auth.error)) return <StaffLogin />;
  if (auth.data.employee.mustChangePassword) return <main className="staff-login"><Brand /><PasswordForm first /></main>;
  return <StaffWorkspace />;
}
function Brand() { return <div className="staff-brand"><img src="/staff/icon-192.png" alt="" /><div><strong>TemichevVet</strong><span>Сотрудники</span></div></div>; }
function Problem({ error, retry }: { error: unknown; retry?: () => void }) {
  return <Alert type="error" showIcon message="Не удалось получить ответ CRM" description={getErrorMessage(error)} action={retry ? <Button onClick={retry}>Повторить</Button> : undefined} />;
}
function StaffLogin() {
  const login = useLoginMutation(), navigate = useNavigate();
  return <main className="staff-login"><Brand /><h1>Ваш рабочий день</h1><p>Расписание, записи и уведомления — в одном месте.</p>
    <Form layout="vertical" onFinish={async values => { await login.mutateAsync(values); navigate('/today', { replace: true }); }}>
      <Form.Item label="Телефон или email" name="login" rules={[{ required: true, message: 'Укажите данные для входа' }]}><Input autoComplete="username" /></Form.Item>
      <Form.Item label="Пароль" name="password" rules={[{ required: true, message: 'Введите пароль' }]}><Input.Password autoComplete="current-password" /></Form.Item>
      {login.isError && <Problem error={login.error} />}<Button block type="primary" htmlType="submit" loading={login.isPending}>Войти</Button>
    </Form><InstallApp /></main>;
}
function StaffWorkspace() {
  const { data: auth } = useCurrentEmployee(), client = useQueryClient(), location = useLocation(), navigate = useNavigate();
  const { message } = App.useApp();
  const profile = useQuery({ queryKey: ['staff-app', 'profile'], queryFn: mobileApi.profile, refetchInterval: 20000 });
  const inbox = useQuery({ queryKey: ['staff-app', 'inbox'], queryFn: mobileApi.inbox, enabled: Boolean(profile.data?.settings.enabled && profile.data.settings.notifications), refetchInterval: 20000 });
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const refresh = () => void client.invalidateQueries({ queryKey: ['staff-app'] });
    window.addEventListener('online', update); window.addEventListener('offline', update);
    navigator.serviceWorker?.addEventListener('message', refresh);
    if (canUseWorker()) void staffWorker().catch(() => undefined);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); navigator.serviceWorker?.removeEventListener('message', refresh); };
  }, [client]);
  const refresh = () => void client.invalidateQueries({ queryKey: ['staff-app'] });
  if (profile.isPending) return <main className="staff-loading"><Spin /></main>;
  if (!profile.data) return <main className="staff-login"><Problem error={profile.error} retry={() => void profile.refetch()} /></main>;
  if (!profile.data.settings.enabled) return <main className="staff-login"><Brand /><h1>Приложение отключено</h1><p>Администратор может включить его в CRM, в настройках приложения сотрудников.</p><Account /></main>;
  const current = profile.data;
  return <div className="staff-shell"><header className="staff-header"><Brand /><Button type="text" icon={<ReloadOutlined />} aria-label="Обновить данные" onClick={refresh} /></header>
    <main className="staff-content">
      {!online && <Alert type="warning" showIcon message="Нет подключения" description="Показаны последние загруженные данные. Изменения не отправляются." />}
      {profile.isError && <Problem error={profile.error} retry={() => void profile.refetch()} />}
      <Routes>
        <Route path="/today" element={<Agenda profile={current} name={auth!.employee.fullName} online={online && !profile.isError} />} />
        <Route path="/calendar" element={<Agenda profile={current} name={auth!.employee.fullName} online={online && !profile.isError} calendar />} />
        <Route path="/inbox" element={<section><h1>Уведомления</h1>{!current.settings.notifications && <Alert type="info" message="Новые уведомления отключены в настройках CRM" />}
          {inbox.isPending && current.settings.notifications ? <Spin /> : inbox.isError ? <Problem error={inbox.error} retry={() => void inbox.refetch()} /> : !inbox.data?.items.length ? <Empty description="Новых уведомлений пока нет" /> : <div className="staff-list">{inbox.data.items.map(item => <button className="staff-notice" key={item.id} onClick={async () => { try { await command(`inbox/${encodeURIComponent(item.id)}/read`, {}); await client.invalidateQueries({ queryKey: ['staff-app', 'inbox'] }); } catch (error) { message.error(getErrorMessage(error)); } }}><div><strong>{item.title}</strong>{!item.readAt && !item.supersededAt && <Tag color="blue">Новое</Tag>}</div><p>{item.body}</p><small>{at(item.createdAt)}{item.supersededAt ? ' · обновлено' : ''}</small></button>)}</div>}</section>} />
        <Route path="/settings" element={current.canManage ? <Suspense fallback={<Spin />}><StaffSettings /></Suspense> : <Navigate to="/today" replace />} />
        <Route path="/profile" element={<section><h1>Мой профиль</h1><div className="staff-card"><h2>{auth!.employee.fullName}</h2><p>{auth!.employee.position || (current.kind === 'GROOMING' ? 'Грумер' : 'Сотрудник')}</p>
          <p>{current.canBook ? current.kind === 'GROOMING' ? 'Можно создавать и переносить свои записи.' : 'Запись в клинику с телефона включена.' : 'Расписание и записи доступны для просмотра.'}</p></div>
          <InstallApp />{current.kind === 'GROOMING' && current.settings.notifications && <PushSetup />}<PasswordForm /><Account />
          {current.canManage && <Button className="staff-link" type="link" onClick={() => navigate('/settings')}>Настроить возможности сотрудников</Button>}</section>} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </main><nav className="staff-nav" aria-label="Основные разделы">{[
      ['/today', <CalendarOutlined />, 'Сегодня'], ['/calendar', <CalendarOutlined />, 'Записи'], ['/inbox', <Badge count={inbox.data?.unread || 0} size="small"><BellOutlined /></Badge>, 'Уведомления'], ['/profile', <UserOutlined />, 'Профиль'],
    ].map(([path, icon, label]) => <button key={String(path)} aria-current={location.pathname === path ? 'page' : undefined} onClick={() => navigate(String(path))}>{icon}<span>{label}</span></button>)}</nav></div>;
}
function Agenda({ profile, name, online, calendar = false }: { profile: MobileProfile; name: string; online: boolean; calendar?: boolean }) {
  const location = useLocation(), navigate = useNavigate(), dateParam = new URLSearchParams(location.search).get('date');
  const scopeParam = new URLSearchParams(location.search).get('scope');
  const scope = profile.canViewClinic && scopeParam !== 'mine' ? 'clinic' : 'mine';
  const [date, setDate] = useState(dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : day(new Date())), [selected, setSelected] = useState<MobileBooking | null>(null), [booking, setBooking] = useState<MobileBooking | 'new' | null>(null);
  useEffect(() => { if (!calendar) setDate(day(new Date())); else if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) setDate(dateParam); }, [calendar, dateParam]);
  const from = new Date(`${date}T00:00:00+03:00`), to = new Date(+from + 86400000);
  const query = useQuery({ queryKey: ['staff-app', 'agenda', date, scope], queryFn: () => mobileApi.agenda(from.toISOString(), to.toISOString(), scope), refetchInterval: 20000 });
  const tasks = useQuery({ queryKey: ['staff-app', 'tasks'], queryFn: () => apiRequest<{ id: string; title: string; description?: string; status: string; dueAt?: string }[]>(`${staffAppBase}/tasks`), enabled: profile.kind === 'CLINIC' && !calendar, refetchInterval: 20000 });
  const ready = online && !query.isError;
  return <section><div className="staff-page-title"><div><span className="staff-eyebrow">{profile.kind === 'GROOMING' ? 'Кабинет грумера' : 'Мой рабочий день'}</span><h1>{calendar ? profile.kind === 'GROOMING' ? 'Мои записи' : scope === 'clinic' ? 'Приёмы клиники' : 'Мои приёмы' : `Здравствуйте, ${name.split(' ')[0]}`}</h1></div>
    {profile.canBook && <Button type="primary" icon={<PlusOutlined />} disabled={!ready} onClick={() => setBooking('new')}>Записать</Button>}</div>
    <label className="staff-date">Дата<Input aria-label="Дата расписания" type="date" value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); const params = new URLSearchParams(location.search); params.set('date', event.target.value); navigate(`/calendar?${params}`, { replace: true }); } }} /></label>
    {profile.canViewClinic && <Segmented aria-label="Чьё расписание" block value={scope} options={[{ value: 'clinic', label: 'Все приёмы' }, { value: 'mine', label: 'Мои приёмы' }]} onChange={value => { const params = new URLSearchParams(location.search); params.set('scope', String(value)); if (calendar) params.set('date', date); navigate({ search: params.toString() }, { replace: true }); }} />}
    {!calendar && profile.canViewClinic && <h2>{scope === 'clinic' ? 'Все приёмы клиники' : 'Мои приёмы'}</h2>}
    {query.isPending ? <Spin /> : <>{query.isError && <Problem error={query.error} retry={() => void query.refetch()} />}
      <p className="staff-updated">{query.dataUpdatedAt ? `Обновлено ${time(new Date(query.dataUpdatedAt).toISOString())}` : ''}</p>
      {!!query.data?.shifts.length && <div className="staff-card staff-shift"><strong>Моя смена</strong><span>{query.data.shifts.map(shift => `${time(shift.startsAt)}–${time(shift.endsAt)}`).join(', ')}</span></div>}
      {!query.data?.items.length ? <Empty description="На эту дату записей нет" /> : <div className="staff-list">{query.data.items.map(item => <button className="staff-booking" key={item.id} onClick={() => setSelected(item)}>
        <time>{time(item.startsAt)}</time><div><strong>{item.animal.nickname}</strong><span>{item.serviceTitle || item.animal.species || 'Приём'}</span><small>{item.owner.fullName}</small>{scope === 'clinic' && item.employee && <small>Врач: {item.employee.fullName}</small>}</div><Tag>{bookingStatusLabel(item.status, profile.kind === 'GROOMING')}</Tag>
      </button>)}</div>}
    </>}
    {!!tasks.data?.length && <section><h2>Мои задачи</h2>{tasks.data.filter(task => !['DONE', 'COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(task.status)).map(task => <div className="staff-card" key={task.id}><strong>{task.title}</strong>{task.description && <p>{task.description}</p>}{task.dueAt && <small>{at(task.dueAt)}</small>}</div>)}</section>}
    <BookingCard booking={selected} grooming={profile.kind === 'GROOMING'} canBook={profile.canBook} online={ready} onClose={() => setSelected(null)} onMove={item => { setSelected(null); setBooking(item); }} />
    <Modal open={Boolean(booking)} title={booking === 'new' ? 'Новая запись' : 'Перенести запись'} footer={null} destroyOnHidden onCancel={() => setBooking(null)}>
      {booking && <BookingForm profile={profile} initial={booking === 'new' ? undefined : booking} date={date} onSaved={savedDate => { setBooking(null); navigate(`/calendar?date=${encodeURIComponent(savedDate)}${profile.kind === 'CLINIC' ? '&scope=clinic' : ''}`); }} />}
    </Modal>
  </section>;
}
function BookingCard({ booking, grooming, canBook, online, onClose, onMove }: { booking: MobileBooking | null; grooming: boolean; canBook: boolean; online: boolean; onClose: () => void; onMove: (item: MobileBooking) => void }) {
  const { message } = App.useApp(), client = useQueryClient();
  const statusKeys = useRef(new Map<string, string>());
  const status = useMutation({ networkMode: 'always', retry: false, mutationFn: (next: string) => {
    const id = `${booking!.id}:${booking!.version}:${next}`;
    if (!statusKeys.current.has(id)) statusKeys.current.set(id, staffCommandKey());
    return command(`grooming/bookings/${booking!.id}/status`, { clientKey: statusKeys.current.get(id), version: booking!.version, status: next });
  },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['staff-app'] }); message.success('Статус сохранён в CRM'); onClose(); }, onError: error => message.error(getErrorMessage(error)) });
  const transitions: Record<string, [string, string][]> = { CONFIRMED: [['ARRIVED', 'Клиент пришёл'], ['CANCELLED', 'Отменить'], ['NO_SHOW', 'Не пришёл']], ARRIVED: [['IN_PROGRESS', 'Начать процедуру']], IN_PROGRESS: [['COMPLETED', 'Завершить']] };
  return <Drawer title="Карточка записи" open={Boolean(booking)} onClose={onClose} width="min(440px, 100vw)">
    {booking && <div className="staff-detail"><Tag>{bookingStatusLabel(booking.status, grooming)}</Tag><h2>{booking.animal.nickname}</h2><p>{at(booking.startsAt)}</p><p>{booking.serviceTitle || 'Клинический приём'}</p>
      <p>{[booking.animal.species, booking.animal.breed].filter(Boolean).join(' · ')}</p><h3>Клиент</h3><p>{booking.owner.fullName}</p>{booking.owner.phone && <a href={`tel:${booking.owner.phone.replace(/[^+\d]/g, '')}`}>{booking.owner.phone}</a>}
      {booking.employee && <p>Специалист: {booking.employee.fullName}</p>}{booking.location && <p>{booking.location.name}</p>}{booking.room && <p>{booking.room.name}</p>}
      {(booking.notes || booking.comment) && <p className="staff-prewrap">{booking.notes || booking.comment}</p>}
      {grooming && <Space direction="vertical" style={{ width: '100%' }}>{canBook && booking.status === 'CONFIRMED' && <Button block disabled={!online} onClick={() => onMove(booking)}>Перенести</Button>}
        {(transitions[booking.status] || []).map(([next, label]) => <Popconfirm key={next} title={`${label}?`} okText="Подтвердить" cancelText="Отмена" onConfirm={() => status.mutate(next)}><Button block disabled={!online || status.isPending} danger={next === 'CANCELLED'}>{label}</Button></Popconfirm>)}</Space>}
    </div>}
  </Drawer>;
}
