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
  const printWindow = window.open('', '_blank', 'width=1180,height=820');
  if (!printWindow) return false;

  const timeZone = stay.timezone || 'Europe/Moscow';
  const printedAt = new Date();
  const assignments = groupHospitalBoxAssignments(stay.hospitalRecords ?? [], timeZone);
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
  const patientState = [
    stay.animal?.status ? `Состояние: ${stay.animal.status}` : null,
    stay.exam?.weightKg !== null && stay.exam?.weightKg !== undefined ? `Вес: ${formatDecimalAmount(Number(stay.exam.weightKg))} кг` : null,
    stay.exam?.temperatureC !== null && stay.exam?.temperatureC !== undefined ? `Температура при приёме: ${formatDecimalAmount(Number(stay.exam.temperatureC))} °C` : null,
  ].filter(Boolean).join(' · ');
  const instructions = [stay.recommendation?.treatmentPlan, stay.recommendation?.careNotes]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join('\n');
  const overdueCount = assignments.reduce((total, group) => total + group.occurrences.filter((item) => item.overdue).length, 0);
  const assignmentMarkup = assignments.length
    ? `<section class="assignment-grid">${assignments.map(renderHospitalBoxAssignment).join('')}</section>`
    : '<div class="empty">Назначений, ожидающих выполнения, нет.</div>';

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(`Лист для бокса — ${patientName}`)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 landscape; margin: 7mm; }
    body { margin: 0; color: #102a43; background: #fff; font: 8.5px/1.22 Arial, sans-serif; }
    .page { width: 100%; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) 58mm; gap: 4mm; align-items: stretch; }
    .patient-card { border: 1.5px solid #173a5e; padding: 3mm; }
    .clinic-line { display: flex; gap: 2.5mm; align-items: center; padding-bottom: 2mm; border-bottom: 1px solid #c8d5df; }
    .logo { width: 10mm; height: 10mm; object-fit: contain; }
    .clinic { font-size: 10px; font-weight: 700; }
    .document-name { color: #5f7385; }
    .patient-name { margin-top: 2.5mm; font-size: 23px; line-height: 1; font-weight: 800; color: #173a5e; }
    .patient-details { margin-top: 1.5mm; font-size: 10px; font-weight: 700; }
    .box-card { display: grid; place-items: center; align-content: center; border: 2px solid #173a5e; text-align: center; padding: 3mm; }
    .box-label { color: #5f7385; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; }
    .box-name { margin-top: 2mm; font-size: 26px; line-height: 1; font-weight: 900; color: #173a5e; }
    .meta { display: grid; grid-template-columns: 1.15fr 1fr 1fr 1.3fr; gap: 1px; margin-top: 2.5mm; background: #c8d5df; border: 1px solid #c8d5df; }
    .meta-item { min-height: 12mm; padding: 1.7mm 2mm; background: #f3f7fa; }
    .meta-label { display: block; color: #5f7385; font-size: 6.8px; text-transform: uppercase; }
    .meta-value { display: block; margin-top: .8mm; font-size: 8.5px; font-weight: 700; white-space: pre-wrap; }
    .wide { grid-column: span 2; }
    .full { grid-column: 1 / -1; }
    .section-title { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; margin: 3mm 0 1.5mm; padding-bottom: 1mm; border-bottom: 1.5px solid #173a5e; }
    .section-title h1 { margin: 0; font-size: 14px; color: #173a5e; }
    .section-summary { color: #5f7385; font-size: 8px; }
    .overdue-summary { color: #a61d24; font-weight: 700; }
    .assignment-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm; align-items: start; }
    .assignment-card { break-inside: avoid; border: 1px solid #9fb2c1; padding: 1.7mm; }
    .assignment-head { display: flex; align-items: baseline; gap: 2mm; }
    .type { flex: 0 0 auto; padding: .5mm 1.2mm; border-radius: 2mm; background: #e9f1f7; color: #315875; font-size: 6.8px; font-weight: 700; text-transform: uppercase; }
    .assignment-title { font-size: 9px; font-weight: 800; }
    .assignment-details { margin: 1mm 0; color: #425b70; white-space: pre-wrap; }
    .assigned-by { color: #667f91; font-size: 7px; }
    .slots { display: grid; gap: .8mm; margin-top: 1.2mm; }
    .slot { display: grid; grid-template-columns: 4.2mm 31mm minmax(0, 1fr); gap: 1.4mm; align-items: center; min-height: 6.2mm; padding: .7mm 1mm; background: #f8fafc; border: 1px solid #d6e0e8; }
    .slot.overdue { border-color: #d8898d; background: #fff7f7; }
    .paper-check { width: 4.2mm; height: 4.2mm; border: 1.2px solid #173a5e; background: #fff; }
    .slot-time { font-size: 8px; }
    .write-line { height: 4mm; border-bottom: 1px solid #8095a5; color: #8095a5; text-align: right; font-size: 6.5px; }
    .empty { margin-top: 2mm; padding: 8mm; border: 1px solid #c8d5df; text-align: center; font-size: 11px; }
    .footer { display: flex; justify-content: space-between; gap: 6mm; margin-top: 2.5mm; padding-top: 1.5mm; border-top: 1px solid #c8d5df; color: #5f7385; font-size: 7px; }
    .warning { font-weight: 700; color: #3b5265; }
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
      </div>
      <div class="box-card"><div class="box-label">Бокс / место</div><div class="box-name">${escapeHtml(boxName)}</div></div>
    </section>
    <section class="meta">
      <div class="meta-item"><span class="meta-label">Владелец</span><span class="meta-value">${escapeHtml(stay.owner?.fullName ?? '—')}</span></div>
      <div class="meta-item"><span class="meta-label">Ответственный</span><span class="meta-value">${escapeHtml(stay.employee?.fullName ?? 'Не назначен')}</span></div>
      <div class="meta-item"><span class="meta-label">Поступил</span><span class="meta-value">${escapeHtml(formatBoxDateTime(stay.startedAt, timeZone))}</span></div>
      <div class="meta-item"><span class="meta-label">Распечатано</span><span class="meta-value">${escapeHtml(formatBoxDateTime(printedAt.toISOString(), timeZone))}</span></div>
      <div class="meta-item wide"><span class="meta-label">Причина помещения</span><span class="meta-value">${escapeHtml(stay.exam?.purpose ?? stay.purpose ?? '—')}</span></div>
      <div class="meta-item wide"><span class="meta-label">Состояние пациента</span><span class="meta-value">${escapeHtml(patientState || '—')}</span></div>
      ${instructions ? `<div class="meta-item full"><span class="meta-label">План лечения / уход</span><span class="meta-value">${escapeHtml(instructions)}</span></div>` : ''}
    </section>
    <div class="section-title">
      <h1>Назначения, ожидающие выполнения</h1>
      <div class="section-summary">${assignments.reduce((total, group) => total + group.occurrences.length, 0)} отметок${overdueCount ? ` · <span class="overdue-summary">просрочено ${overdueCount}</span>` : ''}</div>
    </div>
    ${assignmentMarkup}
    <footer class="footer"><span class="warning">□ — выполнено; рядом укажите фактическое время и инициалы.</span><span>Бумажная отметка не заменяет запись выполнения в CRM.</span></footer>
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
  type: string;
  title: string;
  details: string;
  assignedBy: string;
  occurrences: Array<{ key: string; label: string; overdue: boolean }>;
};

export function groupHospitalBoxAssignments(records: HospitalRecord[], timeZone: string, now = new Date()): HospitalBoxAssignmentGroup[] {
  const groups = new Map<string, HospitalBoxAssignmentGroup>();
  const planned = records
    .filter((record) => record.recordStatus === 'PLANNED')
    .sort((left, right) => new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime());

  for (const record of planned) {
    const effective = record.amendments?.at(-1) ?? record;
    const details = formatHospitalBoxAssignmentDetails(effective);
    const title = effective.title.trim() || 'Назначение';
    const groupKey = [record.treatmentPlanItemId ?? '', effective.recordType, title, details].join('|');
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      type: hospitalRecordTypeLabels[effective.recordType],
      title,
      details,
      assignedBy: record.recordedBy?.fullName ?? '—',
      occurrences: [],
    };
    group.occurrences.push({
      key: record.id,
      label: formatBoxDateTime(record.recordedAt, timeZone),
      overdue: new Date(record.recordedAt).getTime() < now.getTime(),
    });
    groups.set(groupKey, group);
  }

  return [...groups.values()];
}

function renderHospitalBoxAssignment(group: HospitalBoxAssignmentGroup) {
  return `<article class="assignment-card">
    <div class="assignment-head"><span class="type">${escapeHtml(group.type)}</span><span class="assignment-title">${escapeHtml(group.title)}</span></div>
    ${group.details ? `<div class="assignment-details">${escapeHtml(group.details)}</div>` : ''}
    <div class="assigned-by">Назначил: ${escapeHtml(group.assignedBy)}</div>
    <div class="slots">${group.occurrences.map((occurrence) => `<div class="slot${occurrence.overdue ? ' overdue' : ''}"><span class="paper-check"></span><strong class="slot-time">${escapeHtml(occurrence.label)}</strong><span class="write-line">время / инициалы</span></div>`).join('')}</div>
  </article>`;
}

function formatHospitalBoxAssignmentDetails(record: HospitalRecord) {
  const details: string[] = [];
  if (record.plannedProductId) {
    const unit = record.plannedProduct?.writeOffUnit || record.plannedProduct?.stockUnit || 'ед.';
    details.push(`Препарат: ${record.plannedProduct?.title ?? record.title}; ${formatDecimalAmount(Number(record.plannedStockQuantity ?? record.plannedQuantity ?? 1))} ${unit}`);
  } else if (record.plannedServiceId) {
    details.push(`Услуга: ${record.plannedService?.title ?? record.title}; количество ${formatDecimalAmount(Number(record.plannedQuantity ?? 1))}`);
  }
  if (record.value?.trim()) details.push(record.value.trim());
  if (record.notes?.trim()) details.push(record.notes.trim());
  return [...new Set(details)].join(' · ');
}

const hospitalRecordTypeLabels: Record<HospitalRecord['recordType'], string> = {
  TEMPERATURE: 'Температура',
  MEDICATION: 'Препарат / инъекция',
  PROCEDURE: 'Процедура',
  OBSERVATION: 'Наблюдение',
  FEEDING: 'Кормление',
  CARE: 'Уход',
  OTHER: 'Другое',
};

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
