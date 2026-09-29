import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { addressSearchQuery } from './address-search';

type AddressRow = { id: bigint; label: string; level: number; sourceVersion: number };

@Injectable()
export class AddressesService {
  private localities: string[] = [];
  private refreshedAt = 0;
  constructor(private readonly prisma: PrismaService) {}

  async suggest(input: string) {
    const query = addressSearchQuery(input);
    if (!query.valid) return { suggestions: [] };
    if (Date.now() - this.refreshedAt > 5 * 60 * 1000) {
      const names = await this.prisma.$queryRaw<{ name: string }[]>`SELECT DISTINCT "name" FROM "AddressCatalogEntry" WHERE "level" IN (5,6)`;
      this.localities = names.map(({ name }) => name.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/gu, ' ').trim()).sort((a, b) => b.length - a.length);
      this.refreshedAt = Date.now();
    }
    const placeInput = input.toLocaleLowerCase('ru').replace(/ё/g, 'е')
      .replace(/^(?:россия[,\s]*)?(?:(?:краснодарский|ставропольский)\s+край[,\s]*)?/u, '')
      .replace(/^(?:город|г\.?|село|с\.?|поселок|пос\.?|п\.?|станица|ст\.?|ст-ца)\s+/u, '')
      .replace(/[^а-яa-z0-9]+/gu, ' ').trim();
    const locality = this.localities.find((name) => placeInput === name || placeInput.startsWith(`${name} `));
    const rows = await this.prisma.$queryRaw<AddressRow[]>`
      SELECT "id", "label", "level", "sourceVersion"
      FROM "AddressCatalogEntry"
      WHERE "searchVector" @@ to_tsquery('simple', ${query.tsquery})
        AND (${locality ?? ''} = '' OR position(${locality ? `|${locality}|` : ''} in "localityNames") > 0)
        AND (${query.hasNumber} OR "level" <> 10)
      ORDER BY "priority", CASE WHEN "level" = 10 THEN 1 ELSE 0 END, length("label"), "label"
      LIMIT 20
    `;
    return { suggestions: rows.map((row) => ({ ...row, id: String(row.id) })) };
  }
}
