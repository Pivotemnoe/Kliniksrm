export type BookingAttribution = { source: 'AVITO'; listingId: string };

export function BookingSource({ attribution, source }: { attribution?: BookingAttribution | null; source?: string }) {
  if (attribution?.source === 'AVITO' && /^[1-9]\d{0,19}$/.test(attribution.listingId)) {
    return <a href={`https://www.avito.ru/${attribution.listingId}`} target="_blank" rel="noopener noreferrer">Авито · объявление №{attribution.listingId} ↗</a>;
  }
  return <>{({ CRM: 'В CRM', CLIENT_PORTAL: 'Личный кабинет', OWNER_PORTAL: 'Личный кабинет' } as Record<string, string>)[source || ''] || 'Не указан'}</>;
}
