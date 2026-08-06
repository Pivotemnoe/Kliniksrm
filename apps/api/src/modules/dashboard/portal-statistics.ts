import { OwnerGatewayPortalStatistics } from '../notifications/providers/owner-gateway.client';

export type LocalPortalOwner = {
  ownerId: string;
  fullName: string;
  phone: string | null;
  status: 'DISABLED' | 'INVITED' | 'ENABLED' | 'BLOCKED';
  invitedAt: string | null;
  lastLoginAt: string | null;
  telegramLinked: boolean;
  maxLinked: boolean;
};

export type DirectorPortalOwnerStatus = 'ACTIVATED' | 'INVITED' | 'ENABLED' | 'BLOCKED' | 'DISABLED';

export type DirectorPortalStatistics = {
  calculatedAt: string;
  gatewayAvailable: boolean;
  gatewayUpdatedAt: string | null;
  totals: {
    owners: number;
    registered: number;
    invited: number;
    active30Days: number;
    telegramLinked: number;
    maxLinked: number;
    blocked: number;
  };
  listedOwners: number;
  items: Array<{
    ownerId: string;
    fullName: string;
    phone: string | null;
    status: DirectorPortalOwnerStatus;
    registered: boolean;
    invitedAt: string | null;
    activatedAt: string | null;
    lastSeenAt: string | null;
    telegramLinked: boolean;
    maxLinked: boolean;
  }>;
};

export function buildDirectorPortalStatistics(input: {
  totalOwners: number;
  localOwners: LocalPortalOwner[];
  gateway: OwnerGatewayPortalStatistics | null;
  now?: Date;
  listLimit?: number;
}): DirectorPortalStatistics {
  const now = input.now ?? new Date();
  const activeSince = new Date(now.getTime() - 30 * 86_400_000);
  const gatewayOwners = new Map((input.gateway?.owners ?? []).map((owner) => [owner.ownerId, owner]));

  const items = input.localOwners.flatMap((localOwner) => {
    const gatewayOwner = gatewayOwners.get(localOwner.ownerId);
    const activatedAt = earliestDate(localOwner.lastLoginAt, gatewayOwner?.activatedAt ?? null);
    const lastSeenAt = latestDate(localOwner.lastLoginAt, gatewayOwner?.lastSeenAt ?? null);
    const registered = Boolean(activatedAt);
    const telegramLinked = localOwner.telegramLinked || Boolean(gatewayOwner?.telegramLinked);
    const maxLinked = localOwner.maxLinked || Boolean(gatewayOwner?.maxLinked);
    const relevant = localOwner.status !== 'DISABLED'
      || Boolean(localOwner.invitedAt)
      || registered
      || telegramLinked
      || maxLinked;

    if (!relevant) {
      return [];
    }

    return [{
      ownerId: localOwner.ownerId,
      fullName: localOwner.fullName,
      phone: localOwner.phone,
      status: resolveDisplayStatus(localOwner.status, registered),
      registered,
      invitedAt: toIsoDate(localOwner.invitedAt),
      activatedAt,
      lastSeenAt,
      telegramLinked,
      maxLinked,
    }];
  });

  const sortedItems = items.sort((left, right) => {
    const leftDate = left.lastSeenAt ?? left.invitedAt ?? '';
    const rightDate = right.lastSeenAt ?? right.invitedAt ?? '';
    return rightDate.localeCompare(leftDate) || left.fullName.localeCompare(right.fullName, 'ru');
  });
  const limit = Math.max(1, Math.min(input.listLimit ?? 100, 500));

  return {
    calculatedAt: now.toISOString(),
    gatewayAvailable: Boolean(input.gateway),
    gatewayUpdatedAt: toIsoDate(input.gateway?.generatedAt ?? null),
    totals: {
      owners: input.totalOwners,
      registered: items.filter((item) => item.registered).length,
      invited: items.filter((item) => item.status === 'INVITED').length,
      active30Days: items.filter((item) => isOnOrAfter(item.lastSeenAt, activeSince)).length,
      telegramLinked: items.filter((item) => item.telegramLinked).length,
      maxLinked: items.filter((item) => item.maxLinked).length,
      blocked: items.filter((item) => item.status === 'BLOCKED').length,
    },
    listedOwners: items.length,
    items: sortedItems.slice(0, limit),
  };
}

function resolveDisplayStatus(status: LocalPortalOwner['status'], registered: boolean): DirectorPortalOwnerStatus {
  if (status === 'BLOCKED') {
    return 'BLOCKED';
  }
  if (status === 'DISABLED') {
    return 'DISABLED';
  }
  if (registered) {
    return 'ACTIVATED';
  }
  if (status === 'INVITED') {
    return 'INVITED';
  }
  return 'ENABLED';
}

function earliestDate(...values: Array<string | null | undefined>) {
  const dates = values.map(toIsoDate).filter((value): value is string => Boolean(value));
  return dates.sort()[0] ?? null;
}

function latestDate(...values: Array<string | null | undefined>) {
  const dates = values.map(toIsoDate).filter((value): value is string => Boolean(value));
  return dates.sort().at(-1) ?? null;
}

function toIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isOnOrAfter(value: string | null, threshold: Date) {
  return value ? new Date(value) >= threshold : false;
}
