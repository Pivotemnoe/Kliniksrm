import {
  CalendarOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  SwapOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Avatar, Badge, Button, ConfigProvider, Drawer, Dropdown, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { appConfig, isDemoAuthMode } from '../app/config';
import { hasPermission } from '../auth/permissions';
import { useCurrentEmployee, useLogoutMutation } from '../auth/useAuth';
import { RouteLoadBoundary } from '../app/RouteLoadBoundary';
import { listInternalMessageConversations } from '../features/internalMessages/internalMessages.api';
import { StaffAlertsPopover } from '../features/staffAlerts/StaffAlertsPopover';
import { flushQueuedReplies, readQueuedReplies, subscribeQueuedReplies } from '../features/onlineRequests/conversationOutbox';
import { getEmployeeDefaultRoute } from '../shared/routes/defaultRoutes';
import { GlobalSearch } from './GlobalSearch';
import { IncomingRequestAlert } from './IncomingRequestAlert';
import { GlobalOperationalAlerts } from './GlobalOperationalAlerts';
import { getAccessibleMenuItems, getSelectedMenuKey } from './menu';
import { useActivityTracking } from './useActivityTracking';
import { useLiveUpdates } from './useLiveUpdates';

const { Header, Sider, Content } = Layout;

const roleLabels: Record<string, string> = {
  director: 'Директор',
  administrator: 'Администратор',
  doctor: 'Врач',
  assistant: 'Ассистент',
  cashier: 'Кассир',
  stock: 'Склад',
};

export function CrmLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(() => {
    try { const saved = localStorage.getItem('crm-navigation-collapsed'); if (saved !== null) return saved === '1'; } catch {}
    return window.innerWidth < 1280;
  });
  const [pendingReplies, setPendingReplies] = useState(0);
  const { data } = useCurrentEmployee();
  const logoutMutation = useLogoutMutation();
  const employee = data?.employee;
  const accessibleMenuItems = useMemo(() => getAccessibleMenuItems(employee), [employee]);
  useActivityTracking(Boolean(employee));
  useLiveUpdates(Boolean(employee), queryClient);
  const selectedKey = useMemo(() => getSelectedMenuKey(location.pathname), [location.pathname]);
  const primaryRole = employee?.roles[0];
  const primaryRoleLabel = primaryRole ? roleLabels[primaryRole] ?? primaryRole : 'Сотрудник';
  const employeePosition = employee?.position || primaryRoleLabel;
  const employeeInitial = employee?.fullName?.trim().slice(0, 1);
  const canOpenSeparateLocalLogin = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  const canReadOnlineRequests = Boolean(employee && (employee.roles.includes('administrator') || employee.roles.includes('director')) && hasPermission(employee, 'appointments.read'));
  useEffect(() => {
    if (!canReadOnlineRequests || !employee?.id) { setPendingReplies(0); return undefined; }
    const employeeId = employee.id;
    let mounted = true;
    const updateCount = () => setPendingReplies(readQueuedReplies(employeeId).length);
    updateCount();
    const flush = () => void flushQueuedReplies(employeeId, () => {
      if (!mounted) return;
      void queryClient.invalidateQueries({ queryKey: ['online-request-conversation'] });
      void queryClient.invalidateQueries({ queryKey: ['online-request-conversation-jobs'] });
    });
    flush();
    const timer = window.setInterval(flush, 15_000);
    window.addEventListener('focus', flush);
    window.addEventListener('online', flush);
    const unsubscribe = subscribeQueuedReplies(() => { updateCount(); flush(); });
    return () => { mounted = false; window.clearInterval(timer); window.removeEventListener('focus', flush); window.removeEventListener('online', flush); unsubscribe(); };
  }, [canReadOnlineRequests, employee?.id, queryClient]);
  const canReadBusiness = hasPermission(employee, 'business.read');
  const canReadFinanceSettings = hasPermission(employee, 'settings.read');
  const internalMessagesQuery = useQuery({
    queryKey: ['internal-messages', 'conversations'],
    queryFn: listInternalMessageConversations,
    refetchInterval: 15_000,
  });
  const employeeMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Профиль и смена пароля',
      onClick: () => navigate('/profile'),
    },
    ...(canOpenSeparateLocalLogin
      ? [
          {
            key: 'separate-login',
            icon: <SwapOutlined />,
            label: 'Вход другого сотрудника в новом окне',
            onClick: () => {
              window.open(getSeparateLocalLoginUrl(), '_blank', 'noopener,noreferrer');
            },
          },
        ]
      : []),
    ...(!isDemoAuthMode
      ? [
          {
            key: 'switch',
            icon: <SwapOutlined />,
            label: 'Сменить сотрудника',
            onClick: () => logoutMutation.mutate(),
          },
          {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Выйти',
            onClick: () => logoutMutation.mutate(),
          },
        ]
      : []),
  ];

  useEffect(() => {
    setMobileNavigationOpen(false);
    document.querySelector<HTMLElement>('.crm-content')?.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);

  function navigateFromShell(path: string) {
    setMobileNavigationOpen(false);
    navigate(path);
  }

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#0868df', borderRadius: 10, colorBgLayout: '#f4f8fd' } }}>
    <Layout className={`crm-shell ${navigationCollapsed ? 'navigation-collapsed' : 'navigation-expanded'}`}>
      <Sider width={224} collapsedWidth={72} collapsed={navigationCollapsed} className="crm-sider">
        <button className="brand" type="button" onClick={() => navigate(getEmployeeDefaultRoute(employee))} aria-label={appConfig.brandName}>
          <img src={appConfig.logoUrl} alt={`${appConfig.brandName} logo`} className="brand-logo" />
          {!navigationCollapsed ? <span className="navigation-brand-copy"><strong>Temichev<span>VET</span></strong><small>Рабочее пространство</small></span> : null}
        </button>
        <Menu
          theme="light"
          mode="inline"
          inlineCollapsed={navigationCollapsed}
          selectedKeys={[selectedKey]}
          items={accessibleMenuItems}
          onClick={({ key }) => {
            const path = String(key);
            if (path.startsWith('/')) {
              navigate(path);
            }
          }}
        />
        <Button type="text" className="crm-navigation-toggle" icon={navigationCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          aria-label={navigationCollapsed ? 'Развернуть меню разделов' : 'Свернуть меню разделов'} onClick={() => {
            setNavigationCollapsed(current => { try { localStorage.setItem('crm-navigation-collapsed', current ? '0' : '1'); } catch {} return !current; });
          }}>{navigationCollapsed ? null : 'Свернуть меню'}</Button>
      </Sider>
      <Layout>
        <Header className="crm-header">
          <span className="crm-header-wordmark" aria-hidden="true">Temichev<span>VET</span></span>
          <div className="mobile-header-navigation">
            <Button
              type="text"
              shape="circle"
              className="mobile-nav-trigger"
              icon={<MenuOutlined />}
              aria-label="Открыть меню разделов"
              onClick={() => setMobileNavigationOpen(true)}
            />
            <button
              className="mobile-brand-button"
              type="button"
              onClick={() => navigateFromShell(getEmployeeDefaultRoute(employee))}
              aria-label={`Открыть главную ${appConfig.brandName}`}
            >
              <img src={appConfig.logoUrl} alt="" className="mobile-brand-logo" />
              <span>{appConfig.brandName}</span>
            </button>
          </div>
          <GlobalSearch />
          <Space size={12} className="header-actions">
            <span className="header-action header-action-messages">
              <Tooltip title="Сообщения сотрудникам">
                <Badge count={internalMessagesQuery.data?.totalUnread || undefined} size="small">
                  <Button
                    type="text"
                    shape="circle"
                    icon={<MessageOutlined />}
                    aria-label="Сообщения сотрудникам"
                    onClick={() => navigate('/staff-messages')}
                  />
                </Badge>
              </Tooltip>
            </span>
            {canReadOnlineRequests ? (
              <span className="header-action header-action-requests">
                <Tooltip title="Заявки клиентов на приём">
                  <Button
                    type="text"
                    shape="circle"
                    icon={<CalendarOutlined />}
                    aria-label="Заявки на приём"
                    onClick={() => navigate('/online-requests')}
                  />
                </Tooltip>
              </span>
            ) : null}
            <span className="header-action header-action-alerts">
              <StaffAlertsPopover unreadMessages={internalMessagesQuery.data?.totalUnread ?? 0} open={alertsOpen} onOpenChange={setAlertsOpen} />
            </span>
            {canReadBusiness || canReadFinanceSettings ? (
              <span className="header-action header-action-finance">
                <Tooltip title={canReadBusiness ? 'Финансы и отчётность клиники: прибыль, расходы и движение денег' : 'Финансовые настройки'}>
                  <Button
                    type="text"
                    icon={<WalletOutlined />}
                    onClick={() => navigate(canReadBusiness ? '/business' : '/settings/finance')}
                  >
                    {canReadBusiness ? 'Бизнес' : 'Финансы'}
                  </Button>
                </Tooltip>
              </span>
            ) : null}
            <Dropdown menu={{ items: employeeMenuItems }} trigger={['click']} placement="bottomRight">
              <button className="employee-menu-button" type="button" aria-label="Меню текущего сотрудника">
                <span className="employee-block">
                  <Typography.Text strong className="employee-name">
                    {employee?.fullName ?? 'Сотрудник'}
                  </Typography.Text>
                  <span className="employee-position">
                    {employeePosition}
                    {isDemoAuthMode ? ' · тестовый режим' : ''}
                  </span>
                </span>
                <Avatar icon={employeeInitial ? undefined : <UserOutlined />}>{employeeInitial}</Avatar>
                <DownOutlined className="employee-menu-icon" />
              </button>
            </Dropdown>
          </Space>
        </Header>
        <Content className="crm-content">
          {pendingReplies > 0 ? <Alert type="warning" showIcon className="form-alert"
            message={`Ответы клиентам ожидают отправки: ${pendingReplies}`}
            description="CRM повторит отправку при восстановлении связи. Не закрывайте эту вкладку, пока ответы не исчезнут из очереди."
            action={<Button size="small" onClick={() => navigate('/online-requests')}>Открыть заявки</Button>} /> : null}
          <IncomingRequestAlert enabled={Boolean(employee &&
            (employee.roles.includes('administrator') || employee.roles.includes('director')) &&
            hasPermission(employee, 'appointments.manage') &&
            (data?.accessType !== 'REMOTE' || employee.roles.includes('director')))} />
          <GlobalOperationalAlerts
            onOpenAlerts={() => setAlertsOpen(true)}
            clinicalOnly={Boolean(employee?.roles.includes('doctor') && !employee?.roles.includes('director') && !employee?.roles.includes('administrator'))}
            internalMessages={internalMessagesQuery.data}
            remoteAccessMode={data?.accessType === 'REMOTE'
              ? employee?.roles.includes('director') ? 'director' : 'read-only'
              : null}
          />
          <RouteLoadBoundary resetKey={location.pathname + location.search}>
            <Outlet />
          </RouteLoadBoundary>
        </Content>
      </Layout>
      <Drawer
        title={(
          <span className="mobile-navigation-title">
            <img src={appConfig.logoUrl} alt="" />
            <span>{appConfig.brandName}</span>
          </span>
        )}
        placement="left"
        width={340}
        open={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        className="mobile-navigation-drawer"
      >
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={accessibleMenuItems}
          onClick={({ key }) => {
            const path = String(key);
            if (path.startsWith('/')) navigateFromShell(path);
          }}
        />
        <div className="mobile-navigation-quick-actions">
          <Typography.Text type="secondary">Быстрые действия</Typography.Text>
          <Button icon={<MessageOutlined />} onClick={() => navigateFromShell('/staff-messages')}>
            Сообщения сотрудникам
            {internalMessagesQuery.data?.totalUnread ? ` (${internalMessagesQuery.data.totalUnread})` : ''}
          </Button>
          {canReadOnlineRequests ? (
            <Button icon={<CalendarOutlined />} onClick={() => navigateFromShell('/online-requests')}>
              Заявки на приём
            </Button>
          ) : null}
          {canReadBusiness || canReadFinanceSettings ? (
            <Button icon={<WalletOutlined />} onClick={() => navigateFromShell(canReadBusiness ? '/business' : '/settings/finance')}>
              {canReadBusiness ? 'Бизнес' : 'Финансы'}
            </Button>
          ) : null}
          <Button icon={<UserOutlined />} onClick={() => navigateFromShell('/profile')}>
            Профиль и смена пароля
          </Button>
        </div>
      </Drawer>
    </Layout>
    </ConfigProvider>
  );
}

function getSeparateLocalLoginUrl() {
  const { protocol, hostname, port } = window.location;
  const targetHost = hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
  return `${protocol}//${targetHost}${port ? `:${port}` : ''}/login?force=1&separate=1`;
}
