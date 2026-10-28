import { BookingSource } from '../../shared/ui/BookingSource';
import { createContext, useContext, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Badge, Button, Card, Checkbox, Collapse, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { MobileOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../../api/errors';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';
import { ModuleActions } from '../../shared/ui/ModuleActions';
import { createOperationKey } from '../../shared/utils/operationKey';
import { at, Booking, Client, deliveryLabels, groomingApi, groomingPrice, groomingReference, Overview, Shift, speciesLabels, statusLabels, time } from './grooming.api';
import './grooming.css';
import { GroomingCalendar } from './GroomingCalendar';
import { GroomingBookingDuration } from './GroomingBookingDuration';
import { GroomingCalendarBooking } from './GroomingCalendarBooking';
import { GroomingServices } from './GroomingServices';
import { GroomingSetup } from './GroomingSetup';
import { GroomingPhones } from './GroomingPhones';
import { GroomingWorkplaces } from './GroomingWorkplaces';
import { GroomingTeam } from './GroomingTeam';
import { ModulePublicLink, groomingPublicUrl } from '../../shared/ui/ModulePublicLink';
import { GroomingDeviceCard, GroomingInbox, GroomingPhoneDrawer, useGroomingInbox, useGroomingManifest } from './GroomingNotifications';

const GroomingActorContext = createContext('');

const optionMap = (value: Record<string, string>) => Object.entries(value).map(([value, label]) => ({ value, label }));
const key = createOperationKey;

export function GroomingPage({ standalone = false }: { standalone?: boolean } = {}) {
  const location = useLocation(), navigate = useNavigate(), client = useQueryClient();
  const { data: auth } = useCurrentEmployee();
  const overview = useQuery({ queryKey: ['grooming', auth?.employee.id, 'overview'], queryFn: groomingApi.overview, enabled: Boolean(auth?.employee.id) });
  useGroomingManifest();
  const inbox = useGroomingInbox(auth?.employee.id || '', Boolean(overview.data), !standalone);
  useEffect(() => {
    const handler = (event: MessageEvent) => { if (event.data?.type === 'GROOMING_INBOX_CHANGED') void client.invalidateQueries({ queryKey: ['grooming', auth?.employee.id] }); };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [client, auth?.employee.id]);
  const selected = location.pathname.split('/')[2] || 'calendar';
  const bookingId = selected === 'bookings' ? location.pathname.split('/')[3] : undefined;
  const [calendarBookingId, setCalendarBookingId] = useState<string>();
  const [calendarStart, setCalendarStart] = useState<{ shift: Shift; startsAt: string }>(), [teamOpen, setTeamOpen] = useState(false);
  const [create, setCreate] = useState(false), [move, setMove] = useState<Booking>(), [phoneOpen, setPhoneOpen] = useState(false), [phoneSpecialist, setPhoneSpecialist] = useState<string>();
  const canOperate = auth?.employee.permissions.includes('grooming.operate') || false;
  const manager = auth?.employee.roles.some(role => ['director', 'administrator'].includes(role)) || false;
  const refresh = () => client.invalidateQueries({ queryKey: ['grooming'] });
  if (overview.isError) return <div className="page"><PageHeader title="Груминг" /><Alert type="warning" showIcon message={getErrorMessage(overview.error)} /></div>;
  const data = overview.data;
  if (!data) return <div className="page"><Spin /></div>;
  const items = [
    { key: 'calendar', label: 'Календарь', children: <CalendarView overview={data} onOpen={setCalendarBookingId} onManage={() => setTeamOpen(true)} onCreate={(shift, startsAt) => { setCalendarStart({ shift, startsAt }); setCreate(true); }} /> },
    { key: 'bookings', label: 'Записи', children: <Bookings onOpen={id => navigate(`/grooming/bookings/${id}`)} /> },
    ...(manager ? [{ key: 'clients', label: 'Клиенты и питомцы', children: <Clients /> }] : []),
    ...(data.canSchedule ? [{ key: 'specialists', label: 'Грумеры и места', children: <GroomingTeam overview={data} actorId={auth!.employee.id} refresh={refresh} onPhone={id => { setPhoneSpecialist(id); setPhoneOpen(true); }} /> }] : []),
    ...(data.canManage ? [{ key: 'services', label: 'Услуги', children: <GroomingServices overview={data} refresh={refresh} /> }] : []),
    { key: 'notifications', label: <Space>Оповещения<Badge count={inbox.data?.unread || 0} title={`Непросмотренных: ${inbox.data?.unread || 0}`} /></Space>, children: <Notifications canManage={data.canManage} /> },
    ...(data.canManage ? [{ key: 'settings', label: 'Настройки', children: <Settings overview={data} refresh={refresh} /> }] : []),
  ];
  return <GroomingActorContext.Provider value={auth!.employee.id}><div key={auth!.employee.id} className="page grooming-page">
    <PageHeader title="Груминг" description="Записи, команда и уход за питомцами" extra={<ModuleActions primary={manager && canOperate && !data.limited ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCalendarStart(undefined); setCreate(true); }}>Записать питомца</Button> : <Button icon={<MobileOutlined />} onClick={() => setPhoneOpen(true)}>На телефон</Button>} actions={[
      ...(manager && canOperate && !data.limited ? [{ key: 'phone', label: data.canManage ? 'Подключить грумера' : 'На телефон', icon: <MobileOutlined />, onClick: () => setPhoneOpen(true) }] : []),
      { key: 'refresh', label: 'Обновить', icon: <ReloadOutlined />, onClick: refresh },
      ...(auth!.employee.roles.includes('director') ? [{ key: 'module', label: 'Подключение модуля', icon: <SettingOutlined />, onClick: () => navigate(standalone ? '/grooming/admin/modules' : '/settings/modules') }] : []),
    ]} />} />
    {!standalone && import.meta.env.VITE_GROOMING_QA === 'true' && <Alert type="info" banner message="Локальная проверка · вымышленные данные · без отправки в MAX" />}
    <ModulePublicLink label="Сайт груминга" href={groomingPublicUrl} />
    <Drawer title="Грумеры и места в салоне" width="min(1000px,100vw)" open={teamOpen} onClose={() => setTeamOpen(false)} destroyOnHidden>{teamOpen && <GroomingTeam overview={data} actorId={auth!.employee.id} refresh={refresh} onSchedule={employeeId => { setTeamOpen(false); navigate(`/grooming/calendar?groomer=${employeeId}&schedule=1`); }} onPhone={id => { setTeamOpen(false); setPhoneSpecialist(id); setPhoneOpen(true); }} />}</Drawer>
    <GroomingPhoneDrawer actorId={auth!.employee.id} canManage={data.canManage} selectedId={phoneSpecialist} open={phoneOpen} onClose={() => setPhoneOpen(false)} />
    {data.limited && <Alert className="grooming-banner" type="info" showIcon message="Модуль отключён. История сохранена, новые записи недоступны." />}
    {data.canManage && !data.limited && <GroomingSetup overview={data} />}
    <Tabs activeKey={items.some(item => item.key === selected) ? selected : 'calendar'} items={items} onChange={tab => navigate(`/grooming/${tab}`)} />
    <BookingDetails id={calendarBookingId || bookingId} canOperate={canOperate} canMove={manager && !data.limited} onClose={() => calendarBookingId ? setCalendarBookingId(undefined) : navigate('/grooming/bookings')} onMove={booking => { setCalendarBookingId(undefined); setCalendarStart(undefined); setMove(booking); }} refresh={refresh} />
    <Modal open={create || Boolean(move)} footer={null} title={move ? 'Перенести запись' : 'Записать питомца'} width={760} onCancel={() => { setCreate(false); setMove(undefined); setCalendarStart(undefined); }} destroyOnHidden>
      {(create || move) && <GroomingCalendarBooking overview={data} actorId={auth!.employee.id} initialShift={calendarStart?.shift} initialStart={calendarStart?.startsAt} existing={move} onSchedule={() => { setCreate(false); setMove(undefined); navigate('/grooming/calendar?schedule=1'); }} done={async () => { setCreate(false); setMove(undefined); setCalendarStart(undefined); await refresh(); }} />}
    </Modal>
  </div></GroomingActorContext.Provider>;
}

function CalendarView({ overview, onOpen, onCreate, onManage }: { overview: Overview; onOpen: (id: string) => void; onCreate: (shift: Shift, startsAt: string) => void; onManage: () => void }) {
  return <GroomingCalendar actorId={useContext(GroomingActorContext)} overview={overview} onOpen={onOpen} onCreate={onCreate} onManage={onManage} />;
}

function Bookings({ onOpen }: { onOpen: (id: string) => void }) {
  const actorId = useContext(GroomingActorContext);
  const [status, setStatus] = useState(''), [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['grooming', actorId, 'bookings'], queryFn: () => groomingApi.bookings(), refetchInterval: 15000 });
  return <Space direction="vertical" size={16} className="full-width"><Space wrap><Input.Search placeholder="Кличка, клиент или услуга" aria-label="Поиск записи" value={search} onChange={e => setSearch(e.target.value)} /><Select aria-label="Статус записи" value={status} onChange={setStatus} options={[{ value: '', label: 'Все статусы' }, ...optionMap(statusLabels)]} style={{ minWidth: 170 }} /></Space>{query.isError && <Alert type="error" message={getErrorMessage(query.error)} />}<Table<Booking> rowKey="id" loading={query.isLoading} dataSource={query.data?.filter(b => (!status || b.status === status) && `${b.animal.nickname} ${b.owner?.fullName} ${b.serviceTitle}`.toLowerCase().includes(search.toLowerCase()))} scroll={{ x: 850 }} columns={[
    { title: 'Время', dataIndex: 'startsAt', render: value => at(value) },
    { title: 'Питомец', key: 'animal', render: (_, b) => <Button type="link" onClick={() => onOpen(b.id)}>{b.animal.nickname}</Button> },
    { title: 'Клиент', key: 'owner', render: (_, b) => <span>{b.owner?.fullName}<br /><small>{b.owner?.phone}</small></span> },
    { title: 'Услуга', dataIndex: 'serviceTitle' }, { title: 'Специалист', key: 'employee', render: (_, b) => b.employee.fullName },
    { title: 'Статус', dataIndex: 'status', render: value => <Tag color={value === 'CONFIRMED' ? 'blue' : value === 'COMPLETED' ? 'green' : undefined}>{statusLabels[value] || value}</Tag> },
  ]} locale={{ emptyText: 'Записи появятся после бронирования на сайте или в CRM' }} /></Space>;
}

function BookingDetails({ id, canOperate, canMove, onClose, onMove, refresh }: { id?: string; canOperate: boolean; canMove: boolean; onClose: () => void; onMove: (booking: Booking) => void; refresh: () => Promise<unknown> }) {
  const actorId = useContext(GroomingActorContext);
  const { message } = App.useApp();
  const query = useQuery({ queryKey: ['grooming', actorId, 'booking', id], queryFn: () => groomingApi.booking(id!), enabled: Boolean(id) });
  const [durationBooking, setDurationBooking] = useState<Booking>();
  const [attempt, setAttempt] = useState(key);
  useEffect(() => setAttempt(key()), [id]);
  const mutation = useMutation({ mutationFn: (status: string) => groomingApi.save(`bookings/${id}/status`, { status, version: query.data!.version, clientKey: attempt }), onSuccess: async () => { setAttempt(key()); await refresh(); message.success('Статус сохранён'); }, onError: e => message.error(getErrorMessage(e)) });
  const booking = query.data;
  const actions: Record<string, string[]> = { CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'], ARRIVED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['COMPLETED'] };
  return <Drawer open={Boolean(id)} title="Запись на груминг" onClose={onClose} width="min(720px, 100vw)">{query.isError && <Alert type="error" message={getErrorMessage(query.error)} />}{booking && <Space direction="vertical" size={20} className="full-width"><Tag color="blue">{statusLabels[booking.status]}</Tag><Descriptions column={1} bordered size="small"><Descriptions.Item label="Питомец">{booking.animal.nickname} · {booking.animal.breed || booking.animal.species}</Descriptions.Item><Descriptions.Item label="Клиент">{booking.owner?.fullName} · {booking.owner?.phone}</Descriptions.Item><Descriptions.Item label="Источник обращения"><BookingSource source={booking.source} attribution={booking.attribution} /></Descriptions.Item><Descriptions.Item label="Услуга">{booking.serviceTitle} · {groomingPrice(booking)}</Descriptions.Item><Descriptions.Item label="Время">{at(booking.startsAt)}–{time(booking.endsAt)} МСК</Descriptions.Item>{booking.blockedUntil !== booking.endsAt && <Descriptions.Item label="Подготовка места">До {time(booking.blockedUntil)}</Descriptions.Item>}<Descriptions.Item label="Специалист">{booking.employee.fullName}</Descriptions.Item><Descriptions.Item label="Место">{booking.location.name} · {booking.workplace.name}</Descriptions.Item><Descriptions.Item label="Пожелания">{booking.notes || 'Не указаны'}</Descriptions.Item><Descriptions.Item label="Образы">{booking.looks?.length ? <Space direction="vertical">{booking.looks.map(id => { const reference = groomingReference(id); return reference.url ? <a key={id} href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title} ↗</a> : <span key={id}>{reference.title}</span>; })}</Space> : 'Не выбраны'}</Descriptions.Item></Descriptions>
    <Space wrap>{canOperate && ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(booking.status) && <Button onClick={() => setDurationBooking(booking)}>Изменить длительность</Button>}{canMove && booking.status === 'CONFIRMED' && <Button onClick={() => onMove(booking)}>Перенести</Button>}{canOperate && actions[booking.status]?.map(status => <Popconfirm key={status} title={`Установить статус «${statusLabels[status]}»?`} onConfirm={() => mutation.mutate(status)}><Button danger={status === 'CANCELLED'} loading={mutation.isPending}>{statusLabels[status]}</Button></Popconfirm>)}</Space>{booking.notifications?.some(item => item.status === 'FAILED' || item.status === 'UNKNOWN') && <Alert type="warning" showIcon message="Проверьте доставку оповещений" />}
    {Boolean(booking.notifications?.length) && <Collapse className="full-width" items={[{ key: 'delivery', label: `Доставка оповещений · ${booking.notifications!.length}`, children: <Space direction="vertical" size={12} className="full-width">{booking.notifications!.map(n => <div key={n.id}><Tag>{deliveryLabels[n.status] || n.status}</Tag>{n.recipientKind === 'OWNER' ? 'Клиент' : 'Сотрудник'} · {at(n.scheduledAt)}{n.lastError && <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>{({ DISABLED: 'Отправка выключена', DEFERRED: 'Отправка отложена', SENDING: 'Проверяется прежняя отправка', NO_CONSENT: 'Нет согласия на сообщения', EXPIRED: 'Срок сообщения истёк', CANCELLED: 'Сообщение отменено', UNKNOWN: 'Требуется сверить доставку' } as Record<string, string>)[n.lastError] || n.lastError}</Typography.Paragraph>}</div>)}</Space> }]} />}</Space>}<GroomingBookingDuration booking={durationBooking} onClose={() => setDurationBooking(undefined)} refresh={refresh} /></Drawer>;
}

function Clients() {
  const actorId = useContext(GroomingActorContext);
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['grooming', actorId, 'clients', search], queryFn: () => groomingApi.clients(search) });
  return <Space direction="vertical" size={16} className="full-width"><Input.Search aria-label="Поиск клиента" placeholder="Имя или телефон" onSearch={setSearch} allowClear />{query.isError && <Alert type="error" message={getErrorMessage(query.error)} />}<Table<Client> rowKey="id" dataSource={query.data} loading={query.isLoading} columns={[{ title: 'Клиент', dataIndex: 'fullName' }, { title: 'Телефон', dataIndex: 'phone' }, { title: 'Питомцы', key: 'pets', render: (_, c) => c.animals.map(p => <Tag key={p.id}>{p.nickname}{p.breed ? ` · ${p.breed}` : ''}</Tag>) }]} locale={{ emptyText: 'Клиенты появятся после первой записи. Для поиска в общей базе введите имя или телефон.' }} /></Space>;
}



function Notifications({ canManage }: { canManage: boolean }) {
  const actorId = useContext(GroomingActorContext);
  const query = useQuery({ queryKey: ['grooming', actorId, 'notifications'], queryFn: groomingApi.notifications, refetchInterval: 15000 });
  const failed = query.data?.filter(item => item.status === 'FAILED' || item.status === 'UNKNOWN').length || 0;
  return <Space direction="vertical" size={16} className="full-width">
    {canManage && <GroomingPhones actorId={actorId} />}
    <GroomingInbox actorId={actorId} />
    {query.isError && <Alert type="error" showIcon message={getErrorMessage(query.error)} />}
    {failed > 0 && <Alert type="warning" showIcon message={`Проверьте доставку MAX: ${failed}`} description="Подробности — в разделе доставки ниже." />}
    <Collapse items={[
      { key: 'device', label: 'Приложение и оповещения на телефоне', children: <GroomingDeviceCard actorId={actorId} /> },
      { key: 'delivery', label: <Space>Доставка сообщений через MAX{failed > 0 && <Tag color="warning">{failed}</Tag>}</Space>, children: <>
        <Typography.Paragraph type="secondary">Используется текущий MAX-бот клиники. Статус «MAX принял» означает подтверждение отправки сервисом.</Typography.Paragraph>
        <Table rowKey="id" dataSource={query.data} loading={query.isLoading} scroll={{ x: 800 }} columns={[{ title: 'Запланировано', dataIndex: 'scheduledAt', render: at }, { title: 'Адресат', dataIndex: 'recipientKind', render: v => v === 'OWNER' ? 'Клиент' : 'Сотрудник' }, { title: 'Сообщение', dataIndex: 'text', width: 400 }, { title: 'Доставка', dataIndex: 'status', render: v => <Tag>{deliveryLabels[v] || v}</Tag> }, { title: 'Причина', dataIndex: 'lastError' }]} />
      </> },
    ]} />
  </Space>;
}

function Settings({ overview, refresh }: { overview: Overview; refresh: () => Promise<unknown> }) {
  const [form] = Form.useForm(), { message } = App.useApp();
  useEffect(() => form.setFieldsValue({ ...overview.settings, administratorMaxIds: overview.settings.administratorMaxIds.join(', ') }), [overview.settings, form]);
  const save = useMutation({ mutationFn: (values: { selfBookingEnabled: boolean; minimumCancelMinutes: number; reminderHours: number[]; administratorMaxIds: string }) => groomingApi.save('settings', { ...values, version: overview.settings.version, administratorMaxIds: values.administratorMaxIds.split(',').map(v => v.trim()).filter(Boolean) }, 'PATCH'), onSuccess: async () => { await refresh(); message.success('Настройки сохранены'); }, onError: e => message.error(getErrorMessage(e)) });
  return <Space direction="vertical" className="full-width" size={20}><Card title="Сайт и онлайн-запись"><Typography.Paragraph>Клиент выбирает услугу, грумера и свободное время на сайте. После входа через текущий MAX подтверждает бронь. Запись появляется в этом расписании.</Typography.Paragraph><a href={import.meta.env.VITE_GROOMING_STOREFRONT_URL || 'https://pet.temichevvet.ru/#services'} target="_blank" rel="noopener noreferrer">Открыть сайт груминга ↗</a></Card><Resources overview={overview} refresh={refresh} /><Card title="Самостоятельная запись и уведомления"><Form form={form} layout="vertical" onFinish={save.mutate} className="grooming-settings-form"><Form.Item name="selfBookingEnabled" label="Клиенты могут бронировать время самостоятельно" valuePropName="checked"><Switch /></Form.Item><Form.Item name="minimumCancelMinutes" label="Перенос и отмена через кабинет: минимум до визита, минут" rules={[{ required: true }]}><InputNumber min={0} max={10080} /></Form.Item><Form.Item name="reminderHours" label="Напоминания клиенту и назначенному грумеру"><Checkbox.Group options={[{ value: 24, label: 'За сутки' }, { value: 2, label: 'За 2 часа' }]} /></Form.Item><Form.Item name="testClientMaxId" label="Тестовая запись: MAX выбранного клиента" extra="Во время проверки записаться может только этот подтверждённый MAX. Оставьте поле пустым, чтобы открыть запись всем клиентам."><Input placeholder="Только для ограниченной проверки" /></Form.Item><Form.Item name="administratorMaxIds" label="MAX user_id администраторов через запятую"><Input placeholder="Идентификаторы сотрудников, запустивших текущего бота" /></Form.Item><Typography.Paragraph type="secondary">MAX для клиента подключается при входе в кабинет. Сбой сообщения сохраняется в журнале и не отменяет бронь.</Typography.Paragraph><Button type="primary" htmlType="submit" loading={save.isPending}>Сохранить настройки</Button></Form></Card></Space>;
}

function Resources({ overview, refresh }: { overview: Overview; refresh: () => Promise<unknown> }) {
  return <GroomingWorkplaces overview={overview} refresh={refresh} />;
}
