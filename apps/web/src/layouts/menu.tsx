import {
  ApartmentOutlined,
  AuditOutlined,
  BarChartOutlined,
  BankOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  ExportOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  HomeOutlined,
  IdcardOutlined,
  MedicineBoxOutlined,
  MessageOutlined,
  NotificationOutlined,
  OrderedListOutlined,
  ProfileOutlined,
  SettingOutlined,
  ShopOutlined,
  SolutionOutlined,
  TagsOutlined,
  TeamOutlined,
  UserOutlined,
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { MenuProps } from 'antd';
import { canAccessPath } from '../auth/access';
import type { Employee } from '../shared/types/auth';

export const menuItems: MenuProps['items'] = [
  { key: '/news', icon: <NotificationOutlined />, label: 'Новости' },
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Сводка' },
  {
    key: '/finance-workspace',
    icon: <WalletOutlined />,
    label: 'Финансы',
    children: [
      { key: '/reports', icon: <BarChartOutlined />, label: 'Отчёты' },
      { key: '/daily-finance', icon: <CalculatorOutlined />, label: 'Закрытие дня' },
      { key: '/business', icon: <BankOutlined />, label: 'Бизнес' },
      { key: '/payroll', icon: <DollarOutlined />, label: 'Зарплата' },
      { key: '/bills', icon: <IdcardOutlined />, label: 'Счета' },
      { key: '/sales', icon: <ShopOutlined />, label: 'Продажи' },
    ],
  },
  { key: '/schedule', icon: <CalendarOutlined />, label: 'Расписание' },
  { key: '/queue', icon: <OrderedListOutlined />, label: 'Очередь' },
  { key: '/tasks', icon: <AuditOutlined />, label: 'Задачи' },
  { key: '/owners', icon: <TeamOutlined />, label: 'Владельцы' },
  { key: '/patients', icon: <MedicineBoxOutlined />, label: 'Пациенты' },
  { key: '/visits', icon: <FileTextOutlined />, label: 'Приёмы' },
  { key: '/laboratory', icon: <ExperimentOutlined />, label: 'Лаборатория' },
  { key: '/hospital', icon: <HomeOutlined />, label: 'Стационар' },
  {
    key: '/stock',
    icon: <DatabaseOutlined />,
    label: 'Склад',
    children: [
      { key: '/stock/goods', icon: <TagsOutlined />, label: 'Товары' },
      { key: '/stock/services', icon: <SolutionOutlined />, label: 'Услуги' },
      { key: '/stock/supplies', icon: <DatabaseOutlined />, label: 'Учёт' },
      { key: '/stock/operations', icon: <SwapOutlined />, label: 'Операции' },
    ],
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: 'Настройки',
    children: [
      { key: '/settings/organization', icon: <ProfileOutlined />, label: 'Организация' },
      { key: '/settings/office', icon: <ApartmentOutlined />, label: 'Филиал' },
      { key: '/settings/employees', icon: <UserOutlined />, label: 'Сотрудники' },
      { key: '/settings/documents', icon: <FileTextOutlined />, label: 'Шаблоны' },
      { key: '/settings/phrases', icon: <MessageOutlined />, label: 'Быстрые фразы' },
      { key: '/settings/laboratories', icon: <ExperimentOutlined />, label: 'Лаборатории' },
      { key: '/settings/finance', icon: <DollarOutlined />, label: 'Финансы' },
      { key: '/settings/audit', icon: <AuditOutlined />, label: 'Журнал аудита' },
      { key: '/settings/system', icon: <DatabaseOutlined />, label: 'Система' },
      { key: '/settings/support', icon: <CustomerServiceOutlined />, label: 'Поддержка и лицензия' },
      { key: '/settings/import', icon: <ExportOutlined />, label: 'Перенос данных' },
    ],
  },
];

export function getAccessibleMenuItems(employee: Employee | undefined): MenuProps['items'] {
  return filterMenuItems(menuItems, employee);
}

export const pageTitles: Record<string, string> = {
  news: 'Новости',
  dashboard: 'Сводка',
  reports: 'Отчёты',
  payroll: 'Зарплата',
  'daily-finance': 'Закрытие дня',
  business: 'Бизнес',
  schedule: 'Расписание',
  queue: 'Очередь',
  tasks: 'Календарь задач',
  owners: 'Владельцы',
  patients: 'Пациенты',
  visits: 'Приёмы',
  laboratory: 'Лаборатория',
  hospital: 'Стационар',
  bills: 'Счета',
  sales: 'Продажи',
  stock: 'Склад',
  employees: 'Сотрудники',
  settings: 'Настройки',
  documents: 'Шаблоны',
  phrases: 'Быстрые фразы',
  onlineRequests: 'Онлайн-запись',
  messages: 'Сообщения',
  organization: 'Организация',
  office: 'Филиал',
  laboratories: 'Лаборатории',
  finance: 'Финансы',
  audit: 'Журнал аудита',
  system: 'Система',
  support: 'Поддержка и лицензия',
  import: 'Перенос данных',
};

export const pageDescriptions: Record<string, string> = {
  news: 'Внутренние новости и обновления работы клиники.',
  dashboard: 'Рабочая сводка клиники на день.',
  reports: 'Финансы, посещаемость, услуги, сотрудники, вакцинации и склад.',
  payroll: 'Настройки начислений, расчётные периоды и утверждённые ведомости.',
  'daily-finance': 'Сверка касс, ручная выручка и расходы за день.',
  business: 'Закрытая управленческая отчётность директора.',
  schedule: 'Календарь записей и загрузка врачей.',
  queue: 'Живая очередь пациентов в клинике.',
  tasks: 'Задачи сотрудникам, должностям и напоминания по пациентам.',
  owners: 'Карточки владельцев и контакты.',
  patients: 'Карточки пациентов, вес и вакцинации.',
  visits: 'Осмотры, рекомендации и услуги.',
  laboratory: 'Журнал лабораторных заказов, результаты и справочник анализов.',
  hospital: 'Стационарные пациенты и боксы.',
  bills: 'Счета, оплаты и задолженности.',
  sales: 'Отдельные продажи товаров без клинического приёма.',
  stock: 'Товары, услуги, остатки и приёмка.',
  employees: 'Сотрудники, должности и права доступа.',
  settings: 'Параметры работы клиники.',
  documents: 'Текстовые, составные шаблоны и уведомления.',
  phrases: 'Фразы и клинические подсказки для листа приёма.',
  onlineRequests: 'Заявки клиентов из публичной онлайн-записи.',
  messages: 'Переписки, уведомления и рассылки клиентам.',
  organization: 'Профиль организации, реквизиты, тариф и платежи.',
  office: 'Филиал, график, кабинеты, склады, кассы и уведомления.',
  laboratories: 'Внутренняя лаборатория, профили анализов и интеграции.',
  finance: 'Баланс клиники, тарифы, кассы и финансовые настройки.',
  audit: 'Действия сотрудников и системные события CRM.',
  system: 'Состояние CRM, автоматические резервные копии и безопасное обновление.',
  support: 'Обращения, лицензия установки и финальная приёмка нового сервера.',
  import: 'Перенос клиентов, пациентов, товаров и остатков из другой системы.',
};

export type PageKey = keyof typeof pageTitles;

export function getSelectedMenuKey(pathname: string) {
  const keys = collectMenuKeys(menuItems).sort((a, b) => b.length - a.length);
  return keys.find((key) => pathname === key || pathname.startsWith(`${key}/`)) ?? '/dashboard';
}

function collectMenuKeys(items: MenuProps['items']): string[] {
  return (items ?? []).flatMap((item) => {
    if (!item || !('key' in item)) {
      return [];
    }

    const key = String(item.key);
    const children = 'children' in item ? collectMenuKeys(item.children as MenuProps['items']) : [];

    return [key, ...children];
  });
}

function filterMenuItems(items: MenuProps['items'], employee: Employee | undefined): MenuProps['items'] {
  return (items ?? []).flatMap((item) => {
    if (!item || !('key' in item)) {
      return [];
    }

    const key = String(item.key);
    const children = 'children' in item ? filterMenuItems(item.children as MenuProps['items'], employee) : undefined;
    if (children?.length) {
      return [{ ...item, children }];
    }

    return canAccessPath(employee, key) ? [item] : [];
  });
}
