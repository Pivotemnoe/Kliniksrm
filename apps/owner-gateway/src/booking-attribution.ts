export type BookingAttribution = { source: 'AVITO'; listingId: string };

export function normalizeBookingAttribution(value: unknown): BookingAttribution | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'listingId,source') return undefined;
  const item = value as Record<string, unknown>;
  return item.source === 'AVITO' && typeof item.listingId === 'string' && /^[1-9]\d{0,19}$/.test(item.listingId)
    ? { source: 'AVITO', listingId: item.listingId } : undefined;
}

export function bookingCommandAttribution(kind: string, input: Record<string, unknown>) {
  const normalized = { ...input };
  delete normalized.attribution;
  const attribution = kind === 'BOOK' ? normalizeBookingAttribution(input.attribution) : undefined;
  return attribution ? { ...normalized, attribution } : normalized;
}
