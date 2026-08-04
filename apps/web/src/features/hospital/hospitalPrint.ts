import { appConfig } from '../../app/config';
import type { OrganizationSettings } from '../organization/types';
import type { HospitalRecord, HospitalStay } from './types';

export function printHospitalSheet(stay: HospitalStay, organization?: OrganizationSettings | null) {
  const printWindow = window.open('', '_blank', 'width=1100,height=820');
  if (!printWindow) return false;

  const timeZone = stay.timezone || 'Europe/Moscow';
  const groups = groupOwnerReportRecords(stay.hospitalRecords ?? [], timeZone);
  const clinicName = organization?.displayName?.trim() || appConfig.brandName;
  const clinicDescription = organization?.orgType?.trim() || 'Ветеринарная клиника';
  const logoUrl = organization?.logoUrl ? new URL(organization.logoUrl, window.location.href).href : null;
  const organizationDetails = [
    organization?.legalName,
    organization?.inn ? `ИНН ${organization.inn}` : null,
    organization?.postalAddress || organization?.legalAddress,
  ].filter(Boolean).join(' · ');
  const patient = [stay.animal?.nickname, stay.animal?.species, stay.animal?.breed, stay.animal?.sex].filter(Boolean).join(' · ');
  const recordsMarkup = groups.length
    ? `<table class="treatment-summary">
        <thead><tr><th class="date-column">Дата</th><th>Выполнено</th></tr></thead>
        <tbody>${groups.map(renderOwnerReportDay).join('')}</tbody>
      </table>`
    : '<p class="empty">Выполненных лечебных действий пока нет.</p>';
  const stayPeriod = stay.completedAt
    ? `${formatDate(stay.startedAt, timeZone)} - ${formatDate(stay.completedAt, timeZone)}`
    : `с ${formatDate(stay.startedAt, timeZone)} · находится в стационаре`;

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(`Отчёт о лечении ${stay.animal?.nickname ?? 'пациента'}`)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 10mm 10mm 12mm; }
    body { margin: 0; color: #162f47; background: #fff; font: 9.5px/1.28 Arial, sans-serif; }
    .page { width: 100%; }
    .clinic { display: grid; grid-template-columns: ${logoUrl ? '14mm 1fr' : '1fr'}; gap: 3mm; align-items: center; padding-bottom: 2mm; border-bottom: 1.5px solid #173a5e; }
    .logo { width: 13mm; height: 13mm; object-fit: contain; }
    .brand { font-size: 14px; font-weight: 700; color: #173a5e; }
    .muted { color: #65798b; }
    h1 { margin: 3mm 0 2mm; font-size: 16px; color: #173a5e; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.2mm 4mm; padding: 2mm; background: #eef4f7; border: 1px solid #cbd8e2; }
    .meta div span { display: block; color: #65798b; font-size: 7px; text-transform: uppercase; }
    .meta div strong { display: block; margin-top: 0.4mm; font-size: 9.5px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .treatment-summary { margin-top: 3mm; }
    th, td { padding: 1mm 1.5mm; border: 1px solid #cbd8e2; vertical-align: top; }
    th { background: #e8eef5; color: #173a5e; text-align: left; font-size: 8px; }
    .date-column { width: 27mm; }
    .treatment-list { margin: 0; padding: 0 0 0 4mm; }
    .treatment-list li { margin: 0.4mm 0; }
    .signatures { display: grid; grid-template-columns: 2fr 1fr; gap: 20mm; margin-top: 7mm; page-break-inside: avoid; }
    .signature { padding-top: 5mm; border-top: 1px solid #173a5e; }
    tr { page-break-inside: avoid; }
    .empty { padding: 8mm; border: 1px solid #cbd8e2; text-align: center; }
  </style>
</head>
<body>
  <main class="page">
    <header class="clinic">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Логотип" />` : ''}
      <div><div class="brand">${escapeHtml(clinicName)}</div><div class="muted">${escapeHtml(clinicDescription)} · отчёт о лечении в стационаре</div>${organizationDetails ? `<div class="muted">${escapeHtml(organizationDetails)}</div>` : ''}</div>
    </header>
    <h1>Отчёт о лечении в стационаре</h1>
    <section class="meta">
      <div><span>Пациент</span><strong>${escapeHtml(patient || '-')}</strong></div>
      <div><span>Владелец</span><strong>${escapeHtml(stay.owner?.fullName ?? '-')}</strong></div>
      <div><span>Период пребывания</span><strong>${escapeHtml(stayPeriod)}</strong></div>
      <div><span>Причина помещения</span><strong>${escapeHtml(stay.exam?.purpose ?? stay.purpose ?? '-')}</strong></div>
    </section>
    ${recordsMarkup}
    <section class="signatures"><div class="signature">Представитель клиники / подпись</div><div class="signature">Дата</div></section>
  </main>
  <script>
    (() => {
      const logo = document.querySelector('.logo');
      const print = () => window.setTimeout(() => window.print(), 100);
      if (!logo || logo.complete) print();
      else { logo.addEventListener('load', print, { once: true }); logo.addEventListener('error', print, { once: true }); }
    })();
  </script>
</body>
</html>`);
  printWindow.document.close();
  return true;
}

type OwnerReportGroup = {
  key: string;
  label: string;
  items: string[];
};

export function groupOwnerReportRecords(records: HospitalRecord[], timeZone: string): OwnerReportGroup[] {
  const completed = records
    .filter((record) => record.recordStatus === 'COMPLETED' && record.recordType !== 'TEMPERATURE')
    .sort((left, right) => new Date(left.completedAt ?? left.recordedAt).getTime() - new Date(right.completedAt ?? right.recordedAt).getTime());
  const days = new Map<string, {
    date: Date;
    products: Map<string, { title: string; quantity: number; unit: string }>;
    otherItems: Set<string>;
  }>();

  for (const record of completed) {
    const effective = record.amendments?.at(-1) ?? record;
    const completedAt = new Date(record.completedAt ?? record.recordedAt);
    const dayKey = dateKey(completedAt, timeZone);
    const day = days.get(dayKey) ?? {
      date: completedAt,
      products: new Map<string, { title: string; quantity: number; unit: string }>(),
      otherItems: new Set<string>(),
    };
    const productAmount = readProductAmount(record);

    if (productAmount) {
      const productKey = `${productAmount.productId}:${productAmount.unit}:${effective.title}`;
      const current = day.products.get(productKey);
      day.products.set(productKey, {
        title: effective.title,
        unit: productAmount.unit,
        quantity: (current?.quantity ?? 0) + productAmount.quantity,
      });
    } else {
      const details = [effective.value, effective.notes].filter(Boolean).join(', ');
      day.otherItems.add(details ? `${effective.title} - ${details}` : effective.title);
    }
    days.set(dayKey, day);
  }

  return [...days.entries()].map(([key, day]) => ({
    key,
    label: new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(day.date),
    items: [
      ...[...day.products.values()].map((item) => `${item.title} - ${formatDecimalAmount(item.quantity)} ${item.unit}`),
      ...day.otherItems,
    ],
  }));
}

function renderOwnerReportDay(group: OwnerReportGroup) {
  return `<tr>
    <td><strong>${escapeHtml(group.label)}</strong></td>
    <td><ul class="treatment-list">${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></td>
  </tr>`;
}

function readProductAmount(record: HospitalRecord) {
  if (record.billItem?.productId) {
    const unit = record.billItem.product?.writeOffUnit || record.billItem.product?.stockUnit || 'ед.';
    const quantity = Number(record.billItem.stockQuantity ?? record.billItem.quantity);
    return Number.isFinite(quantity) && quantity > 0
      ? { productId: record.billItem.productId, quantity, unit }
      : null;
  }
  if (record.plannedProductId && record.plannedStockQuantity !== null && record.plannedStockQuantity !== undefined) {
    const unit = record.plannedProduct?.writeOffUnit || record.plannedProduct?.stockUnit || 'ед.';
    const quantity = Number(record.plannedStockQuantity);
    return Number.isFinite(quantity) && quantity > 0
      ? { productId: record.plannedProductId, quantity, unit }
      : null;
  }
  return null;
}

function formatDecimalAmount(value: number) {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value);
}

function dateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
