import { Injectable } from '@nestjs/common';
import { ClientPortalService } from '../../client-portal/client-portal.service';
import { PortalInviteChannel } from '../dto/create-portal-invite.dto';

export type OwnerGatewaySyncStatus = 'synced' | 'skipped_not_configured' | 'failed';
export type OwnerGatewayAutomaticDelivery = 'sent' | 'failed' | 'manual_required' | 'not_implemented';

export type OwnerGatewayInviteResult = {
  status: OwnerGatewaySyncStatus;
  deliveryUrl: string | null;
  automaticDelivery: OwnerGatewayAutomaticDelivery;
  failureReason?: 'network' | 'timeout' | 'rejected';
};

export type OwnerGatewayStatus = {
  hasSnapshot: boolean;
  maxLinked: boolean;
  telegramLinked: boolean;
  syncedAt: string | null;
};

export type OwnerMessengerChannel = 'MAX' | 'TELEGRAM';
export type OwnerGatewayMessageStatus = 'sent' | 'not_linked' | 'failed' | 'skipped_not_configured';

export type OwnerGatewayMessageResult = {
  status: OwnerGatewayMessageStatus;
  channel: OwnerMessengerChannel | null;
};

const DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS = 30_000;
const GATEWAY_RETRY_DELAY_MS = 400;

@Injectable()
export class OwnerGatewayClient {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  async syncInvitation(input: {
    ownerId: string;
    displayName: string;
    token: string;
    channel: PortalInviteChannel;
    expiresAt: Date;
  }): Promise<OwnerGatewayInviteResult> {
    const baseUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_URL);
    const syncSecret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();

    if (!baseUrl || !syncSecret) {
      return {
        status: 'skipped_not_configured',
        deliveryUrl: null,
        automaticDelivery: 'manual_required',
      };
    }

    try {
      const snapshot = await this.clientPortalService.buildOwnerGatewaySnapshot(input.ownerId);
      await requestGatewayWithRetry(`${baseUrl}/internal/v1/owners/${encodeURIComponent(input.ownerId)}/snapshot`, syncSecret, {
        method: 'PUT',
        body: {
          displayName: input.displayName,
          payload: snapshot,
          sourceVersion: process.env.CRM_SOURCE_VERSION?.trim() || 'local',
          sourceUpdatedAt: snapshot.syncedAt,
        },
      });

      const invitation = await requestGateway<{
        deliveryUrl?: unknown;
        automaticDelivery?: unknown;
      }>(`${baseUrl}/internal/v1/owners/${encodeURIComponent(input.ownerId)}/invitations`, syncSecret, {
        method: 'POST',
        body: {
          token: input.token,
          channel: input.channel,
          expiresAt: input.expiresAt.toISOString(),
        },
      });

      return {
        status: 'synced',
        deliveryUrl: typeof invitation.deliveryUrl === 'string' ? invitation.deliveryUrl : null,
        automaticDelivery: normalizeAutomaticDelivery(invitation.automaticDelivery),
      };
    } catch (error) {
      return {
        status: 'failed',
        deliveryUrl: null,
        automaticDelivery: 'failed',
        failureReason: classifyFailure(error),
      };
    }
  }

  async syncSnapshot(input: { ownerId: string; displayName: string }): Promise<OwnerGatewaySyncStatus> {
    const baseUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_URL);
    const syncSecret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();

    if (!baseUrl || !syncSecret) {
      return 'skipped_not_configured';
    }

    try {
      const snapshot = await this.clientPortalService.buildOwnerGatewaySnapshot(input.ownerId);
      await requestGatewayWithRetry(`${baseUrl}/internal/v1/owners/${encodeURIComponent(input.ownerId)}/snapshot`, syncSecret, {
        method: 'PUT',
        body: {
          displayName: input.displayName,
          payload: snapshot,
          sourceVersion: process.env.CRM_SOURCE_VERSION?.trim() || 'local',
          sourceUpdatedAt: snapshot.syncedAt,
        },
      });
      return 'synced';
    } catch {
      return 'failed';
    }
  }

  async sendMessage(input: {
    ownerId: string;
    channel: 'AUTO' | OwnerMessengerChannel;
    preferredChannel?: OwnerMessengerChannel;
    subject?: string | null;
    body: string;
  }): Promise<OwnerGatewayMessageResult> {
    const baseUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_URL);
    const syncSecret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();

    if (!baseUrl || !syncSecret) {
      return { status: 'skipped_not_configured', channel: null };
    }

    try {
      const result = await requestGateway<{ status?: unknown; channel?: unknown }>(
        `${baseUrl}/internal/v1/owners/${encodeURIComponent(input.ownerId)}/messages`,
        syncSecret,
        {
          method: 'POST',
          body: {
            channel: input.channel,
            preferredChannel: input.preferredChannel,
            subject: input.subject,
            body: input.body,
          },
        },
      );

      return {
        status: normalizeMessageStatus(result.status),
        channel: result.channel === 'MAX' || result.channel === 'TELEGRAM' ? result.channel : null,
      };
    } catch {
      return { status: 'failed', channel: null };
    }
  }

  async revokeAccess(ownerId: string): Promise<OwnerGatewaySyncStatus> {
    const baseUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_URL);
    const syncSecret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();

    if (!baseUrl || !syncSecret) {
      return 'skipped_not_configured';
    }

    try {
      await requestGatewayWithRetry(`${baseUrl}/internal/v1/owners/${encodeURIComponent(ownerId)}/access`, syncSecret, {
        method: 'DELETE',
      });
      return 'synced';
    } catch {
      return 'failed';
    }
  }

  async resetConnection(ownerId: string, channel: OwnerMessengerChannel): Promise<OwnerGatewaySyncStatus> {
    const baseUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_URL);
    const syncSecret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();

    if (!baseUrl || !syncSecret) {
      return 'skipped_not_configured';
    }

    try {
      await requestGatewayWithRetry(
        `${baseUrl}/internal/v1/owners/${encodeURIComponent(ownerId)}/connections/${encodeURIComponent(channel)}`,
        syncSecret,
        { method: 'DELETE' },
      );
      return 'synced';
    } catch {
      return 'failed';
    }
  }

  async getStatus(ownerId: string): Promise<OwnerGatewayStatus | null> {
    const baseUrl = normalizeBaseUrl(process.env.OWNER_GATEWAY_URL);
    const syncSecret = process.env.OWNER_GATEWAY_SYNC_SECRET?.trim();

    if (!baseUrl || !syncSecret) {
      return null;
    }

    try {
      return await requestGatewayWithRetry<OwnerGatewayStatus>(
        `${baseUrl}/internal/v1/owners/${encodeURIComponent(ownerId)}/status`,
        syncSecret,
        { method: 'GET' },
      );
    } catch {
      return null;
    }
  }
}

async function requestGateway<T = unknown>(
  url: string,
  syncSecret: string,
  input: { method: 'POST' | 'PUT'; body: unknown } | { method: 'DELETE' | 'GET'; body?: never },
): Promise<T> {
  const response = await fetch(url, {
    method: input.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Owner-Gateway-Secret': syncSecret,
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: AbortSignal.timeout(getGatewayRequestTimeoutMs()),
  });

  if (!response.ok) {
    throw new GatewayRequestError(response.status);
  }

  return (await response.json()) as T;
}

async function requestGatewayWithRetry<T = unknown>(
  url: string,
  syncSecret: string,
  input: { method: 'PUT'; body: unknown } | { method: 'DELETE' | 'GET'; body?: never },
): Promise<T> {
  try {
    return await requestGateway<T>(url, syncSecret, input);
  } catch (error) {
    if (error instanceof GatewayRequestError) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, GATEWAY_RETRY_DELAY_MS));
    return requestGateway<T>(url, syncSecret, input);
  }
}

function getGatewayRequestTimeoutMs() {
  const configured = Number(process.env.OWNER_GATEWAY_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) {
    return DEFAULT_GATEWAY_REQUEST_TIMEOUT_MS;
  }

  return Math.min(Math.max(Math.trunc(configured), 1_000), 120_000);
}

function normalizeBaseUrl(value: string | undefined) {
  return value?.trim().replace(/\/+$/, '') ?? '';
}

function normalizeAutomaticDelivery(value: unknown): OwnerGatewayAutomaticDelivery {
  return value === 'sent' || value === 'failed' || value === 'not_implemented' ? value : 'manual_required';
}

function normalizeMessageStatus(value: unknown): OwnerGatewayMessageStatus {
  return value === 'sent' || value === 'not_linked' ? value : 'failed';
}

function classifyFailure(error: unknown): 'network' | 'timeout' | 'rejected' {
  if (error instanceof GatewayRequestError) {
    return 'rejected';
  }

  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout';
  }

  return 'network';
}

class GatewayRequestError extends Error {
  constructor(readonly status: number) {
    super(`Owner gateway HTTP ${status}`);
  }
}
