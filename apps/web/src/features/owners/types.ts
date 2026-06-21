import { Animal } from '../animals/types';
import { PaymentType } from '../billing/types';
import { NotificationChannel } from '../notifications/types';

export type Owner = {
  id: string;
  fullName: string;
  organizationName: string | null;
  phone: string | null;
  extraPhone: string | null;
  email: string | null;
  address: string | null;
  source: string | null;
  passportData: string | null;
  comment: string | null;
  preferredNotificationChannel: NotificationChannel | null;
  telegramChatId: string | null;
  maxUserId: string | null;
  allowSms: boolean;
  allowTelegram: boolean;
  allowMax: boolean;
  allowEmail: boolean;
  goodsDiscount: string;
  servicesDiscount: string;
  balance: string;
  animals?: Animal[];
  trustedPeople?: TrustedPerson[];
  balanceOperations?: OwnerBalanceOperation[];
  _count?: {
    animals: number;
    appointments: number;
    visits: number;
    bills: number;
    tasks?: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type TrustedPerson = {
  id: string;
  ownerId: string;
  fullName: string;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OwnerBalanceOperation = {
  id: string;
  ownerId: string;
  type: PaymentType;
  amount: string;
  comment: string | null;
  createdAt: string;
};

export type OwnerBalanceOperationInput = {
  type: PaymentType;
  amount: number;
  comment?: string;
};

export type OwnerMutationInput = {
  fullName: string;
  organizationName?: string;
  phone?: string;
  extraPhone?: string;
  email?: string;
  address?: string;
  source?: string;
  passportData?: string;
  comment?: string;
  preferredNotificationChannel?: NotificationChannel | null;
  telegramChatId?: string | null;
  maxUserId?: string | null;
  allowSms?: boolean;
  allowTelegram?: boolean;
  allowMax?: boolean;
  allowEmail?: boolean;
  goodsDiscount?: number;
  servicesDiscount?: number;
};
