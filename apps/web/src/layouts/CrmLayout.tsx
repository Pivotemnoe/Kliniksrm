import {
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
import { RouteLoadBoundary } from '../app/RouteLoadBoundary';
import { listInternalMessageConversations } from '../features/internalMessages/internalMessages.api';
import { StaffAlertsPopover } from '../features/staffAlerts/StaffAlertsPopover';
import { getEmployeeDefaultRoute } from '../shared/routes/defaultRoutes';
import { GlobalSearch } from './GlobalSearch';
import { GlobalOperationalAlerts } from './GlobalOperationalAlerts';
import { getAccessibleMenuItems, getSelectedMenuKey } from './menu';
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
  const accessibleMenuItems = useMemo(() => getAccessibleMenuItems(employee), [employee]);
  useActivityTracking(Boolean(employee));
  const selectedKey = useMemo(() => getSelectedMenuKey(location.pathname), [location.pathname]);
  const primaryRole = employee?.roles[0];
  const primaryRoleLabel = primaryRole ? roleLabels[primaryRole] ?? primaryRole : 'Сотрудник';
  const employeePosition = employee?.position || primaryRoleLabel;
  const employeeInitial = employee?.fullName?.trim().slice(0, 1);
  const canOpenSeparateLocalLogin = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  const canReadOnlineRequests = hasPermission(employee, 'appointments.read');
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
          items={accessibleMenuItems}
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
            {canReadOnlineRequests ? (
              <Tooltip title="Заявки клиентов на приём">
                <Button
                  type="text"
                  shape="circle"
                  icon={<CalendarOutlined />}
                  aria-label="Заявки на приём"
                  onClick={() => navigate('/online-requests')}
                />
              </Tooltip>
            ) : null}
            <StaffAlertsPopover />
            {canReadBusiness || canReadFinanceSettings ? (
              <Tooltip title={canReadBusiness ? 'Финансы и отчётность клиники: прибыль, расходы и движение денег' : 'Финансовые настройки'}>
                <Button
                  type="text"
                  icon={<WalletOutlined />}
                  onClick={() => navigate(canReadBusiness ? '/business' : '/settings/finance')}
                >
                  {canReadBusiness ? 'Бизнес' : 'Финансы'}
                </Button>
              </Tooltip>
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
          <GlobalOperationalAlerts />
          <RouteLoadBoundary resetKey={location.pathname}>
            <Outlet />
          </RouteLoadBoundary>
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
