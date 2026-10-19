import '@ant-design/v5-patch-for-react-19';
import 'antd/dist/reset.css';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, Alert, Avatar, Button, ConfigProvider, Form, Input, Layout, Menu, Space, Typography } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarOutlined, LogoutOutlined, MobileOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
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
import './styles.css';
import './visual-redesign.css';
import './features/grooming/standalone.css';

function GroomingLogin() {
  const login = useLoginMutation(), { data } = useCurrentEmployee(), navigate = useNavigate();
  const location = useLocation(), from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const destination = from?.pathname?.startsWith('/grooming/') ? `${from.pathname}${from.search || ''}` : '/grooming/calendar';
  if (data?.employee) return <Navigate to="/grooming/calendar" replace />;
  return <main className="grooming-login"><section><img src="/brand/temichevvet-logo.jpg" width="90" alt="TemichevVet" /><Typography.Text className="grooming-login-eyebrow">Самостоятельный модуль</Typography.Text><h1>Груминг</h1><p>Расписание команды, записи и забота о питомцах.</p></section><Form layout="vertical" onFinish={async values => { await login.mutateAsync(values); navigate(destination); }}><h2>Вход сотрудника</h2><Form.Item name="login" label="Телефон или email" rules={[{ required: true }]}><Input autoComplete="username" /></Form.Item><Form.Item name="password" label="Пароль" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>{login.isError && <Alert className="grooming-banner" type="error" message={getErrorMessage(login.error)} />}<Button htmlType="submit" type="primary" loading={login.isPending} block>Войти</Button></Form></main>;
}
function GroomingLayout() {
  const { data } = useCurrentEmployee(), logout = useLogoutMutation('/grooming/login'), navigate = useNavigate(), location = useLocation();
  const employee = data?.employee;
  return <Layout className="grooming-standalone"><Layout.Sider breakpoint="lg" collapsedWidth={0} theme="light" width={230}><div className="grooming-standalone-brand"><img src="/brand/temichevvet-logo.jpg" width="50" alt="" /><div><strong>TemichevVet</strong><small>Груминг</small></div></div><Menu mode="inline" selectedKeys={[location.pathname.startsWith('/settings') ? location.pathname : location.pathname.startsWith('/grooming/profile') ? '/grooming/profile' : '/grooming']} onClick={({ key }) => navigate(key)} items={[{ key: '/grooming', label: 'Груминг', icon: <CalendarOutlined /> }, ...(employee?.roles.includes('director') ? [{ key: '/grooming/admin/modules', label: 'Подключение модуля', icon: <SettingOutlined /> }] : []), ...(employee?.permissions.includes('remote_access.read') ? [{ key: '/grooming/admin/remote-access', label: 'Доступ с телефона', icon: <MobileOutlined /> }] : []), { key: '/grooming/profile', label: 'Мой профиль', icon: <UserOutlined /> }]} /><div className="grooming-standalone-sidebar-note">Собственное расписание<br />и рабочее пространство</div></Layout.Sider><Layout><Layout.Header className="grooming-standalone-header"><span>Уход за питомцами</span><Space><Avatar>{employee?.fullName.slice(0, 1)}</Avatar><Typography.Text>{employee?.fullName}</Typography.Text><Button type="text" icon={<LogoutOutlined />} onClick={() => { navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_GROOMING_NOTIFICATIONS' }); logout.mutate(); }}>Выйти</Button></Space></Layout.Header><Layout.Content>{import.meta.env.VITE_GROOMING_QA === 'true' && <Alert type="info" banner message={import.meta.env.VITE_GROOMING_QA_TRANSPORT === 'device' ? 'Проверка на телефоне · вымышленные данные · тестовые сообщения MAX' : 'Локальная проверка · вымышленные данные · MAX перехвачен'} />}<Outlet /></Layout.Content></Layout></Layout>;
}
function GroomingStandalone() {
  return <ConfigProvider locale={ruRU} theme={{ token: { colorPrimary: '#2563eb', borderRadius: 14 }, components: { Layout: { bodyBg: '#f3f5f8', headerBg: '#fff', siderBg: '#fff' } } }}><AntApp><QueryClientProvider client={queryClient}><RouteLoadBoundary fullScreen><BrowserRouter><Routes><Route path="/grooming/login" element={<GroomingLogin />} /><Route path="/remote/enroll" element={<RemoteAccessEnrollmentPage grooming />} /><Route element={<ProtectedRoute loginPath="/grooming/login" profilePath="/grooming/profile" />}><Route element={<GroomingLayout />}><Route path="/grooming/*" element={<GroomingPage />} /><Route path="/grooming/admin/modules" element={<ClinicModulesPage />} /><Route path="/grooming/profile" element={<ProfilePage />} /><Route path="/grooming/admin/remote-access" element={<RemoteAccessSettingsPage />} /><Route path="*" element={<Navigate to="/grooming/calendar" replace />} /></Route></Route></Routes></BrowserRouter></RouteLoadBoundary></QueryClientProvider></AntApp></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<GroomingStandalone />);
