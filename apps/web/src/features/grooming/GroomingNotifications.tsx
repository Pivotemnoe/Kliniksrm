import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Drawer, Empty, Space, Tag, Typography } from 'antd';
import { BellOutlined, DownloadOutlined, MobileOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../api/client';
import { ApiError, getErrorMessage } from '../../api/errors';
import { at } from './grooming.api';

type Notice = { id: string; title: string; body: string; href: string; event: string; readAt: string | null; supersededAt: string | null; createdAt: string };
type Inbox = { items: Notice[]; unread: number };
type PushConfig = { available: boolean; publicKey: string | null; devices: { id: string; endpoint: string; expiresAt: string; lastSuccessAt: string | null }[] };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let pendingInstallPrompt: InstallPrompt | undefined;
const base = '/v1/grooming/staff';
export const useGroomingInbox = (actorId: string, enabled = true) => useQuery({ queryKey: ['grooming', actorId, 'staff-inbox'], queryFn: () => apiRequest<Inbox>(`${base}/inbox`), enabled: Boolean(actorId) && enabled, refetchInterval: 15000 });
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
  return <><Button icon={<MobileOutlined />} onClick={() => setOpen(true)}>На телефон</Button><Drawer title="Приложение грумера" width={520} open={open} onClose={() => setOpen(false)}><GroomingDeviceCard actorId={actorId} /></Drawer></>;
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
    const finish = () => { setInstalled(true); setInstallPrompt(undefined); };
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
    <Typography.Paragraph>Установите «Груминг» на главный экран. Приложение открывает ваш кабинет и расписание.</Typography.Paragraph>
    <Space wrap><Button icon={<DownloadOutlined />} disabled={installed} onClick={async () => { const prompt = installPrompt || pendingInstallPrompt; if (!prompt) { setHint(true); return; } await prompt.prompt(); await prompt.userChoice; pendingInstallPrompt = undefined; setInstallPrompt(undefined); }}>{installed ? 'Приложение установлено' : 'Установить приложение'}</Button><Tag color={linked && permission === 'granted' ? 'green' : undefined}>{linked && permission === 'granted' ? 'Push подключён' : 'Push не подключён'}</Tag></Space>
    {(hint || (ios && !installed)) && <Alert type="info" showIcon message={ios ? 'Установка на iPhone или iPad' : 'Установка из браузера'} description={ios ? 'В Safari откройте «Поделиться» → «На экран Домой». Откройте приложение с новой иконки, войдите и включите уведомления.' : 'В меню браузера выберите «Установить приложение» или «Добавить на главный экран». Если пункта нет, откройте ссылку в Chrome, Edge или Safari.'} />}
    {(!supported || !config.data?.available || (ios && !installed)) && <Typography.Paragraph type="secondary">{!window.isSecureContext ? 'Для уведомлений нужен защищённый адрес HTTPS.' : ios && !installed ? 'На iPhone push включается после установки на главный экран.' : !supported ? 'Этот браузер не поддерживает push. Список событий в кабинете доступен.' : config.isLoading ? 'Проверяем подключение уведомлений…' : 'Уведомления на телефон ещё не настроены на сервере. События уже сохраняются в кабинете.'}</Typography.Paragraph>}
    {permission === 'denied' && <Alert type="warning" message="Уведомления запрещены в настройках браузера" description="Разрешите их для этого сайта и откройте кабинет снова." />}
    {(deviceError || config.isError) && <Alert type="error" showIcon message={deviceError || getErrorMessage(config.error)} />}
    <Space wrap><Button type="primary" icon={<BellOutlined />} disabled={!supported || !config.data?.available || (ios && !installed) || permission === 'denied' || linked} loading={connect.isPending} onClick={() => connect.mutate(Notification.requestPermission())}>Включить уведомления</Button>{linked && <><Button loading={test.isPending} onClick={() => test.mutate()}>Отправить проверку</Button><Button loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Отключить на устройстве</Button></>}</Space>
    <Typography.Text type="secondary">Новая запись, перенос и отмена поступают назначенному грумеру и администратору. Подробности доступны после входа. MAX работает параллельно.</Typography.Text>
  </Space></Card>;
}

export function GroomingInbox({ actorId }: { actorId: string }) {
  const query = useGroomingInbox(actorId), client = useQueryClient(), navigate = useNavigate(), { message } = App.useApp();
  const read = useMutation({ mutationFn: (id?: string) => apiRequest(`${base}/inbox/${id ? `${encodeURIComponent(id)}/read` : 'read-all'}`, { method: 'POST' }), onSuccess: () => client.invalidateQueries({ queryKey: ['grooming', actorId, 'staff-inbox'] }), onError: error => message.error(getErrorMessage(error)) });
  return <Card title="Мои уведомления" extra={<Button disabled={!query.data?.unread} loading={read.isPending} onClick={() => read.mutate(undefined)}>Прочитать все</Button>} loading={query.isLoading}>
    {query.isError && <Alert type="error" message={getErrorMessage(query.error)} action={<Button onClick={() => void query.refetch()}>Повторить</Button>} />}
    {!query.isError && !query.isLoading && !query.data?.items.length && <Empty description="Новая запись, перенос или отмена появятся здесь" />}
    <div className="grooming-inbox">{query.data?.items.map(item => <article key={item.id} className={!item.readAt && !item.supersededAt ? 'grooming-notice-unread' : ''}><div><Space wrap><strong>{item.title}</strong>{!item.readAt && !item.supersededAt && <Tag color="blue">Новое</Tag>}{item.supersededAt && <Tag>Запись изменилась</Tag>}</Space><p>{item.body}</p><Typography.Text type="secondary">{at(item.createdAt)}</Typography.Text></div><Space wrap><Button onClick={async () => { await read.mutateAsync(item.id); navigate(item.href); }}>Открыть</Button>{!item.readAt && <Button type="text" onClick={() => read.mutate(item.id)}>Прочитано</Button>}</Space></article>)}</div>
  </Card>;
}
