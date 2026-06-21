export type NotificationChannel = 'INTERNAL' | 'TELEGRAM' | 'MAX' | 'SMS' | 'EMAIL' | 'PUSH';
export type NotificationStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type ClientPortalStatus = 'DISABLED' | 'ENABLED' | 'INVITED' | 'BLOCKED';

export type NotificationOutboxItem = {
  id: string;
  ownerId: string | null;
  animalId: string | null;
  templateId: string | null;
  createdById: string | null;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  attempts: number;
  scheduledAt: string;
  sentAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  } | null;
  animal?: {
    id: string;
    nickname: string;
    species: string | null;
    breed: string | null;
  } | null;
  template?: {
    id: string;
    channel: string;
    eventCode: string;
    title: string;
  } | null;
  createdBy?: {
    id: string;
    fullName: string;
    position: string | null;
  } | null;
};

export type NotificationTemplate = {
  id: string;
  channel: string;
  eventCode: string;
  title: string;
  subject: string | null;
  body: string;
  variables: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientPortalAccess = {
  id: string | null;
  ownerId: string;
  status: ClientPortalStatus;
  inviteExpiresAt?: string | null;
  invitedAt?: string | null;
  lastLoginAt?: string | null;
  blockedReason?: string | null;
  inviteToken?: string | null;
  owner?: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  };
};

export type CreateNotificationInput = {
  channel: NotificationChannel;
  recipient: string;
  body: string;
  subject?: string | null;
  ownerId?: string | null;
  animalId?: string | null;
  templateId?: string | null;
  scheduledAt?: string | null;
};

export type UpsertNotificationTemplateInput = {
  channel: string;
  eventCode: string;
  title: string;
  subject?: string | null;
  body: string;
  isActive?: boolean;
};

export type UpdatePortalAccessInput = {
  status: ClientPortalStatus;
  blockedReason?: string | null;
};

export const notificationChannelLabels: Record<NotificationChannel, string> = {
  INTERNAL: 'Внутреннее',
  TELEGRAM: 'Telegram',
  MAX: 'MAX',
  SMS: 'SMS',
  EMAIL: 'Email',
  PUSH: 'Push',
};

export const notificationStatusLabels: Record<NotificationStatus, string> = {
  QUEUED: 'В очереди',
  SENDING: 'Отправляется',
  SENT: 'Отправлено',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменено',
};

export const notificationStatusColors: Record<NotificationStatus, string> = {
  QUEUED: 'blue',
  SENDING: 'processing',
  SENT: 'green',
  FAILED: 'red',
  CANCELLED: 'default',
};

export const portalStatusLabels: Record<ClientPortalStatus, string> = {
  DISABLED: 'Выключен',
  ENABLED: 'Включён',
  INVITED: 'Приглашён',
  BLOCKED: 'Заблокирован',
};

export const portalStatusColors: Record<ClientPortalStatus, string> = {
  DISABLED: 'default',
  ENABLED: 'green',
  INVITED: 'blue',
  BLOCKED: 'red',
};
