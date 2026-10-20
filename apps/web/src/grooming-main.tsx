import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, Alert, Avatar, Badge, Button, ConfigProvider, Drawer, Dropdown, Form, Input, Layout, Menu, Typography } from 'antd';
import type { MenuProps } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BellOutlined, CalendarOutlined, DownOutlined, LogoutOutlined, MenuOutlined, MobileOutlined, OrderedListOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { queryClient } from './app/queryClient';
import { ProtectedRoute } from './app/ProtectedRoute';
import { RouteLoadBoundary } from './app/RouteLoadBoundary';
import { useCurrentEmployee, useLoginMutation, useLogoutMutation } from './auth/useAuth';
import { getErrorMessage } from './api/errors';
import { GroomingPage } from './features/grooming/GroomingPage';
import { ClinicModulesPage } from './features/clinicModules/ClinicModulesPage';
import { ProfilePage } from './pages/ProfilePage';
import { RemoteAccessEnrollmentPage } from './features/remoteAccess/RemoteAccessEnrollmentPage';
import { RemoteAccessSettingsPage } from './features/remoteAccess/RemoteAccessSettingsPage';
import { useGroomingInbox } from './features/grooming/GroomingNotifications';
import { crmTheme } from './shared/theme/crmTheme';
import './styles.css';
import './visual-redesign.css';
import './features/grooming/standalone.css';

function GroomingLogin() {
  const login = useLoginMutation(), { data } = useCurrentEmployee(), navigate = useNavigate();
  const location = useLocation(), from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const destination = from?.pathname?.startsWith('/grooming/') ? `${from.pathname}${from.search || ''}` : '/grooming/calendar';
  if (data?.employee) return <Navigate to="/grooming/calendar" replace />;
  return <main className="crm-shell grooming-login"><section><img src="/brand/temichevvet-logo.jpg" width="90" alt="TemichevVet" /><Typography.Text className="grooming-login-eyebrow">Кабинет грумера</Typography.Text><h1>Груминг</h1><p>Расписание команды, записи и забота о питомцах.</p></section><Form layout="vertical" onFinish={async values => { await login.mutateAsync(values); navigate(destination); }}><h2>Вход сотрудника</h2><Form.Item name="login" label="Телефон или email" rules={[{ required: true }]}><Input autoComplete="username" /></Form.Item><Form.Item name="password" label="Пароль" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>{login.isError && <Alert className="grooming-banner" type="error" message={getErrorMessage(login.error)} />}<Button htmlType="submit" type="primary" loading={login.isPending} block>Войти</Button></Form></main>;
}
function GroomingLayout() {
  const { data } = useCurrentEmployee(), logout = useLogoutMutation('/grooming/login'), navigate = useNavigate(), location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const employee = data!.employee;
  const inbox = useGroomingInbox(employee.id);
  const selectedKey = location.pathname.startsWith('/grooming/bookings/') ? '/grooming/bookings' : location.pathname;
  const items: MenuProps['items'] = [
    { key: '/grooming/calendar', label: 'Календарь', icon: <CalendarOutlined /> },
    { key: '/grooming/bookings', label: 'Записи', icon: <OrderedListOutlined /> },
    { key: '/grooming/notifications', label: 'Оповещения', icon: <BellOutlined /> },
    ...(employee.roles.includes('director') ? [{ key: '/grooming/admin/modules', label: 'Подключение модуля', icon: <SettingOutlined /> }] : []),
    ...(employee.permissions.includes('remote_access.read') ? [{ key: '/grooming/admin/remote-access', label: 'Доступ с телефона', icon: <MobileOutlined /> }] : []),
    { key: '/grooming/profile', label: 'Мой профиль', icon: <UserOutlined /> },
  ];
  function go(path: string) { setNavigationOpen(false); navigate(path); }
  const navigation = <div className="crm-sider grooming-side-body"><button className="brand" onClick={() => go('/grooming/calendar')} aria-label="Календарь груминга"><img className="brand-logo" src="/brand/temichevvet-logo.jpg" alt="TemichevVet" /><span className="navigation-brand-copy"><strong>Temichev<span>VET</span></strong><small>Кабинет грумера</small></span></button><Menu mode="inline" selectedKeys={[selectedKey]} items={items} onClick={({ key }) => go(key)} /><p className="grooming-standalone-sidebar-note">Ваши записи, расписание<br />и оповещения</p></div>;
  return <Layout className="crm-shell navigation-expanded grooming-standalone">
    <Layout.Sider className="grooming-desktop-sider" width={224} theme="light">{navigation}</Layout.Sider>
    <Drawer className="grooming-nav-drawer" rootClassName="crm-shell grooming-nav-root" title="Груминг" placement="left" width="min(300px, 90vw)" open={navigationOpen} onClose={() => setNavigationOpen(false)} styles={{ body: { padding: 0 } }}>{navigation}</Drawer>
    <Layout>
      <Layout.Header className="crm-header grooming-standalone-header">
        <Button className="grooming-navigation-open" type="text" icon={<MenuOutlined />} aria-label="Открыть меню груминга" onClick={() => setNavigationOpen(true)} />
        <span className="grooming-header-caption">Кабинет грумера</span>
        <div className="grooming-header-actions">
          <Badge count={inbox.data?.unread || 0} size="small"><Button type="text" icon={<BellOutlined />} aria-label="Оповещения груминга" onClick={() => go('/grooming/notifications')} /></Badge>
          <Dropdown trigger={['click']} menu={{ items: [
            { key: 'profile', label: 'Мой профиль', icon: <UserOutlined />, onClick: () => go('/grooming/profile') },
            { key: 'logout', label: 'Выйти', icon: <LogoutOutlined />, disabled: logout.isPending, onClick: () => { navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_GROOMING_NOTIFICATIONS' }); logout.mutate(); } },
          ] }}><Button type="text" className="employee-menu-button grooming-employee-button" aria-label="Меню сотрудника"><Avatar>{employee.fullName.slice(0, 1)}</Avatar><span className="grooming-employee-copy"><strong>{employee.fullName}</strong><small>{employee.roles.includes('director') ? 'Директор' : employee.roles.includes('administrator') ? 'Администратор' : employee.roles.includes('groomer') ? 'Грумер' : 'Сотрудник'}</small></span><DownOutlined /></Button></Dropdown>
        </div>
      </Layout.Header>
      <Layout.Content className="crm-content">{import.meta.env.VITE_GROOMING_QA === 'true' && <Alert type="info" banner message={import.meta.env.VITE_GROOMING_QA_TRANSPORT === 'device' ? 'Проверка на телефоне · вымышленные данные · тестовые сообщения MAX' : 'Локальная проверка · вымышленные данные · MAX перехвачен'} />}<Outlet /></Layout.Content>
    </Layout>
  </Layout>;
}
function GroomingStandalone() {
  return <ConfigProvider locale={ruRU} theme={crmTheme}><AntApp><QueryClientProvider client={queryClient}><RouteLoadBoundary fullScreen><BrowserRouter><Routes><Route path="/grooming/login" element={<GroomingLogin />} /><Route path="/grooming/remote/enroll" element={<RemoteAccessEnrollmentPage grooming loginPath="/grooming/login" />} /><Route path="/remote/enroll" element={<RemoteAccessEnrollmentPage grooming loginPath="/grooming/login" />} /><Route element={<ProtectedRoute loginPath="/grooming/login" profilePath="/grooming/profile" />}><Route element={<GroomingLayout />}><Route path="/grooming/*" element={<GroomingPage standalone />} /><Route path="/grooming/admin/modules" element={<ClinicModulesPage />} /><Route path="/grooming/profile" element={<ProfilePage />} /><Route path="/grooming/admin/remote-access" element={<RemoteAccessSettingsPage />} /><Route path="*" element={<Navigate to="/grooming/calendar" replace />} /></Route></Route></Routes></BrowserRouter></RouteLoadBoundary></QueryClientProvider></AntApp></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<GroomingStandalone />);
