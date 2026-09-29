import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { addressSearchQuery, normalizeAddressInput } from './address-search';

type AddressRow = { id: bigint; label: string; level: number; sourceVersion: number };

@Injectable()
export class AddressesService {
  private localities: { name: string; city: boolean }[] = [];
  private refreshedAt = 0;
  constructor(private readonly prisma: PrismaService) {}

  async suggest(input: string) {
    const query = addressSearchQuery(input);
    if (!query.valid) return { suggestions: [] };
    if (Date.now() - this.refreshedAt > 5 * 60 * 1000) {
      const names = await this.prisma.$queryRaw<{ name: string; level: number }[]>`SELECT DISTINCT "name", "level" FROM "AddressCatalogEntry" WHERE "level" IN (5,6)`;
      this.localities = names.map(({ name, level }) => ({ name: name.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/gu, ' ').trim(), city: level === 5 })).sort((a, b) => b.name.length - a.name.length);
      this.refreshedAt = Date.now();
    }
    const regionlessInput = normalizeAddressInput(input)
      .replace(/^(?:россия[,\s]*)?(?:(?:краснодарский|ставропольский)\s+край[,\s]*)?/u, '');
    const explicitPlaceType = /^(?:город|г\.?|село|с\.?|поселок|пос\.?|п\.?|станица|ст\.?|ст-ца|хутор|х\.?)\s+/u.test(regionlessInput);
    const placeInput = regionlessInput
      .replace(/^(?:город|г\.?|село|с\.?|поселок|пос\.?|п\.?|станица|ст\.?|ст-ца|хутор|х\.?)\s+/u, '')
      .replace(/[^а-яa-z0-9]+/gu, ' ').trim();
    // A village may share a street name (e.g. Ленина). Bare street + house
    // must retain Armavir priority; explicit place type or a following street
    // identifies a settlement. City names are unambiguous locality hints.
    const locality = this.localities.find(({ name, city }) => {
      if (placeInput !== name && !placeInput.startsWith(`${name} `)) return false;
      const rest = addressSearchQuery(placeInput.slice(name.length).trim());
      return city || explicitPlaceType || /[а-яa-z]{2}/u.test(rest.tsquery);
    })?.name;
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
