import { QueueStatus } from '@prisma/client';

export const QUEUE_ACCEPT_DELAY_MS = 15_000;

type QueueAcceptTiming = {
  status: QueueStatus;
  startedAt: Date | null;
  lastCalledAt: Date | null;
};

export function resolveQueueAcceptWaitSeconds(entry: QueueAcceptTiming, now = Date.now()) {
  if (entry.status !== QueueStatus.IN_PROGRESS) {
    return 0;
  }

  const lastCallAt = entry.lastCalledAt ?? entry.startedAt;
  if (!lastCallAt) {
    return Math.ceil(QUEUE_ACCEPT_DELAY_MS / 1000);
  }

  return Math.max(0, Math.ceil((lastCallAt.getTime() + QUEUE_ACCEPT_DELAY_MS - now) / 1000));
}
