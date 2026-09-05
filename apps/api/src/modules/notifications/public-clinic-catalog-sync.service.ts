import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnerGatewayClient } from './providers/owner-gateway.client';

export type PublicCatalogItem = {
  id: string; title: string; category: string; priceType: 'FIXED' | 'RANGE' | 'ON_REQUEST';
  price: number | null; minimumPrice: number | null; maximumPrice: number | null;
};
export type PublicCatalogSnapshot = { capturedAt: string; currency: 'RUB'; items: PublicCatalogItem[] };

// Deliberate allowlist: never serialize the Service object or its relations.
export const publicCatalogSelect = {
  id: true, title: true, category: { select: { title: true } },
  price: true, priceType: true, minimumPrice: true, maximumPrice: true,
} as const;

export function toPublicCatalogItem(service: {
  id: string; title: string; category?: { title: string } | null;
  priceType: string; price: unknown; minimumPrice: unknown; maximumPrice: unknown;
}): PublicCatalogItem {
  const money = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 9999999999.99 ? Math.round(n * 100) / 100 : null;
  };
  const price = money(service.price);
  const low = money(service.minimumPrice);
  const high = money(service.maximumPrice);
  const range = service.priceType === 'FLOATING' && low !== null && high !== null && high >= low;
  const fixed = service.priceType === 'FIXED' && price !== null;
  return {
    id: service.id, title: service.title, category: service.category?.title ?? 'Другие услуги',
    priceType: range ? 'RANGE' : fixed ? 'FIXED' : 'ON_REQUEST',
    price: fixed ? price : null, minimumPrice: range ? low : null, maximumPrice: range ? high : null,
  };
}

@Injectable()
export class PublicClinicCatalogSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PublicClinicCatalogSyncService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly gateway: OwnerGatewayClient) {}

  onApplicationBootstrap() {
    if (process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED !== 'true') return;
    void this.syncOnce();
    this.timer = setInterval(() => void this.syncOnce(), 30_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async syncOnce(): Promise<'disabled' | 'busy' | 'synced' | 'failed'> {
    if (process.env.CLINIC_SITE_CATALOG_SYNC_ENABLED !== 'true') return 'disabled';
    if (this.running) return 'busy';
    this.running = true;
    try {
      const capturedAt = new Date().toISOString();
      const services = await this.prisma.service.findMany({
        where: { isActive: true, publicOnWebsite: true }, select: publicCatalogSelect, orderBy: { id: 'asc' }, take: 5001,
      });
      if (services.length > 5000) throw new Error('Public catalog exceeds limit');
      await this.gateway.syncPublicCatalog({ capturedAt, currency: 'RUB', items: services.map(toPublicCatalogItem) });
      return 'synced';
    } catch {
      // Never log request bodies, credentials or internal service details.
      this.logger.warn('Public clinic catalog sync failed; retrying on next cycle.');
      return 'failed';
    } finally { this.running = false; }
  }
}
