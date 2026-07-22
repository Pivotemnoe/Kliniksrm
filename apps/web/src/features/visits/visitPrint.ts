import { appConfig } from '../../app/config';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import { Visit, VisitRecommendationInput, visitTypeLabels } from './types';

export function printVisitSheet(visit: Visit) {
  openPrintWindow({
    title: `Лист приёма ${visit.animal.nickname}`,
    heading: 'Лист приёма',
    visit,
    sections: [
      { title: 'Анамнез', body: visit.exam?.anamnesis },
      { title: 'Осмотр', body: visit.exam?.examination },
      { title: 'Симптомы', body: visit.exam?.symptoms },
      { title: 'Манипуляции', body: visit.exam?.manipulations },
      { title: 'Диагнозы', body: formatDiagnoses(visit) },
      { title: 'План лечения', body: visit.recommendation?.treatmentPlan },
      { title: 'Рекомендации владельцу', body: visit.recommendation?.careNotes },
      { title: 'Товары и услуги', body: formatServices(visit) },
    ],
    compactMeta: [
      ['Вес', visit.exam?.weightKg ? `${visit.exam.weightKg} кг` : '—'],
      ['Температура', visit.exam?.temperatureC ? `${visit.exam.temperatureC} °C` : '—'],
      ['Прием', visit.visitType ? visitTypeLabels[visit.visitType] : '—'],
      ['Стоимость', formatMoney(visit.totalAmount)],
    ],
  });
}

export function printVisitRecommendation(visit: Visit, recommendation?: VisitRecommendationInput) {
  openPrintWindow({
    title: `Назначения ${visit.animal.nickname}`,
    heading: 'Лист назначений',
    visit,
    sections: [
      { title: 'Диагнозы', body: formatDiagnoses(visit) },
      { title: 'План лечения', body: recommendation?.treatmentPlan ?? visit.recommendation?.treatmentPlan },
      { title: 'Рекомендации владельцу', body: recommendation?.careNotes ?? visit.recommendation?.careNotes },
      { title: 'Товары и услуги', body: formatServices(visit) },
    ],
  });
}

type PrintSection = {
  title: string;
  body?: string | number | null;
};

function openPrintWindow({
  title,
  heading,
  visit,
  sections,
  compactMeta = [],
}: {
  title: string;
  heading: string;
  visit: Visit;
  sections: PrintSection[];
  compactMeta?: Array<[string, string]>;
}) {
  const printWindow = window.open('', '_blank', 'width=940,height=760');
  if (!printWindow) {
    return;
  }

  const animalLine = [formatSpecies(visit.animal.species), visit.animal.nickname, visit.animal.breed].filter(Boolean).join(' · ');
  const ownerPhone = visit.owner.phone ?? visit.owner.extraPhone ?? '—';
  const doctor = visit.employee?.fullName ?? '—';
  const printedAt = formatDateTime(new Date().toISOString());
  const renderedSections = sections
    .filter((section) => section.body !== undefined && section.body !== null && String(section.body).trim() !== '')
    .map(
      (section) => `
        <section class="section">
          <h2>${escapeHtml(section.title)}</h2>
          <div class="text">${escapeHtml(String(section.body))}</div>
        </section>`,
    )
    .join('');
  const compactMetaMarkup = compactMeta.length
    ? `<section class="compact-meta">${compactMeta
        .map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join('')}</section>`
    : '';

  printWindow.document.write(`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #ffffff; font: 14px/1.45 Arial, sans-serif; }
    .page { max-width: 860px; margin: 0 auto; padding: 26px 34px 40px; }
    .header { display: grid; grid-template-columns: 72px 1fr; gap: 16px; align-items: center; padding-bottom: 16px; border-bottom: 2px solid #1f2937; }
    .logo { width: 68px; height: 68px; object-fit: contain; }
    .brand { font-size: 23px; font-weight: 700; }
    .muted { color: #6b7280; }
    h1 { margin: 22px 0 14px; font-size: 25px; line-height: 1.2; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 20px; margin: 0 0 16px; padding: 14px; border: 1px solid #d1d5db; border-radius: 8px; }
    .meta-row span, .compact-meta span { display: block; color: #6b7280; font-size: 11px; text-transform: uppercase; }
    .meta-row strong, .compact-meta strong { display: block; margin-top: 2px; font-size: 14px; }
    .compact-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .compact-meta div { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .section { margin-top: 14px; page-break-inside: avoid; }
    .section h2 { margin: 0 0 7px; font-size: 16px; }
    .text { min-height: 48px; padding: 11px 12px; border: 1px solid #e5e7eb; border-radius: 8px; white-space: pre-wrap; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
    .signature { padding-top: 28px; border-top: 1px solid #111827; color: #374151; font-size: 13px; }
    @media print { .page { padding: 14mm 13mm; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <img class="logo" src="${escapeHtml(appConfig.logoUrl)}" alt="${escapeHtml(appConfig.brandName)}" />
      <div>
        <div class="brand">${escapeHtml(appConfig.brandName)}</div>
        <div class="muted">Документ приёма ветеринарной клиники</div>
      </div>
    </section>
    <h1>${escapeHtml(heading)}</h1>
    <section class="meta">
      <div class="meta-row"><span>Дата приёма</span><strong>${escapeHtml(formatDateTime(visit.startedAt))}</strong></div>
      <div class="meta-row"><span>Врач</span><strong>${escapeHtml(doctor)}</strong></div>
      <div class="meta-row"><span>Владелец</span><strong>${escapeHtml(visit.owner.fullName)}</strong></div>
      <div class="meta-row"><span>Телефон</span><strong>${escapeHtml(ownerPhone)}</strong></div>
      <div class="meta-row"><span>Пациент</span><strong>${escapeHtml(animalLine || '—')}</strong></div>
      <div class="meta-row"><span>Напечатано</span><strong>${escapeHtml(printedAt)}</strong></div>
      <div class="meta-row"><span>Напечатал</span><strong>${escapeHtml(doctor)}</strong></div>
    </section>
    ${compactMetaMarkup}
    ${renderedSections || '<section class="section"><div class="text">Данные приёма пока не заполнены</div></section>'}
    <section class="signatures">
      <div class="signature">Подпись владельца</div>
      <div class="signature">Подпись врача</div>
    </section>
  </main>
  <script>window.print();</script>
</body>
</html>`);
  printWindow.document.close();
}

function formatDiagnoses(visit: Visit) {
  return visit.diagnoses.length
    ? visit.diagnoses.map((diagnosis) => [diagnosis.title, diagnosis.diagnosisType, diagnosis.status].filter(Boolean).join(' · ')).join('\n')
    : 'Диагнозы не указаны';
}

function formatServices(visit: Visit) {
  return visit.bill?.items?.length
    ? visit.bill.items.map((item) => `${item.title} — ${item.quantity} × ${formatMoney(item.unitPrice)}`).join('\n')
    : '';
}

function formatSpecies(species?: string | null) {
  if (!species) {
    return null;
  }

  return speciesLabels[species] ?? species;
}

const speciesLabels: Record<string, string> = {
  CAT: 'Кошка',
  DOG: 'Собака',
  BIRD: 'Птица',
  REPTILE: 'Рептилия',
  RODENT: 'Грызун',
  RABBIT: 'Кролик',
  HORSE: 'Лошадь',
  OTHER: 'Другое',
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
