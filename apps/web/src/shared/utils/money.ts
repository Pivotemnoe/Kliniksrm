type MoneyValue = number | string | null | undefined;

const decimalFormatter = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const displayFormatter = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Currency calculations use whole kopecks. Do not use this for product quantities. */
export function toMoneyKopecks(value: MoneyValue) {
  const amount = toMoneyNumber(value);
  const kopecks = Number(decimalFormatter.format(amount).replace('.', ''));
  return kopecks === 0 ? 0 : kopecks;
}

export function roundMoney(value: MoneyValue) {
  return toMoneyKopecks(value) / 100;
}

export function sumMoney(values: MoneyValue[]) {
  return values.reduce<number>((sum, value) => sum + toMoneyKopecks(value), 0) / 100;
}

export function subtractMoney(left: MoneyValue, right: MoneyValue) {
  return (toMoneyKopecks(left) - toMoneyKopecks(right)) / 100;
}

export function formatMoney(value: MoneyValue) {
  return currencyFormatter.format(roundMoney(value));
}

export function formatMoneyValue(value: MoneyValue) {
  return displayFormatter.format(roundMoney(value));
}

export function moneyForExport(value: MoneyValue) {
  return roundMoney(value).toFixed(2);
}

export function toMoneyNumber(value: MoneyValue) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}
