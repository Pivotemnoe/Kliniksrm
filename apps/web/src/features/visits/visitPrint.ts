import { appConfig } from '../../app/config';
import { formatDateTime } from '../../shared/utils/date';
import { formatMoney } from '../../shared/utils/money';
import type { OrganizationSettings } from '../organization/types';
import { Visit, VisitRecommendationInput, visitTypeLabels } from './types';

export function printVisitSheet(visit: Visit, organization?: OrganizationSettings | null) {
  openPrintWindow({
    title: `Лист приёма ${visit.animal.nickname}`,
    heading: 'Лист приёма',
    visit,
    organization,
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

export function printVisitRecommendation(
  visit: Visit,
  recommendation?: VisitRecommendationInput,
  organization?: OrganizationSettings | null,
) {
  openPrintWindow({
    title: `Назначения ${visit.animal.nickname}`,
    heading: 'Лист назначений',
    visit,
    organization,
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
  organization,
  sections,
  compactMeta = [],
}: {
  title: string;
  heading: string;
  visit: Visit;
  organization?: OrganizationSettings | null;
  sections: PrintSection[];
  compactMeta?: Array<[string, string]>;
}) {
  const printWindow = window.open('', '_blank', 'width=940,height=760');
  if (!printWindow) {
    return;
  }

  const animalLine = [formatSpecies(visit.animal.species), visit.animal.nickname, visit.animal.breed].filter(Boolean).join(' · ');
  const doctor = visit.employee?.fullName ?? '—';
  const logoUrl = organization?.logoUrl ? new URL(organization.logoUrl, window.location.href).href : null;
  const clinicName = organization?.displayName?.trim() || appConfig.brandName;
  const clinicDescription = organization?.orgType?.trim() || 'Ветеринарная клиника';
  const clinicDetails = formatOrganizationDetails(organization);
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
    @page { size: A4; margin: 0; }
    body { margin: 0; color: #111827; background: #ffffff; font: 13px/1.4 Arial, sans-serif; }
    .page { max-width: 860px; margin: 0 auto; padding: 10mm 12mm 13mm; }
    .header { padding-bottom: 10px; border-bottom: 1.5px solid #1f2937; }
    .header.with-logo { display: grid; grid-template-columns: 76px 1fr; gap: 13px; align-items: center; }
    .logo-box { display: grid; place-items: center; width: 72px; height: 72px; }
    .logo { display: block; width: 72px; height: 72px; object-fit: contain; }
    .brand { font-size: 19px; line-height: 1.15; font-weight: 700; }
    .clinic-details { margin-top: 3px; font-size: 11px; line-height: 1.3; }
    .muted { color: #6b7280; }
    h1 { margin: 14px 0 10px; font-size: 22px; line-height: 1.2; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 7px 18px; margin: 0 0 12px; padding: 11px 12px; border: 1px solid #d1d5db; border-radius: 7px; }
    .meta-row span, .compact-meta span { display: block; color: #6b7280; font-size: 11px; text-transform: uppercase; }
    .meta-row strong, .compact-meta strong { display: block; margin-top: 2px; font-size: 14px; }
    .compact-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .compact-meta div { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 7px; }
    .section { margin-top: 11px; page-break-inside: avoid; }
    .section h2 { margin: 0 0 5px; font-size: 15px; }
    .text { min-height: 38px; padding: 9px 10px; border: 1px solid #e5e7eb; border-radius: 7px; white-space: pre-wrap; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 31px; page-break-inside: avoid; }
    .signature { padding-top: 22px; border-top: 1px solid #111827; color: #374151; font-size: 12px; }
    @media print { html, body { width: 210mm; } .page { padding: 10mm 12mm 13mm; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header${logoUrl ? ' with-logo' : ''}">
      ${logoUrl ? `<div class="logo-box"><img class="logo" src="${escapeHtml(logoUrl)}" alt="Логотип клиники" /></div>` : ''}
      <div>
        <div class="brand">${escapeHtml(clinicName)}</div>
        <div class="muted">${escapeHtml(clinicDescription)} · документ приёма</div>
        ${clinicDetails ? `<div class="clinic-details">${escapeHtml(clinicDetails)}</div>` : ''}
      </div>
    </section>
    <h1>${escapeHtml(heading)}</h1>
    <section class="meta">
      <div class="meta-row"><span>Дата приёма</span><strong>${escapeHtml(formatDateTime(visit.startedAt))}</strong></div>
      <div class="meta-row"><span>Врач</span><strong>${escapeHtml(doctor)}</strong></div>
      <div class="meta-row"><span>Владелец</span><strong>${escapeHtml(visit.owner.fullName)}</strong></div>
      <div class="meta-row"><span>Пациент</span><strong>${escapeHtml(animalLine || '—')}</strong></div>
    </section>
    ${compactMetaMarkup}
    ${renderedSections || '<section class="section"><div class="text">Данные приёма пока не заполнены</div></section>'}
    <section class="signatures">
      <div class="signature">Подпись владельца</div>
      <div class="signature">Подпись врача</div>
    </section>
  </main>
  <script>
    (() => {
      const logo = document.querySelector('.logo');
      let printStarted = false;

      const printWhenReady = () => {
        if (printStarted) return;
        printStarted = true;
        window.setTimeout(() => window.print(), 80);
      };
      const hideBrokenLogo = () => {
        if (logo?.parentElement) logo.parentElement.remove();
        document.querySelector('.header')?.classList.remove('with-logo');
        printWhenReady();
      };

      if (!logo) {
        printWhenReady();
      } else if (logo.complete) {
        logo.naturalWidth > 0 ? printWhenReady() : hideBrokenLogo();
      } else {
        logo.addEventListener('load', printWhenReady, { once: true });
        logo.addEventListener('error', hideBrokenLogo, { once: true });
        window.setTimeout(() => {
          if (!logo.complete || logo.naturalWidth === 0) hideBrokenLogo();
        }, 2000);
      }
    })();
  </script>
</body>
</html>`);
  printWindow.document.close();
}

function formatOrganizationDetails(organization?: OrganizationSettings | null) {
  if (!organization) {
    return '';
  }

  const legalIdentity = organization.legalName?.trim() || organization.orgType?.trim() || null;
  const inn = organization.inn?.trim() ? `ИНН ${organization.inn.trim()}` : null;
  const address = (organization.postalAddress || organization.legalAddress)?.trim() || null;

  return [legalIdentity, inn, address].filter(Boolean).join(' · ');
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
