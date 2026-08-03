import { appConfig } from '../../app/config';
import type { OrganizationSettings } from '../organization/types';
import { groupHospitalRecords } from './HospitalSheet';
import type { HospitalRecord, HospitalStay } from './types';

export function printHospitalSheet(stay: HospitalStay, organization?: OrganizationSettings | null) {
  const printWindow = window.open('', '_blank', 'width=1100,height=820');
  if (!printWindow) return false;

  const timeZone = stay.timezone || 'Europe/Moscow';
  const groups = groupHospitalRecords(stay.hospitalRecords ?? [], timeZone);
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
    ? groups.map((group) => `
      <section class="day">
        <h2>${escapeHtml(group.label)}</h2>
        <table>
          <thead><tr><th class="time">Время</th><th class="status">План / факт</th><th>Назначение и результат</th><th class="employee">Исполнитель</th></tr></thead>
          <tbody>${group.records.map((record) => renderRecord(record, timeZone)).join('')}</tbody>
        </table>
      </section>`).join('')
    : '<p class="empty">Лист стационара пока не заполнен.</p>';
  const temperatureMarkup = renderTemperatureChart(stay.hospitalRecords ?? [], timeZone);

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(`Лист стационара ${stay.animal?.nickname ?? 'пациента'}`)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 10mm 10mm 12mm; }
    body { margin: 0; color: #162f47; background: #fff; font: 10.5px/1.35 Arial, sans-serif; }
    .page { width: 100%; }
    .clinic { display: grid; grid-template-columns: ${logoUrl ? '18mm 1fr' : '1fr'}; gap: 4mm; align-items: center; padding-bottom: 3mm; border-bottom: 1.5px solid #173a5e; }
    .logo { width: 17mm; height: 17mm; object-fit: contain; }
    .brand { font-size: 16px; font-weight: 700; color: #173a5e; }
    .muted { color: #65798b; }
    h1 { margin: 5mm 0 3mm; font-size: 20px; color: #173a5e; }
    h2 { margin: 5mm 0 2mm; font-size: 13px; color: #2e74b5; text-transform: capitalize; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2mm 5mm; padding: 3mm; background: #eef4f7; border: 1px solid #cbd8e2; }
    .meta div span { display: block; color: #65798b; font-size: 8px; text-transform: uppercase; }
    .meta div strong { display: block; margin-top: 1mm; font-size: 10.5px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 2mm; border: 1px solid #cbd8e2; vertical-align: top; }
    th { background: #e8eef5; color: #173a5e; text-align: left; font-size: 9px; }
    .time { width: 19mm; } .status { width: 24mm; } .employee { width: 37mm; }
    .tag { display: inline-block; padding: 0.4mm 1.5mm; border-radius: 2mm; background: #e7f3f3; color: #1f7a83; font-weight: 700; font-size: 8.5px; }
    .result { margin-top: 1mm; white-space: pre-wrap; }
    .note { margin-top: 1mm; color: #65798b; white-space: pre-wrap; }
    .amendment { margin-top: 2mm; padding: 2mm; border-left: 2px solid #7c3aed; background: #f5f0ff; }
    .chart { margin-top: 4mm; padding: 3mm; border: 1px solid #cbd8e2; page-break-inside: avoid; }
    .chart h2 { margin-top: 0; }
    .chart svg { display: block; width: 100%; height: 42mm; }
    .chart-grid { stroke: #dbe4ea; stroke-width: 1; } .chart-line { fill: none; stroke: #1f7a83; stroke-width: 2.5; } .chart-point { fill: #fff; stroke: #1f7a83; stroke-width: 2; }
    .chart-label { fill: #65798b; font: 9px Arial, sans-serif; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20mm; margin-top: 10mm; page-break-inside: avoid; }
    .signature { padding-top: 7mm; border-top: 1px solid #173a5e; }
    .day { page-break-inside: auto; } tr { page-break-inside: avoid; }
    .empty { padding: 8mm; border: 1px solid #cbd8e2; text-align: center; }
  </style>
</head>
<body>
  <main class="page">
    <header class="clinic">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Логотип" />` : ''}
      <div><div class="brand">${escapeHtml(clinicName)}</div><div class="muted">${escapeHtml(clinicDescription)} · полный лист стационара</div>${organizationDetails ? `<div class="muted">${escapeHtml(organizationDetails)}</div>` : ''}</div>
    </header>
    <h1>Полный лист стационара</h1>
    <section class="meta">
      <div><span>Пациент</span><strong>${escapeHtml(patient || '—')}</strong></div>
      <div><span>Владелец</span><strong>${escapeHtml(stay.owner?.fullName ?? '—')}</strong></div>
      <div><span>Поступление</span><strong>${escapeHtml(formatDateTime(stay.startedAt, timeZone))}</strong></div>
      <div><span>Выписка / статус</span><strong>${escapeHtml(stay.completedAt ? formatDateTime(stay.completedAt, timeZone) : 'Находится в стационаре')}</strong></div>
      <div><span>Бокс</span><strong>${escapeHtml(stay.hospitalBox?.name ?? '—')}</strong></div>
      <div><span>Ответственный</span><strong>${escapeHtml(stay.employee?.fullName ?? '—')}</strong></div>
      <div><span>Причина помещения</span><strong>${escapeHtml(stay.exam?.purpose ?? stay.purpose ?? '—')}</strong></div>
      <div><span>Сформировано</span><strong>${escapeHtml(formatDateTime(new Date().toISOString(), timeZone))}</strong></div>
    </section>
    ${temperatureMarkup}
    ${recordsMarkup}
    <section class="signatures"><div class="signature">Проверил врач / подпись</div><div class="signature">Дата и время проверки</div></section>
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

function renderRecord(record: HospitalRecord, timeZone: string) {
  const status = record.createdAsPlan && record.recordStatus === 'COMPLETED'
    ? 'План выполнен'
    : ({ PLANNED: 'План', COMPLETED: 'Факт', SKIPPED: 'Пропущено', AMENDMENT: 'Исправление' } as const)[record.recordStatus];
  const result = [
    record.temperatureC !== null ? `${record.temperatureC} °C` : null,
    record.value,
    record.notes,
    record.billItem ? `${record.billItem.title}: ${record.billItem.quantity} × ${record.billItem.unitPrice} ₽` : null,
  ].filter(Boolean).join('\n');
  const amendments = record.amendments?.map((amendment) => `
    <div class="amendment"><strong>Исправление ${escapeHtml(formatDateTime(amendment.recordedAt, timeZone))}</strong><br />Причина: ${escapeHtml(amendment.amendmentReason ?? '—')}<div class="result">${escapeHtml([amendment.temperatureC !== null ? `${amendment.temperatureC} °C` : null, amendment.value, amendment.notes].filter(Boolean).join('\n'))}</div></div>`).join('') ?? '';
  return `<tr>
    <td><strong>${escapeHtml(formatTime(record.recordedAt, timeZone))}</strong>${record.completedAt && record.createdAsPlan ? `<div class="note">Факт: ${escapeHtml(formatTime(record.completedAt, timeZone))}</div>` : ''}</td>
    <td><span class="tag">${escapeHtml(status)}</span><div class="note">${escapeHtml(recordTypeLabels[record.recordType])}</div></td>
    <td><strong>${escapeHtml(record.title)}</strong><div class="result">${escapeHtml(result || (record.recordStatus === 'PLANNED' ? 'Ожидает выполнения' : '—'))}</div>${amendments}</td>
    <td>${escapeHtml(record.recordedBy?.fullName ?? 'Сотрудник не указан')}</td>
  </tr>`;
}

function renderTemperatureChart(records: HospitalRecord[], timeZone: string) {
  const points = records
    .filter((record) => record.recordStatus !== 'PLANNED' && record.temperatureC !== null)
    .map((record) => ({ at: record.completedAt ?? record.recordedAt, value: Number(record.temperatureC) }))
    .filter((point) => Number.isFinite(point.value))
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  if (!points.length) return '';
  const width = 760;
  const height = 180;
  const left = 40;
  const right = 15;
  const top = 14;
  const bottom = 34;
  const values = points.map((point) => point.value);
  const min = Math.min(36, Math.floor(Math.min(...values) * 2) / 2);
  const max = Math.max(40, Math.ceil(Math.max(...values) * 2) / 2);
  const span = Math.max(max - min, 1);
  const x = (index: number) => left + (points.length === 1 ? (width - left - right) / 2 : index * (width - left - right) / (points.length - 1));
  const y = (value: number) => top + (max - value) * (height - top - bottom) / span;
  const ticks = Array.from({ length: 5 }, (_, index) => min + span * index / 4);
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.value)}`).join(' ');
  return `<section class="chart"><h2>Температура за всё пребывание</h2><svg viewBox="0 0 ${width} ${height}">
    ${ticks.map((tick) => `<line class="chart-grid" x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}" /><text class="chart-label" x="${left - 6}" y="${y(tick) + 3}" text-anchor="end">${tick.toFixed(1)}</text>`).join('')}
    <path class="chart-line" d="${path}" />
    ${points.map((point, index) => `<circle class="chart-point" cx="${x(index)}" cy="${y(point.value)}" r="4" /><text class="chart-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${escapeHtml(formatShortDateTime(point.at, timeZone))}</text>`).join('')}
  </svg></section>`;
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatShortDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

const recordTypeLabels = {
  TEMPERATURE: 'Температура',
  MEDICATION: 'Препарат / инъекция',
  PROCEDURE: 'Процедура',
  OBSERVATION: 'Наблюдение',
  FEEDING: 'Кормление',
  CARE: 'Уход',
  OTHER: 'Другая запись',
} as const;
