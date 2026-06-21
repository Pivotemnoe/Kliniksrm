import type { Employee } from '../types/auth';

export const defaultRouteOptions = [
  { value: '/dashboard', label: 'Сводка' },
  { value: '/news', label: 'Новости' },
  { value: '/schedule', label: 'Расписание' },
  { value: '/queue', label: 'Очередь' },
  { value: '/tasks', label: 'Задачи' },
  { value: '/owners', label: 'Владельцы' },
  { value: '/patients', label: 'Пациенты' },
  { value: '/visits', label: 'Приёмы' },
  { value: '/bills', label: 'Счета' },
  { value: '/sales', label: 'Продажи' },
  { value: '/hospital', label: 'Стационар' },
  { value: '/stock', label: 'Склад' },
  { value: '/messages', label: 'Сообщения' },
  { value: '/online-requests', label: 'Онлайн-запись' },
  { value: '/settings', label: 'Настройки' },
];

const defaultRouteLabels = new Map(defaultRouteOptions.map((item) => [item.value, item.label]));

export function getEmployeeDefaultRoute(employee?: Pick<Employee, 'defaultRoute'> | null) {
  return employee?.defaultRoute || '/dashboard';
}

export function getDefaultRouteLabel(route?: string | null) {
  if (!route) {
    return 'Сводка';
  }

  return defaultRouteLabels.get(route) ?? route;
}
