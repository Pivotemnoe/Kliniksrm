import type { BillItem } from './types';

type Amount = string | number;
export type GroupableBillLine = {
  id: string; title: string; kind?: string; productId?: string | null; serviceId?: string | null;
  quantity: Amount; stockQuantity?: Amount | null; billingUnit?: string | null; stockUnit?: string | null;
  priceVaries?: boolean; unitPrice: Amount; totalAmount: Amount; discount?: Amount;
};
// Quantities are stored with at most six decimal places. Sum scaled integers to
// avoid displaying floating-point tails for repeated fractional doses.
function add(a: Amount, b: Amount): string {
  const scaled = (value: Amount) => BigInt(Number(value).toFixed(6).replace('.', ''));
  const sum = scaled(a) + scaled(b);
  return `${sum / 1_000_000n}.${String(sum % 1_000_000n).padStart(6, '0')}`;
}
export function groupBillLines<T extends GroupableBillLine>(lines: T[]): T[] {
  const groups = new Map<string, T>();
  for (const line of lines) {
    const key = JSON.stringify([line.kind, line.productId, line.serviceId, line.productId || line.serviceId ? null : line.title, line.billingUnit, line.stockUnit,
      line.stockQuantity != null]);
    const current = groups.get(key);
    if (!current) groups.set(key, { ...line });
    else {
      current.priceVaries = current.priceVaries || line.priceVaries || Number(current.unitPrice) !== Number(line.unitPrice);
      current.quantity = add(current.quantity, line.quantity);
      current.totalAmount = add(current.totalAmount, line.totalAmount);
      current.discount = add(current.discount ?? 0, line.discount ?? 0);
      if (current.stockQuantity != null && line.stockQuantity != null) current.stockQuantity = add(current.stockQuantity, line.stockQuantity);
    }
  }
  return [...groups.values()];
}
export function billQuantityText(line: GroupableBillLine): string {
  return `${Number(line.quantity).toLocaleString('ru-RU', { maximumFractionDigits: 6 })} ${line.billingUnit || 'усл.'}`;
}
export function groupHospitalBillItems(items: BillItem[]) {
  return groupBillLines(items.map((item) => ({ ...item, kind: item.productId ? 'PRODUCT' : 'SERVICE',
    billingUnit: item.product?.billingUnit || item.product?.writeOffUnit || item.product?.stockUnit || (/^стационар/i.test(item.title) ? 'дн.' : 'усл.'),
    stockUnit: item.product?.writeOffUnit || item.product?.stockUnit || 'ед.',
  })));
}

export function billPriceText(line: GroupableBillLine, money: (value: Amount) => string): string {
  return line.priceVaries ? '—' : money(line.unitPrice);
}
