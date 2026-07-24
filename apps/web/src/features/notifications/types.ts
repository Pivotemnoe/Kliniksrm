export type NotificationChannel = 'INTERNAL' | 'MESSENGER' | 'TELEGRAM' | 'MAX' | 'SMS' | 'EMAIL' | 'PUSH';
export type NotificationStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type ClientPortalStatus = 'DISABLED' | 'ENABLED' | 'INVITED' | 'BLOCKED';
export type PortalInviteChannel = 'MAX' | 'TELEGRAM' | 'WEB';

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
  metadata?: Record<string, unknown> | null;
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
  gatewayStatus?: {
    hasSnapshot: boolean;
    maxLinked: boolean;
    telegramLinked: boolean;
    syncedAt: string | null;
  } | null;
  gatewaySync?: 'synced' | 'skipped_not_configured' | 'failed';
  owner?: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
  };
};

export type CreateNotificationInput = {
  channel: NotificationChannel;
  recipient?: string;
  body: string;
  subject?: string | null;
  ownerId?: string | null;
  animalId?: string | null;
  templateId?: string | null;
  scheduledAt?: string | null;
  messengerChannels?: Array<'MAX' | 'TELEGRAM'>;
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

export type ClientPortalInvite = ClientPortalAccess & {
  inviteToken: string;
  inviteChannel: PortalInviteChannel;
  directDeliveryAvailable: boolean;
  deliveryUrl: string | null;
  automaticDelivery: 'sent' | 'failed' | 'skipped_not_configured' | 'manual_required' | 'not_implemented';
};

export type CreatePortalInviteInput = {
  channel: PortalInviteChannel;
};

export const notificationChannelLabels: Record<NotificationChannel, string> = {
  INTERNAL: 'Внутреннее',
  MESSENGER: 'Личный кабинет + мессенджер',
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
