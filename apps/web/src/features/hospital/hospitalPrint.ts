import { appConfig } from '../../app/config';
import { formatAnimalAge } from '../../shared/utils/animalBirthDate';
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

export function printHospitalBoxSheet(stay: HospitalStay, organization?: OrganizationSettings | null) {
  const printWindow = window.open('', '_blank', 'width=760,height=900');
  if (!printWindow) return false;

  const timeZone = stay.timezone || 'Europe/Moscow';
  const printedAt = new Date();
  const records = stay.hospitalRecords ?? [];
  const assignments = groupHospitalBoxAssignments(records, timeZone, printedAt);
  const clinicName = organization?.displayName?.trim() || appConfig.brandName;
  const logoUrl = organization?.logoUrl ? new URL(organization.logoUrl, window.location.href).href : null;
  const boxName = stay.hospitalBox?.name?.trim() || 'Бокс не указан';
  const patientName = stay.animal?.nickname?.trim() || 'Пациент';
  const patientDetails = [
    formatSpecies(stay.animal?.species),
    stay.animal?.breed,
    formatSex(stay.animal?.sex),
    formatAnimalAge(stay.animal?.birthDate),
  ].filter(Boolean).join(' · ');
  const occurrences = assignments.flatMap((group) => group.occurrences);
  const assignmentMarkup = assignments.length
    ? `<section class="assignment-list">${assignments.map(renderHospitalBoxAssignment).join('')}</section>`
    : '<div class="empty">На этот день назначений нет.</div>';
  const sheetDate = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(printedAt);

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(`Лист для бокса — ${patientName}`)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A5 portrait; margin: 6mm; }
    body { margin: 0; color: #102a43; background: #fff; font: 9.5px/1.2 Arial, sans-serif; }
    .page { width: 100%; max-width: 136mm; margin: 0 auto; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) 38mm; gap: 2mm; align-items: stretch; }
    .patient-card { min-width: 0; border: 1.2px solid #173a5e; padding: 2mm; }
    .clinic-line { display: flex; gap: 2mm; align-items: center; padding-bottom: 1.3mm; border-bottom: 1px solid #c8d5df; }
    .logo { width: 8mm; height: 8mm; object-fit: contain; }
    .clinic { font-size: 9.5px; font-weight: 700; }
    .document-name { color: #5f7385; font-size: 7.5px; }
    .patient-name { margin-top: 1.5mm; font-size: 18px; line-height: 1.05; font-weight: 800; color: #173a5e; overflow-wrap: anywhere; }
    .patient-details { margin-top: 1mm; font-size: 9px; font-weight: 700; }
    .owner { margin-top: .7mm; color: #5f7385; font-size: 8px; }
    .box-card { min-width: 0; display: grid; place-items: center; align-content: center; border: 1.5px solid #173a5e; text-align: center; padding: 1.5mm; }
    .box-label { color: #5f7385; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; }
    .box-name { margin-top: 1mm; font-size: 17px; line-height: 1.05; font-weight: 900; color: #173a5e; overflow-wrap: anywhere; }
    .section-title { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; margin: 2mm 0 1mm; padding-bottom: .8mm; border-bottom: 1.2px solid #173a5e; }
    .section-title h1 { margin: 0; font-size: 12px; color: #173a5e; }
    .section-summary { color: #5f7385; font-size: 8px; }
    .assignment-list { border: 1px solid #9fb2c1; }
    .assignment-row { display: grid; grid-template-columns: 20mm minmax(0, 1fr) 5mm; gap: 2mm; align-items: center; min-height: 7mm; padding: 1mm 1.5mm; border-bottom: 1px solid #d6e0e8; break-inside: avoid; }
    .assignment-row:last-child { border-bottom: 0; }
    .assignment-time { font-size: 9px; }
    .assignment-title { min-width: 0; font-size: 10px; font-weight: 700; overflow-wrap: anywhere; }
    .paper-check { width: 4.2mm; height: 4.2mm; margin: 0; accent-color: #173a5e; }
    .empty { margin-top: 2mm; padding: 8mm; border: 1px solid #c8d5df; text-align: center; font-size: 11px; }
    .footer { margin-top: 1.5mm; color: #5f7385; font-size: 7px; }
  </style>
</head>
<body>
  <main class="page">
    <section class="top">
      <div class="patient-card">
        <div class="clinic-line">
          ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Логотип" />` : ''}
          <div><div class="clinic">${escapeHtml(clinicName)}</div><div class="document-name">Внутренний лист стационара — не для клиента</div></div>
        </div>
        <div class="patient-name">${escapeHtml(patientName)}</div>
        <div class="patient-details">${escapeHtml(patientDetails || 'Данные пациента не указаны')}</div>
        <div class="owner">Владелец: ${escapeHtml(stay.owner?.fullName ?? '—')}</div>
      </div>
      <div class="box-card"><div class="box-label">Бокс / место</div><div class="box-name">${escapeHtml(boxName)}</div></div>
    </section>
    <div class="section-title">
      <h1>Назначения на ${escapeHtml(sheetDate)}</h1>
      <div class="section-summary">${occurrences.length} поз.</div>
    </div>
    ${assignmentMarkup}
    <footer class="footer">Галочка показывает только факт выполнения. Подробности сохраняются в CRM.</footer>
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

type HospitalBoxAssignmentGroup = {
  key: string;
  title: string;
  occurrences: Array<{
    key: string;
    label: string;
    status: Extract<HospitalRecord['recordStatus'], 'PLANNED' | 'COMPLETED'>;
  }>;
};

export function groupHospitalBoxAssignments(records: HospitalRecord[], timeZone: string, now = new Date()): HospitalBoxAssignmentGroup[] {
  const groups = new Map<string, HospitalBoxAssignmentGroup>();
  const printable = records
    .filter((record): record is HospitalRecord & { recordStatus: 'PLANNED' | 'COMPLETED' } => record.recordStatus === 'PLANNED' || record.recordStatus === 'COMPLETED')
    .filter((record) => dateKey(new Date(record.recordedAt), timeZone) === dateKey(now, timeZone))
    .sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());

  for (const record of printable) {
    const effective = record.amendments?.at(-1) ?? record;
    const title = effective.plannedProduct?.title?.trim()
      || effective.plannedService?.title?.trim()
      || effective.billItem?.title?.trim()
      || effective.title.trim()
      || 'Назначение';
    const groupKey = [record.treatmentPlanItemId ?? '', effective.recordType, title].join('|');
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      title,
      occurrences: [],
    };
    group.occurrences.push({
      key: record.id,
      label: new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(record.recordedAt)),
      status: record.recordStatus,
    });
    groups.set(groupKey, group);
  }

  return [...groups.values()];
}

function renderHospitalBoxAssignment(group: HospitalBoxAssignmentGroup) {
  return group.occurrences.map((occurrence) => `<label class="assignment-row"><strong class="assignment-time">${escapeHtml(occurrence.label)}</strong><span class="assignment-title">${escapeHtml(group.title)}</span><input class="paper-check" type="checkbox"${occurrence.status === 'COMPLETED' ? ' checked' : ''} aria-label="${occurrence.status === 'COMPLETED' ? 'Выполнено' : 'Отметить выполнение'}" /></label>`).join('');
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

function formatBoxDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value)).replace(',', '');
}

function formatSpecies(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'DOG') return 'Собака';
  if (normalized === 'CAT') return 'Кошка';
  return value?.trim() ?? '';
}

function formatSex(value?: string | null) {
  if (value === 'MALE') return 'Самец';
  if (value === 'FEMALE') return 'Самка';
  return '';
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
