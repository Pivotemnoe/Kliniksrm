import type { PetServiceContext } from './avito-pet-services';
import type { ListingRule } from './avito.settings';

const sites = { GROOMING: 'https://pet.temichevvet.ru/', HOTEL: 'https://pet.temichevvet.ru/pet-hotel/' };

/** Only public advertisement provenance belongs in a website referral. */
export function withAvitoListingSource(context: PetServiceContext | undefined, mapping?: Pick<ListingRule, 'id' | 'direction' | 'enabled'>): PetServiceContext | undefined {
  if (!context || context.direction !== 'GROOMING' && context.direction !== 'HOTEL') return context;
  const canonical = sites[context.direction], target = new URL(canonical);
  const id = mapping?.id;
  const validId = typeof id === 'string' && id.length > 0 && id.length <= 20 && id[0] !== '0' && !/[^0-9]/.test(id);
  let trusted = false;
  try {
    const current = new URL(context.siteUrl);
    trusted = current.protocol === 'https:' && current.hostname === target.hostname && !current.username && !current.password && !current.port
      && (current.pathname === target.pathname || context.direction === 'HOTEL' && current.pathname === '/pet-hotel');
  } catch { /* An invalid configured URL falls back to the direction's own public page. */ }
  if (trusted && mapping?.enabled === true && mapping.direction === context.direction && validId) {
    target.searchParams.set('utm_source', 'avito');
    target.searchParams.set('listing_id', id);
  }
  // Rebuild from the canonical URL: saved queries/hash may contain arbitrary
  // campaign fields or personal data and must never be forwarded to the site.
  return { ...context, siteUrl: target.href };
}
