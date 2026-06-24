import {
  BellOutlined,
  CalendarOutlined,
  DownOutlined,
  LogoutOutlined,
  MessageOutlined,
  SwapOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import { useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { appConfig, isDemoAuthMode } from '../app/config';
import { hasPermission } from '../auth/permissions';
import { useCurrentEmployee, useLogoutMutation } from '../auth/useAuth';
import { listBillAlerts } from '../features/billing/billing.api';
import { listNewsPosts } from '../features/news/news.api';
import { listNotificationOutbox } from '../features/notifications/notifications.api';
import { listOnlineRequests } from '../features/onlineRequests/onlineRequests.api';
import { listStockAlerts } from '../features/stock/stock.api';
import { getEmployeeDefaultRoute } from '../shared/routes/defaultRoutes';
import { formatMoney } from '../shared/utils/money';
import { GlobalSearch } from './GlobalSearch';
import { getSelectedMenuKey, menuItems } from './menu';
import { useActivityTracking } from './useActivityTracking';

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
  const { data } = useCurrentEmployee();
  const logoutMutation = useLogoutMutation();
  const employee = data?.employee;
  useActivityTracking(Boolean(employee));
  const selectedKey = useMemo(() => getSelectedMenuKey(location.pathname), [location.pathname]);
  const primaryRole = employee?.roles[0];
  const primaryRoleLabel = primaryRole ? roleLabels[primaryRole] ?? primaryRole : 'Сотрудник';
  const employeePosition = employee?.position || primaryRoleLabel;
  const employeeInitial = employee?.fullName?.trim().slice(0, 1);
  const canOpenSeparateLocalLogin = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  const canReadNews = hasPermission(employee, 'news.read');
  const canReadNotifications = hasPermission(employee, 'notifications.read');
  const canReadOnlineRequests = hasPermission(employee, 'appointments.read');
  const canReadStock = hasPermission(employee, 'stock.read');
  const canReadBilling = hasPermission(employee, 'billing.read');
  const unreadNewsQuery = useQuery({
    queryKey: ['news', 'header-unread'],
    queryFn: () => listNewsPosts({ unreadOnly: true, limit: 1, offset: 0 }),
    enabled: canReadNews,
    refetchInterval: 60_000,
  });
  const failedNotificationsQuery = useQuery({
    queryKey: ['notifications', 'outbox', 'header-failed'],
    queryFn: () => listNotificationOutbox({ status: 'FAILED', limit: 1, offset: 0 }),
    enabled: canReadNotifications,
    refetchInterval: 60_000,
  });
  const newOnlineRequestsQuery = useQuery({
    queryKey: ['online-requests', 'header-new'],
    queryFn: () => listOnlineRequests({ status: 'NEW', limit: 1, offset: 0 }),
    enabled: canReadOnlineRequests,
    refetchInterval: 60_000,
  });
  const stockAlertsQuery = useQuery({
    queryKey: ['stock', 'alerts', 'header-low-stock'],
    queryFn: () => listStockAlerts({ limit: 1, offset: 0 }),
    enabled: canReadStock,
    refetchInterval: 60_000,
  });
  const billAlertsQuery = useQuery({
    queryKey: ['bills', 'alerts', 'header-debt'],
    queryFn: () => listBillAlerts({ limit: 1, offset: 0 }),
    enabled: canReadBilling,
    refetchInterval: 60_000,
  });
  const unreadNewsCount = unreadNewsQuery.data?.total ?? 0;
  const failedNotificationsCount = failedNotificationsQuery.data?.total ?? 0;
  const newOnlineRequestsCount = newOnlineRequestsQuery.data?.total ?? 0;
  const lowStockCount = stockAlertsQuery.data?.total ?? 0;
  const debtBillCount = billAlertsQuery.data?.total ?? 0;
  const debtTotal = billAlertsQuery.data?.totalDebt;
  const overdueBillCount = billAlertsQuery.data?.overdueTotal ?? 0;
  const overdueDebt = billAlertsQuery.data?.overdueDebt;
  const headerAlertCount = unreadNewsCount + failedNotificationsCount + newOnlineRequestsCount + lowStockCount + debtBillCount;
  const headerAlertTarget =
    failedNotificationsCount && canReadNotifications
      ? '/messages'
        : newOnlineRequestsCount && canReadOnlineRequests
          ? '/online-requests'
        : debtBillCount && canReadBilling
          ? '/bills?debtOnly=true'
          : lowStockCount && canReadStock
            ? '/stock'
            : unreadNewsCount && canReadNews
              ? '/news'
              : canReadNotifications
                ? '/messages'
                : canReadOnlineRequests
                  ? '/online-requests'
                  : canReadBilling
                    ? '/bills?debtOnly=true'
                    : canReadNews
                      ? '/news'
                      : canReadStock
                        ? '/stock'
                        : '/profile';
  const headerAlertTooltip = headerAlertCount
    ? `Непрочитанные новости: ${unreadNewsCount}. Ошибки отправки: ${failedNotificationsCount}. Новые заявки: ${newOnlineRequestsCount}. Счета с долгом: ${debtBillCount}${debtTotal ? `, ${formatMoney(debtTotal)}` : ''}. Просрочено: ${overdueBillCount}${overdueDebt ? `, ${formatMoney(overdueDebt)}` : ''}. Низкий остаток: ${lowStockCount}.`
    : 'Уведомления';
  const employeeMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Профиль сотрудника',
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

  return (
    <Layout className="crm-shell">
      <Sider width={72} collapsedWidth={72} collapsed className="crm-sider">
        <button className="brand" type="button" onClick={() => navigate(getEmployeeDefaultRoute(employee))} aria-label={appConfig.brandName}>
          <img src={appConfig.logoUrl} alt={`${appConfig.brandName} logo`} className="brand-logo" />
        </button>
        <Menu
          theme="light"
          mode="inline"
          inlineCollapsed
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => {
            const path = String(key);
            if (path.startsWith('/')) {
              navigate(path);
            }
          }}
        />
      </Sider>
      <Layout>
        <Header className="crm-header">
          <GlobalSearch />
          <Space size={12} className="header-actions">
            <Tooltip title="Сообщения">
              <Button type="text" shape="circle" icon={<MessageOutlined />} onClick={() => navigate('/messages')} />
            </Tooltip>
            <Tooltip title="Онлайн-запись">
              <Button type="text" shape="circle" icon={<CalendarOutlined />} onClick={() => navigate('/online-requests')} />
            </Tooltip>
            <Tooltip title={headerAlertTooltip}>
              <Badge count={headerAlertCount || undefined} size="small">
                <Button type="text" shape="circle" icon={<BellOutlined />} onClick={() => navigate(headerAlertTarget)} />
              </Badge>
            </Tooltip>
            <Tooltip title="Финансы клиники">
              <Button type="text" icon={<WalletOutlined />} onClick={() => navigate('/settings/finance')}>
                Финансы
              </Button>
            </Tooltip>
            <Dropdown menu={{ items: employeeMenuItems }} trigger={['click']} placement="bottomRight">
              <button className="employee-menu-button" type="button">
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
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

function getSeparateLocalLoginUrl() {
  const { protocol, hostname, port } = window.location;
  const targetHost = hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
  return `${protocol}//${targetHost}${port ? `:${port}` : ''}/login?force=1&separate=1`;
}
