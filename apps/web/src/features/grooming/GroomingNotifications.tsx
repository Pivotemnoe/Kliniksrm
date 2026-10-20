import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Collapse, Drawer, Empty, Input, Segmented, Space, Tag, Typography } from 'antd';
import { BellOutlined, CalendarOutlined, CheckOutlined, CloseCircleOutlined, DownloadOutlined, InfoCircleOutlined, MobileOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../api/client';
import { ApiError, getErrorMessage } from '../../api/errors';
import { at } from './grooming.api';
import '../../shared/ui/module-ui.css';
import { GroomingPhones } from './GroomingPhones';

type Notice = { id: string; title: string; body: string; href: string; event: string; readAt: string | null; supersededAt: string | null; createdAt: string };
type Inbox = { items: Notice[]; unread: number };
type PushConfig = { available: boolean; publicKey: string | null; devices: { id: string; endpoint: string; expiresAt: string; lastSuccessAt: string | null }[] };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let pendingInstallPrompt: InstallPrompt | undefined;
const base = '/v1/grooming/staff';
export const useGroomingInbox = (actorId: string, enabled = true, poll = true) => useQuery({ queryKey: ['grooming', actorId, 'staff-inbox'], queryFn: () => apiRequest<Inbox>(`${base}/inbox`), enabled: Boolean(actorId) && enabled, refetchInterval: poll ? 15000 : false });
async function registration() { return navigator.serviceWorker.register('/grooming/sw.js', { scope: '/grooming/' }); }
function keyBytes(value: string) { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), char => char.charCodeAt(0)); }
function serialize(subscription: PushSubscription) { const data = subscription.toJSON(); return { endpoint: subscription.endpoint, p256dh: data.keys?.p256dh || '', auth: data.keys?.auth || '' }; }

export function useGroomingManifest() {
  useEffect(() => {
    const capture = (event: Event) => { event.preventDefault(); pendingInstallPrompt = event as InstallPrompt; };
    window.addEventListener('beforeinstallprompt', capture);
    const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const link = existing || document.createElement('link'), previous = link.getAttribute('href');
    link.rel = 'manifest'; link.href = '/grooming/manifest.webmanifest';
    if (!existing) document.head.append(link);
    if ('serviceWorker' in navigator && window.isSecureContext) void registration().catch(() => undefined);
    return () => { window.removeEventListener('beforeinstallprompt', capture); if (!existing) link.remove(); else if (previous) link.setAttribute('href', previous); };
  }, []);
}

export function GroomingPhoneButton({ actorId }: { actorId: string }) {
  const [open, setOpen] = useState(false);
  return <><Button icon={<MobileOutlined />} onClick={() => setOpen(true)}>На телефон</Button><GroomingPhoneDrawer actorId={actorId} open={open} onClose={() => setOpen(false)} /></>;
}

export function GroomingPhoneDrawer({ actorId, open, onClose, canManage = false, selectedId }: { actorId: string; open: boolean; onClose: () => void; canManage?: boolean; selectedId?: string }) {
  return <Drawer title={canManage ? 'Подключение телефона грумера' : 'Приложение грумера'} width="min(720px, 100vw)" open={open} onClose={onClose}>{canManage ? <GroomingPhones actorId={actorId} selectedId={selectedId} /> : <GroomingDeviceCard actorId={actorId} />}</Drawer>;
}

export function GroomingDeviceCard({ actorId }: { actorId: string }) {
  const { message } = App.useApp(), client = useQueryClient();
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | undefined>(pendingInstallPrompt), [installed, setInstalled] = useState(false), [subscription, setSubscription] = useState<PushSubscription | null>(null), [permission, setPermission] = useState<NotificationPermission>('default'), [hint, setHint] = useState(false), [deviceError, setDeviceError] = useState('');
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const config = useQuery({ queryKey: ['grooming', actorId, 'push-config'], queryFn: () => apiRequest<PushConfig>(`${base}/push/config`) });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const refresh = () => client.invalidateQueries({ queryKey: ['grooming', actorId] });
  const linked = Boolean(subscription && config.data?.devices.some(device => device.endpoint === subscription.endpoint));
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const updateInstalled = () => setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const finish = () => { setInstalled(true); setHint(false); setInstallPrompt(undefined); };
    updateInstalled(); media.addEventListener('change', updateInstalled);
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', finish);
    return () => { media.removeEventListener('change', updateInstalled); window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', finish); };
  }, []);
  useEffect(() => {
    let active = true;
    if (!supported) return;
    setPermission(Notification.permission);
    void registration().then(worker => worker.pushManager.getSubscription()).then(async current => {
      if (!active) return;
      setSubscription(current);
      // Renew an existing device binding after login without another permission prompt.
      if (current && Notification.permission === 'granted' && config.data?.available && localStorage.getItem(`grooming:push-opt-out:${actorId}`) !== 'true') { await apiRequest(`${base}/push/subscribe`, { method: 'POST', body: serialize(current) }); if (active) await refresh(); }
    }).catch(error => { if (active) setDeviceError(getErrorMessage(error)); });
    return () => { active = false; };
  // Rebind once when server configuration becomes available; never request permission automatically.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId, supported, config.data?.publicKey]);
  const connect = useMutation({ mutationFn: async (permissionRequest: Promise<NotificationPermission>) => {
    setDeviceError('');
    // The permission request starts directly inside the click handler (iOS requirement).
    const granted = await permissionRequest; setPermission(granted);
    if (granted !== 'granted') throw new Error('Разрешите уведомления для этого сайта в настройках браузера');
    const worker = await registration();
    await navigator.serviceWorker.ready;
    let current = await worker.pushManager.getSubscription();
    const bytes = keyBytes(config.data!.publicKey!);
    if (current?.options.applicationServerKey && Array.from(new Uint8Array(current.options.applicationServerKey)).join(',') !== Array.from(bytes).join(',')) { await apiRequest(`${base}/push/unsubscribe`, { method: 'POST', body: { endpoint: current.endpoint } }); await current.unsubscribe(); current = null; }
    current ||= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    try { await apiRequest(`${base}/push/subscribe`, { method: 'POST', body: serialize(current) }); }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 409) throw error; await current.unsubscribe(); current = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }); await apiRequest(`${base}/push/subscribe`, { method: 'POST', body: serialize(current) }); }
    localStorage.removeItem(`grooming:push-opt-out:${actorId}`); setSubscription(current);
  }, onSuccess: async () => { await refresh(); message.success('Уведомления подключены на этом устройстве'); }, onError: error => setDeviceError(getErrorMessage(error)) });
  const disconnect = useMutation({ mutationFn: async () => {
    if (!subscription) return;
    await apiRequest(`${base}/push/unsubscribe`, { method: 'POST', body: { endpoint: subscription.endpoint } });
    localStorage.setItem(`grooming:push-opt-out:${actorId}`, 'true');
    const old = subscription; setSubscription(null); await old.unsubscribe();
    const worker = await registration(); (await worker.getNotifications()).forEach(notice => notice.close());
  }, onSuccess: refresh, onError: error => setDeviceError(getErrorMessage(error)) });
  const test = useMutation({ mutationFn: () => apiRequest(`${base}/push/test`, { method: 'POST' }), onSuccess: async () => { message.success('Проверка поставлена в очередь. Посмотрите уведомления телефона'); await refresh(); }, onError: error => setDeviceError(getErrorMessage(error)) });
  return <Card className="grooming-device-card" title={<Space><MobileOutlined />На вашем телефоне</Space>}><Space direction="vertical" size={14} className="full-width">
    <Typography.Paragraph>{installed ? 'Приложение установлено. Ваш кабинет и расписание доступны с главного экрана.' : 'Установите «Груминг» на главный экран. Приложение открывает ваш кабинет и расписание.'}</Typography.Paragraph>
    <Space wrap><Button icon={<DownloadOutlined />} disabled={installed} onClick={async () => { const prompt = installPrompt || pendingInstallPrompt; if (!prompt) { setHint(true); return; } await prompt.prompt(); await prompt.userChoice; pendingInstallPrompt = undefined; setInstallPrompt(undefined); }}>{installed ? 'Приложение установлено' : 'Установить приложение'}</Button><Tag color={linked && permission === 'granted' ? 'green' : undefined}>{linked && permission === 'granted' ? 'Push подключён' : 'Push не подключён'}</Tag></Space>
    {(hint || (ios && !installed)) && <Alert type="info" showIcon message={ios ? 'Установка на iPhone или iPad' : 'Установка из браузера'} description={ios ? 'В Safari откройте «Поделиться» → «На экран Домой». Откройте приложение с новой иконки, войдите и включите уведомления.' : 'В Chrome откройте меню ⋮ → «Установить и создать ярлык» → «Установить». В других браузерах выберите «Установить приложение» или «Добавить на главный экран».'} />}
    {(!supported || !config.data?.available || (ios && !installed)) && <Typography.Paragraph type="secondary">{!window.isSecureContext ? 'Для уведомлений нужен защищённый адрес HTTPS.' : ios && !installed ? 'На iPhone push включается после установки на главный экран.' : !supported ? 'Этот браузер не поддерживает push. Список событий в кабинете доступен.' : config.isLoading ? 'Проверяем подключение уведомлений…' : 'Уведомления на телефон ещё не настроены на сервере. События уже сохраняются в кабинете.'}</Typography.Paragraph>}
    {permission === 'denied' && <Alert type="warning" message="Уведомления запрещены в настройках браузера" description="Разрешите их для этого сайта и откройте кабинет снова." />}
    {(deviceError || config.isError) && <Alert type="error" showIcon message={deviceError || getErrorMessage(config.error)} />}
    <Space wrap><Button type="primary" icon={<BellOutlined />} disabled={!supported || !config.data?.available || (ios && !installed) || permission === 'denied' || linked} loading={connect.isPending} onClick={() => connect.mutate(Notification.requestPermission())}>Включить уведомления</Button>{linked && <><Button loading={test.isPending} onClick={() => test.mutate()}>Отправить проверку</Button><Button loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Отключить на устройстве</Button></>}</Space>
    <Typography.Text type="secondary">Новая запись, перенос и отмена поступают назначенному грумеру и администратору. Подробности доступны после входа. MAX подключается отдельно.</Typography.Text>
  </Space></Card>;
}

const noticeGroups = [
  { key: 'CREATED', title: 'Новые записи', icon: <CalendarOutlined /> },
  { key: 'RESCHEDULED', title: 'Переносы', icon: <SwapOutlined /> },
  { key: 'CANCELLED', title: 'Отмены', icon: <CloseCircleOutlined /> },
  { key: 'REASSIGNED', title: 'Передано другому грумеру', icon: <SwapOutlined /> },
  { key: 'INFORMATION', title: 'Информация', icon: <InfoCircleOutlined /> },
  { key: 'HISTORY', title: 'Предыдущие события', icon: <InfoCircleOutlined /> },
];
function noticeGroup(item: Notice) {
  if (item.supersededAt) return 'HISTORY';
  if (item.event === 'CONFIRMED' || item.event === 'BOOKED' || item.event === 'CREATED') return 'CREATED';
  return noticeGroups.some(group => group.key === item.event) ? item.event : 'INFORMATION';
}

export function GroomingInbox({ actorId }: { actorId: string }) {
  const query = useGroomingInbox(actorId, true, false), client = useQueryClient(), navigate = useNavigate(), { message } = App.useApp();
  const [view, setView] = useState('unread'), [search, setSearch] = useState(''), [expanded, setExpanded] = useState<string[]>([]);
  const read = useMutation({ mutationFn: (id?: string) => apiRequest(`${base}/inbox/${id ? `${encodeURIComponent(id)}/read` : 'read-all'}`, { method: 'POST' }), onSuccess: () => client.invalidateQueries({ queryKey: ['grooming', actorId, 'staff-inbox'] }), onError: error => message.error(getErrorMessage(error)) });
  const visible = (query.data?.items || []).filter(item => (view !== 'unread' || (!item.readAt && !item.supersededAt)) && `${item.title} ${item.body}`.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
  const groups = noticeGroups.map(group => ({ ...group, items: visible.filter(item => noticeGroup(item) === group.key) })).filter(group => group.items.length);
  async function openNotice(item: Notice) {
    try { if (!item.readAt) await read.mutateAsync(item.id); navigate(item.href); }
    catch { /* Keep the notice visible; the mutation displays its error. */ }
  }
  return <Card className="module-inbox-card" title={<Space><BellOutlined />Мои оповещения</Space>} loading={query.isLoading}>
    <div className="module-inbox-toolbar">
      <div className="module-inbox-summary"><span>Новых событий: <strong>{query.data?.unread || 0}</strong></span><Button type="text" size="small" icon={<CheckOutlined />} disabled={!query.data?.unread} loading={read.isPending} onClick={() => read.mutate(undefined)}>Просмотрено всё</Button></div>
      <div className="module-inbox-controls"><Segmented aria-label="Фильтр оповещений груминга" value={view} onChange={value => setView(String(value))} options={[{ value: 'unread', label: 'Новые' }, { value: 'all', label: 'Все' }]} /><Input allowClear prefix={<SearchOutlined />} aria-label="Поиск в оповещениях груминга" placeholder="Питомец или событие" value={search} onChange={event => setSearch(event.target.value)} /></div>
    </div>
    {query.isError && <Alert type="error" showIcon message={getErrorMessage(query.error)} action={<Button onClick={() => void query.refetch()}>Повторить</Button>} />}
    {!query.isLoading && (groups.length ? <Collapse key={`${view}:${search.trim()}`} className="module-notice-groups" defaultActiveKey={groups.length === 1 ? [groups[0].key] : []} expandIconPosition="end" items={groups.map(group => ({
      key: group.key,
      label: <span className="module-notice-group-title">{group.icon}<strong>{group.title}</strong><Tag>{group.items.length}</Tag></span>,
      children: <>{group.items.slice(0, expanded.includes(group.key) ? undefined : 3).map(item => <article key={item.id} className={`module-notice${!item.readAt && !item.supersededAt ? ' is-unread' : ''}${item.supersededAt ? ' is-superseded' : ''}`}>
        <span className={`module-notice-icon${item.event === 'CANCELLED' ? ' is-cancelled' : ''}`}>{group.icon}</span>
        <div className="module-notice-copy"><div className="module-notice-title"><strong>{item.title}</strong>{!item.readAt && !item.supersededAt && <Tag color="blue">Новое</Tag>}{item.supersededAt && <Tag>Запись изменилась</Tag>}</div><p>{item.body}</p><div className="module-notice-time">{at(item.createdAt)}{item.readAt ? ' · Просмотрено' : ''}</div><div className="module-notice-actions"><Button type="link" disabled={read.isPending} onClick={() => void openNotice(item)}>{item.href.includes('/bookings/') ? 'Открыть запись' : 'Открыть'} →</Button>{!item.readAt && <Button type="text" disabled={read.isPending} onClick={() => read.mutate(item.id)}>Просмотрено</Button>}</div></div>
      </article>)}{group.items.length > 3 && <Button type="text" className="module-notice-more" onClick={() => setExpanded(current => current.includes(group.key) ? current.filter(key => key !== group.key) : [...current, group.key])}>{expanded.includes(group.key) ? 'Свернуть список' : `Показать ещё ${group.items.length - 3}`}</Button>}</>,
    }))} /> : !query.isError && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search.trim() ? 'По этому запросу ничего не найдено' : view === 'unread' ? 'Новых оповещений нет' : 'Событий пока нет'} />)}
    <p className="module-inbox-footnote">Отметка «Просмотрено» не завершает запись и не меняет её статус.</p>
  </Card>;
}
