export type StaffAlertKind =
  | 'UNFINISHED_VISIT'
  | 'TODAY_VACCINATION'
  | 'OVERDUE_VACCINATION'
  | 'FAILED_DELIVERY'
  | 'ONLINE_REQUEST'
  | 'UNPAID_BILL'
  | 'LOW_STOCK'
  | 'NEWS'
  | 'DIRECTOR_BRIEFING';

export type StaffAlertItem = {
  key: string;
  kind: StaffAlertKind;
  title: string;
  description: string;
  href: string;
  count: number;
  severity: 'info' | 'warning' | 'error';
  occurredAt: string;
  version: string;
  unread: boolean;
  readAt: string | null;
};

export type StaffAlertsResponse = {
  items: StaffAlertItem[];
  unreadTotal: number;
  activeTotal: number;
};
