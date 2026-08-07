import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const servicePricingSelect = {
  id: true,
  title: true,
  price: true,
  priceType: true,
  minimumPrice: true,
  maximumPrice: true,
} satisfies Prisma.ServiceSelect;

export type ServicePricing = Prisma.ServiceGetPayload<{ select: typeof servicePricingSelect }>;

export function resolveServiceUnitPrice(service: ServicePricing, requestedPrice?: number) {
  const minimum = service.minimumPrice;
  const maximum = service.maximumPrice;
  const defaultPrice = service.priceType === 'FLOATING' && minimum !== null
    ? minimum
    : service.price;
  const selected = new Prisma.Decimal(requestedPrice ?? defaultPrice);

  // Legacy floating services imported before price ranges existed can remain
  // usable until their catalog card is corrected. Every newly saved floating
  // service is required to have both boundaries.
  if (service.priceType === 'FLOATING' && minimum !== null && maximum !== null) {
    if (selected.lessThan(minimum) || selected.greaterThan(maximum)) {
      throw new BadRequestException(
        `Цена услуги «${service.title}» должна быть от ${formatDecimal(minimum)} до ${formatDecimal(maximum)} ₽`,
      );
    }
  }

  return selected.toNumber();
}

function formatDecimal(value: Prisma.Decimal) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value.toNumber());
}
