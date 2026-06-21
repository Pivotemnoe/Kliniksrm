import {
  ApartmentOutlined,
  AuditOutlined,
  DatabaseOutlined,
  DollarOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  MessageOutlined,
  ProfileOutlined,
  RightOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
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
  status: 'ready' | 'partial';
  permission?: string;
};

const settingsSections: SettingsSection[] = [
  {
    title: 'Организация',
    description: 'Название клиники, юридические реквизиты и данные для печатных форм.',
    path: '/settings/organization',
    icon: <ProfileOutlined />,
    status: 'partial',
    permission: 'settings.read',
  },
  {
    title: 'Филиал',
    description: 'Профиль филиала, график работы, кабинеты, боксы стационара и склады.',
    path: '/settings/office',
    icon: <ApartmentOutlined />,
    status: 'ready',
    permission: 'settings.read',
  },
  {
    title: 'Сотрудники',
    description: 'Учётные записи, роли, точечные права и временные пароли сотрудников.',
    path: '/settings/employees',
    icon: <UserOutlined />,
    status: 'ready',
    permission: 'employees.read',
  },
  {
    title: 'Шаблоны',
    description: 'Шаблоны документов приёма, переменные и печатные тексты.',
    path: '/settings/documents',
    icon: <FileTextOutlined />,
    status: 'partial',
    permission: 'documents.read',
  },
  {
    title: 'Быстрые фразы',
    description: 'Фразы осмотра, рекомендации, шаблоны диагнозов и самообученные подсказки врачей.',
    path: '/settings/phrases',
    icon: <MessageOutlined />,
    status: 'ready',
    permission: 'settings.manage',
  },
  {
    title: 'Лаборатории',
    description: 'Справочник анализов, профили, единицы измерения и связанные услуги.',
    path: '/settings/laboratories',
    icon: <ExperimentOutlined />,
    status: 'ready',
    permission: 'laboratory.read',
  },
  {
    title: 'Финансы',
    description: 'Способы оплаты, кассы и настройки платежей по филиалам.',
    path: '/settings/finance',
    icon: <DollarOutlined />,
    status: 'partial',
    permission: 'settings.read',
  },
  {
    title: 'Журнал аудита',
    description: 'Действия сотрудников, изменения карточек и системные события CRM.',
    path: '/settings/audit',
    icon: <AuditOutlined />,
    status: 'ready',
    permission: 'audit.read',
  },
  {
    title: 'Система и backup',
    description: 'Состояние backend, автоматические резервные копии и безопасные обновления с флешки.',
    path: '/settings/system',
    icon: <DatabaseOutlined />,
    status: 'ready',
    permission: 'settings.read',
  },
  {
    title: 'Сообщения',
    description: 'Очередь отправки, ошибки доставки, повторная отправка и шаблоны уведомлений.',
    path: '/messages',
    icon: <MessageOutlined />,
    status: 'partial',
    permission: 'notifications.read',
  },
];

export function SettingsOverviewPage() {
  const navigate = useNavigate();
  const { data: auth } = useCurrentEmployee();
  const employee = auth?.employee;
  const visibleSections = settingsSections.filter((section) => !section.permission || hasPermission(employee, section.permission));

  return (
    <div className="page">
      <PageHeader
        title="Настройки"
        description="Рабочие параметры клиники: организация, филиалы, сотрудники, документы, лаборатория, финансы и аудит."
      />
      <div className="settings-overview-grid">
        {visibleSections.map((section) => (
          <Card key={section.path} className="settings-overview-card" onClick={() => navigate(section.path)}>
            <Space direction="vertical" size={12} className="full-width">
              <div className="settings-overview-card-head">
                <span className="settings-overview-icon">{section.icon}</span>
                <Tag color={section.status === 'ready' ? 'green' : 'blue'}>
                  {section.status === 'ready' ? 'Работает' : 'В работе'}
                </Tag>
              </div>
              <div>
                <Typography.Title level={4} className="compact-title">
                  {section.title}
                </Typography.Title>
                <Typography.Text type="secondary">{section.description}</Typography.Text>
              </div>
              <Button type="link" className="table-link" icon={<RightOutlined />}>
                Открыть раздел
              </Button>
            </Space>
          </Card>
        ))}
      </div>
    </div>
  );
}
