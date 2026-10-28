import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Space } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useChangePasswordMutation, useLogoutMutation } from '../../auth/useAuth';
import { apiRequest } from '../../api/client';
import { ApiError, getErrorMessage } from '../../api/errors';
import { canUseWorker, keyBytes, staffWorker, type InstallPrompt } from './staffPlatform';
import { staffAppBase } from './staffApp.api';

export function Account() {
  const logout = useLogoutMutation('/login');
  return <Button icon={<LogoutOutlined />} loading={logout.isPending} onClick={() => { navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_STAFF_APP_NOTIFICATIONS' }); logout.mutate(); }}>Выйти из приложения</Button>;
}
export function PasswordForm({ first = false }: { first?: boolean }) {
  const change = useChangePasswordMutation(), { message } = App.useApp(), [form] = Form.useForm();
  return <div className="staff-card"><h2>{first ? 'Задайте свой пароль' : 'Сменить пароль'}</h2><Form form={form} layout="vertical" onFinish={async values => { try { await change.mutateAsync(values); form.resetFields(); message.success('Пароль изменён'); } catch (error) { message.error(getErrorMessage(error)); } }}>
    <Form.Item name="currentPassword" label="Текущий пароль" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
    <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true, min: 8 }]}><Input.Password autoComplete="new-password" /></Form.Item>
    <Button htmlType="submit" loading={change.isPending}>Сохранить пароль</Button></Form></div>;
}
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null), [installed, setInstalled] = useState(false);
  useEffect(() => {
    const update = () => setInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    update(); window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', update);
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', update); };
  }, []);
  if (installed) return null;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return <div className="staff-card"><h2>На главный экран</h2><p>{ios ? 'В Safari откройте «Поделиться» → «На экран Домой».' : 'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».'}</p>
    {prompt && <Button onClick={async () => { await prompt.prompt(); setPrompt(null); }}>Установить приложение</Button>}</div>;
}
export function PushSetup() {
  const { message } = App.useApp(), [connected, setConnected] = useState(false);
  const supported = canUseWorker() && 'PushManager' in window && 'Notification' in window;
  const config = useQuery({ queryKey: ['staff-app', 'push-config'], queryFn: () => apiRequest<{ available: boolean; publicKey: string | null; devices: { endpoint: string }[] }>(`${staffAppBase}/push/config`), enabled: supported });
  useEffect(() => { if (supported) void staffWorker().then(worker => worker.pushManager.getSubscription()).then(subscription => setConnected(Boolean(subscription && config.data?.devices.some(device => device.endpoint === subscription.endpoint)))).catch(() => undefined); }, [supported, config.data]);
  const change = useMutation({ networkMode: 'always', retry: false, mutationFn: async (enable: boolean) => {
    if (!navigator.onLine) throw new Error('Сначала подключитесь к сети');
    await staffWorker();
    const worker = await navigator.serviceWorker.ready;
    const existing = await worker.pushManager.getSubscription();
    if (!enable) { if (existing) { await apiRequest(`${staffAppBase}/push/unsubscribe`, { method: 'POST', body: { endpoint: existing.endpoint } }); await existing.unsubscribe(); } setConnected(false); return; }
    if (!config.data?.available || !config.data.publicKey) throw new Error('Отправка уведомлений ещё не включена в CRM');
    if (await Notification.requestPermission() !== 'granted') throw new Error('Разрешите уведомления в настройках телефона');
    let subscription = existing || await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.data.publicKey) });
    const register = () => { const data = subscription.toJSON(); return apiRequest(`${staffAppBase}/push/subscribe`, { method: 'POST', body: { endpoint: subscription.endpoint, p256dh: data.keys?.p256dh, auth: data.keys?.auth } }); };
    try { await register(); } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      await subscription.unsubscribe(); subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.data.publicKey) }); await register();
    }
    await config.refetch(); setConnected(true);
  }, onError: error => message.error(getErrorMessage(error)) });
  return <div className="staff-card"><h2>Уведомления на телефоне</h2><p>Новые записи, переносы и отмены. Подробности клиента видны только после входа.</p>
    {config.isError && <Alert type="error" message={getErrorMessage(config.error)} />}
    {!supported ? <Alert type="info" message="Уведомления недоступны в этом браузере. На iPhone сначала добавьте приложение на экран Домой." />
      : config.data && !config.data.available ? <Alert type="info" message="Отправка на телефон ещё не настроена в CRM. Уведомления внутри приложения доступны." />
        : <Space><Button loading={change.isPending} disabled={!connected && !config.data?.available} onClick={() => change.mutate(!connected)}>{connected ? 'Отключить на этом телефоне' : 'Включить на этом телефоне'}</Button></Space>}
  </div>;
}
