import type { StaffAlertItem } from './types';

export type AlertView = 'action' | 'information' | 'all';
export type AlertGroupId = 'visits' | 'vaccinations' | 'requests' | 'delivery' | 'finance' | 'stock' | 'reports' | 'information';
export type AlertGroup = { id: AlertGroupId; title: string; items: StaffAlertItem[]; unread: number; urgent: boolean };

const groups: Record<AlertGroupId, string> = {
  visits: 'Незавершённые приёмы', vaccinations: 'Вакцинации', requests: 'Заявки клиентов',
  delivery: 'Доставка сообщений', finance: 'Счета и оплаты', stock: 'Склад',
  reports: 'Отчёты по профилактике', information: 'Новости и сводки',
};
const order = Object.keys(groups) as AlertGroupId[];

export function alertGroupId(item: StaffAlertItem): AlertGroupId {
  switch (item.kind) {
    case 'UNFINISHED_VISIT': return 'visits';
    case 'TODAY_VACCINATION': case 'OVERDUE_VACCINATION': return 'vaccinations';
    case 'ONLINE_REQUEST': return 'requests';
    case 'FAILED_DELIVERY': return 'delivery';
    case 'UNPAID_BILL': case 'BILL_OVERPAYMENT': return 'finance';
    case 'LOW_STOCK': return 'stock';
    case 'PREVENTION_REPORT': return 'reports';
    default: return 'information';
  }
}

/** Keep every server-authorized event; viewed clinical work is still active work. */
export function presentStaffAlerts(items: StaffAlertItem[], view: AlertView, search = ''): AlertGroup[] {
  const query = search.trim().toLocaleLowerCase('ru');
  const result = new Map<AlertGroupId, AlertGroup>();
  for (const item of items) {
    const id = alertGroupId(item);
    if (view === 'action' && id === 'information' || view === 'information' && id !== 'information') continue;
    if (query && !`${item.title} ${item.description}`.toLocaleLowerCase('ru').includes(query)) continue;
    const group = result.get(id) ?? { id, title: groups[id], items: [], unread: 0, urgent: false };
    group.items.push(item);
    group.unread += Number(item.unread);
    group.urgent ||= item.severity === 'error';
    result.set(id, group);
  }
  return [...result.values()].sort((a, b) => Number(b.urgent) - Number(a.urgent) || order.indexOf(a.id) - order.indexOf(b.id)).map(group => ({
    ...group,
    items: [...group.items].sort((a, b) => group.id === 'visits'
      ? Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
      : Number(b.severity === 'error') - Number(a.severity === 'error') || Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
  }));
}

export function alertActionLabel(item: StaffAlertItem) {
  switch (item.kind) {
    case 'UNFINISHED_VISIT': return 'Открыть приём';
    case 'TODAY_VACCINATION': case 'OVERDUE_VACCINATION': return 'Открыть пациента';
    case 'ONLINE_REQUEST': return 'Разобрать заявки';
    case 'UNPAID_BILL': case 'BILL_OVERPAYMENT': return 'Открыть счета';
    case 'LOW_STOCK': return 'Проверить остатки';
    case 'FAILED_DELIVERY': return 'Проверить доставку';
    default: return 'Открыть';
  }
}
