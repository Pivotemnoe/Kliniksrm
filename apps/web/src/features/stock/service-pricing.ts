import { formatMoney, toMoneyNumber } from '../../shared/utils/money';
import type { DecimalValue } from '../visits/types';

export type ServicePricingLike = {
  price: DecimalValue;
  priceType?: string;
  minimumPrice?: DecimalValue | null;
  maximumPrice?: DecimalValue | null;
};

export function getServicePriceRange(service?: ServicePricingLike | null) {
  if (service?.priceType !== 'FLOATING' || service.minimumPrice === null || service.minimumPrice === undefined
    || service.maximumPrice === null || service.maximumPrice === undefined) {
    return null;
  }

  return {
    minimum: toMoneyNumber(service.minimumPrice),
    maximum: toMoneyNumber(service.maximumPrice),
  };
}

export function getServiceDefaultPrice(service?: ServicePricingLike | null) {
  return getServicePriceRange(service)?.minimum ?? toMoneyNumber(service?.price);
}

export function formatServicePrice(service: ServicePricingLike) {
  if (service.priceType !== 'FLOATING') {
    return formatMoney(service.price);
  }

  const range = getServicePriceRange(service);
  return range
    ? `${formatMoney(range.minimum)} — ${formatMoney(range.maximum)}`
    : 'Диапазон не задан';
}

export function getServicePriceHelp(service?: ServicePricingLike | null) {
  if (service?.priceType !== 'FLOATING') return undefined;
  const range = getServicePriceRange(service);
  return range
    ? `Выберите цену от ${formatMoney(range.minimum)} до ${formatMoney(range.maximum)} включительно.`
    : 'Для старой услуги диапазон ещё не задан. Укажите его в каталоге услуг.';
}

export function validateServicePrice(service: ServicePricingLike | null | undefined, price: number) {
  const range = getServicePriceRange(service);
  if (!range || (price >= range.minimum && price <= range.maximum)) return null;
  return `Цена должна быть от ${formatMoney(range.minimum)} до ${formatMoney(range.maximum)}.`;
}
