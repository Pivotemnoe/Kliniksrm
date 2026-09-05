import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Prisma } from './generated/client';
import { UpsertPublicCatalogDto } from './dto/upsert-public-catalog.dto';

export const PUBLIC_CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CATALOG_ID = 'clinic-armavir';

export function validateCatalog(snapshot: UpsertPublicCatalogDto, now = Date.now()) {
  const captured = new Date(snapshot.capturedAt).getTime();
  if (!Number.isFinite(captured) || captured > now + 300_000) throw new BadRequestException('Invalid capture time');
  if (new Set(snapshot.items.map((item) => item.id)).size !== snapshot.items.length) throw new BadRequestException('Duplicate services');
  for (const item of snapshot.items) {
    if (!item.title.trim() || !item.category.trim()) throw new BadRequestException('Empty title');
    if (item.priceType === 'FIXED' && (item.price === null || item.price === undefined)) throw new BadRequestException('Fixed price required');
    if (item.priceType === 'RANGE' && (item.minimumPrice == null || item.maximumPrice == null || item.minimumPrice > item.maximumPrice)) throw new BadRequestException('Invalid price range');
  }
}

@Injectable()
export class PublicClinicCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(snapshot: UpsertPublicCatalogDto) {
    validateCatalog(snapshot);
    // Rebuild payload even after DTO validation. No internal fields can leak to GET.
    const payload = { currency: 'RUB', items: snapshot.items.map((item) => ({
      id: item.id, title: item.title.trim(), category: item.category.trim(), priceType: item.priceType,
      price: item.priceType === 'FIXED' ? item.price! : null,
      minimumPrice: item.priceType === 'RANGE' ? item.minimumPrice! : null,
      maximumPrice: item.priceType === 'RANGE' ? item.maximumPrice! : null,
    })) };
    const data = { capturedAt: new Date(snapshot.capturedAt), receivedAt: new Date(), payload };
    try {
      await this.prisma.publicClinicCatalog.create({ data: { id: CATALOG_ID, ...data } });
      return { accepted: true };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
    // Atomic conditional update rejects reordered retries and concurrent older snapshots.
    const result = await this.prisma.publicClinicCatalog.updateMany({
      where: { id: CATALOG_ID, capturedAt: { lt: data.capturedAt } }, data,
    });
    return { accepted: result.count === 1 };
  }

  async get() {
    const catalog = await this.prisma.publicClinicCatalog.findUnique({ where: { id: CATALOG_ID } });
    if (!catalog) return { status: 'unavailable', currency: 'RUB', items: [], updatedAt: null };
    const stale = Date.now() - catalog.capturedAt.getTime() > PUBLIC_CATALOG_MAX_AGE_MS;
    const payload = catalog.payload as { currency: 'RUB'; items: Prisma.JsonValue[] };
    return {
      status: stale ? 'stale' : 'ready', currency: 'RUB', updatedAt: catalog.capturedAt.toISOString(),
      // Never present an indefinitely cached price as current.
      items: stale ? [] : payload.items,
    };
  }
}
