/** A declared referral source, never proof of identity, consent or a reservation. */
export type BookingAttribution = { source: 'AVITO'; listingId: string };

export function bookingAttribution(value: unknown): BookingAttribution | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || record.source !== 'AVITO'
    || typeof record.listingId !== 'string' || !/^[1-9]\d{0,19}$/.test(record.listingId)) return undefined;
  return { source: 'AVITO', listingId: record.listingId };
}
