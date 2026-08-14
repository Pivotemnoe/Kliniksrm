import {
  ApartmentOutlined,
  AuditOutlined,
  DatabaseOutlined,
  CustomerServiceOutlined,
  DollarOutlined,
  ExportOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  MessageOutlined,
  ProfileOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Typography } from 'antd';
import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasPermission } from '../../auth/permissions';
import { useCurrentEmployee } from '../../auth/useAuth';
import { PageHeader } from '../../shared/ui/PageHeader';

type SettingsSection = {
  title: string;
  description: string;
  path: string;
  icon: ReactNode;
  permission?: string;
  permissions?: string[];
  roles?: string[];
};

const settingsSections: SettingsSection[] = [
  {
    title: 'Организация',
    description: 'Название клиники, юридические реквизиты и данные для печатных форм.',
    path: '/settings/organization',
    icon: <ProfileOutlined />,
    permission: 'settings.read',
  },
  {
    title: 'Филиал',
    description: 'Профиль филиала, график работы, кабинеты, боксы стационара и склады.',
    path: '/settings/office',
    icon: <ApartmentOutlined />,
    permission: 'settings.read',
  },
  {
    title: 'Сотрудники',
    description: 'Учётные записи, роли, точечные права и временные пароли сотрудников.',
    path: '/settings/employees',
    icon: <UserOutlined />,
    permission: 'employees.read',
  },
  {
    title: 'Шаблоны',
    description: 'Шаблоны документов приёма, переменные и печатные тексты.',
    path: '/settings/documents',
    icon: <FileTextOutlined />,
    permission: 'documents.read',
  },
  {
    title: 'Быстрые фразы',
    description: 'Фразы осмотра, рекомендации, шаблоны диагнозов и самообученные подсказки врачей.',
    path: '/settings/phrases',
    icon: <MessageOutlined />,
    permission: 'settings.manage',
  },
  {
    title: 'Лаборатории',
    description: 'Справочник платных анализов, связанные услуги и документы результатов.',
    path: '/settings/laboratories',
    icon: <ExperimentOutlined />,
    permission: 'laboratory.read',
  },
  {
    title: 'Финансы',
    description: 'Способы оплаты, кассы и настройки платежей по филиалам.',
    path: '/settings/finance',
    icon: <DollarOutlined />,
    permission: 'settings.read',
  },
  {
    title: 'Журнал аудита',
    description: 'Действия сотрудников, изменения карточек и системные события CRM.',
    path: '/settings/audit',
    icon: <AuditOutlined />,
    permission: 'audit.read',
  },
  {
    title: 'Перенос данных',
    description: 'Загрузка владельцев, пациентов, товаров и складских остатков из другой системы.',
    path: '/settings/import',
    icon: <ExportOutlined />,
    permissions: ['owners.manage', 'stock.manage'],
  },
  {
    title: 'Система и резервные копии',
    description: 'Состояние CRM, автоматические резервные копии и безопасные обновления.',
    path: '/settings/system',
    icon: <DatabaseOutlined />,
    permission: 'settings.read',
  },
  {
    title: 'Удалённый доступ',
    description: 'Персональный удалённый просмотр сотрудников, доверенные устройства и история входов.',
    path: '/settings/remote-access',
    icon: <SafetyCertificateOutlined />,
    permission: 'remote_access.read',
    roles: ['director'],
  },
  {
    title: 'Сообщения',
    description: 'Очередь отправки, ошибки доставки, повторная отправка и шаблоны уведомлений.',
    path: '/messages',
    icon: <MessageOutlined />,
    permission: 'notifications.read',
  },
  {
    title: 'Поддержка и лицензия',
    description: 'Обращения, безопасная диагностика, лицензия установки и приёмка нового сервера.',
    path: '/settings/support',
    icon: <CustomerServiceOutlined />,
    permission: 'support.read',
  },
];

export function SettingsOverviewPage() {
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const employee = auth?.employee;
  const visibleSections = settingsSections.filter(
    (section) =>
      (!section.permission || hasPermission(employee, section.permission))
      && (!section.permissions || section.permissions.some((permission) => hasPermission(employee, permission)))
      && (!section.roles || section.roles.some((role) => employee?.roles.includes(role))),
  );

  return (
    <div className="page">
      <PageHeader
        title="Настройки"
        description="Рабочие параметры клиники: организация, филиалы, сотрудники, документы, лаборатория, финансы и аудит."
      />
      <div className="settings-overview-grid">
        {visibleSections.map((section) => (
          <Card key={section.path} className="settings-overview-card" onClick={() => navigate(section.path)}>
            <div className="settings-overview-card-body">
              <div className="settings-overview-card-head">
                <span className="settings-overview-icon">{section.icon}</span>
              </div>
              <div className="settings-overview-card-copy">
                <Typography.Title level={4} className="compact-title">
                  {section.title}
                </Typography.Title>
                <Typography.Text type="secondary">{section.description}</Typography.Text>
              </div>
              <Button type="link" className="table-link" icon={<RightOutlined />}>
                Открыть раздел
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
