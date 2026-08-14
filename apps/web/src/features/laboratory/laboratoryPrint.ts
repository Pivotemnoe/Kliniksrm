import type { DocumentLayout } from '../documents/documentLayout';
import type { OrganizationPrintProfile } from '../organization/types';
import { formatDateTime } from '../../shared/utils/date';
import { laboratoryOrderStatusLabels, type VisitLaboratoryOrderStatus } from '../visits/types';
import type { LaboratoryFormSnapshot, LaboratoryOrderItem } from './types';

export type LaboratoryPrintOrder = {
  id: string;
  status: VisitLaboratoryOrderStatus;
  comment: string | null;
  completedAt: string | null;
  createdAt: string;
  formSnapshots: LaboratoryFormSnapshot[] | null;
  items: LaboratoryOrderItem[];
  visit: {
    owner: { fullName: string; phone: string | null };
    animal: { nickname: string; species: string | null; breed: string | null };
    employee: { fullName: string } | null;
  };
};

export function printLaboratoryOrder(
  order: LaboratoryPrintOrder,
  organization?: OrganizationPrintProfile | null,
) {
  const printWindow = window.open('', '_blank', 'width=760,height=900');
  if (!printWindow) return;

  printWindow.document.write(buildLaboratoryOrderPrintHtml(order, organization, window.location.href));
  printWindow.document.close();
}

export function buildLaboratoryOrderPrintHtml(
  order: LaboratoryPrintOrder,
  organization?: OrganizationPrintProfile | null,
  baseHref = 'http://localhost/',
) {
  const clinicName = organization?.displayName?.trim() || 'TemichevVet';
  const clinicAddress = organization?.offices?.[0]?.address || organization?.legalAddress || '';
  const clinicPhone = organization?.offices?.[0]?.phone || '';
  const logoUrl = organization?.logoUrl
    ? new URL(organization.logoUrl, baseHref).href
    : new URL('/brand/temichevvet-logo.jpg', baseHref).href;
  const snapshots = Array.isArray(order.formSnapshots) ? order.formSnapshots.filter(isLaboratoryFormSnapshot) : [];
  const pages = snapshots.length
    ? snapshots.map((snapshot) => renderSnapshotPage(snapshot, order, { clinicName, clinicAddress, clinicPhone, logoUrl })).join('')
    : renderGenericPage(order, { clinicName, clinicAddress, clinicPhone, logoUrl });

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(`Лабораторный бланк — ${order.visit.animal.nickname}`)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #142033; background: #fff; font: 8px/1.22 Arial, sans-serif; }
    .lab-page { width: 148mm; min-height: 210mm; margin: 0 auto; padding: 6mm; break-after: page; page-break-after: always; }
    .lab-page:last-child { break-after: auto; page-break-after: auto; }
    .lab-header { display: grid; grid-template-columns: 14mm 1fr; gap: 3mm; align-items: center; padding-bottom: 2.5mm; border-bottom: 1.2px solid #21848d; }
    .lab-logo { width: 13mm; height: 13mm; object-fit: contain; }
    .lab-brand { color: #153958; font-size: 13px; font-weight: 700; }
    .lab-contact { color: #637184; font-size: 7px; }
    h1 { margin: 3mm 0 2mm; color: #153958; font-size: 13px; line-height: 1.12; }
    .lab-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 3mm; margin-bottom: 2.5mm; padding: 2mm; border: .6px solid #ccd7df; border-radius: 1.5mm; }
    .lab-meta div { display: grid; grid-template-columns: 17mm 1fr; gap: 1mm; }
    .lab-meta span { color: #6b7888; }
    .lab-comment { margin: 0 0 2mm; padding: 1.5mm; border-left: 1.5px solid #21848d; background: #f4f8fa; white-space: pre-wrap; }
    .lab-text { margin: 0 0 1.5mm; white-space: pre-wrap; overflow-wrap: anywhere; }
    .lab-table { width: 100%; margin: 0 0 2mm; border-collapse: collapse; table-layout: fixed; font-size: 6.6px; line-height: 1.14; }
    .lab-table th, .lab-table td { padding: .75mm .65mm; border: .45px solid #8998a6; text-align: left; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
    .lab-table th { background: #eaf3f5; color: #153958; font-weight: 700; }
    .lab-spacer { min-height: 1mm; }
    .lab-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 5mm; }
    .lab-signature { padding-top: 4mm; border-top: .6px solid #64748b; color: #64748b; font-size: 7px; }
    @page { size: A5 portrait; margin: 0; }
    @media print { .lab-page { padding: 6mm; } tr { break-inside: avoid; } }
  </style>
</head>
<body>${pages}
  <script>
    const logos = Array.from(document.querySelectorAll('.lab-logo'));
    const startPrint = () => window.setTimeout(() => window.print(), 100);
    if (!logos.length || logos.every((logo) => logo.complete)) startPrint();
    else Promise.all(logos.map((logo) => new Promise((resolve) => {
      logo.addEventListener('load', resolve, { once: true });
      logo.addEventListener('error', resolve, { once: true });
    }))).then(startPrint);
  </script>
</body>
</html>`;
}

function renderSnapshotPage(
  snapshot: LaboratoryFormSnapshot,
  order: LaboratoryPrintOrder,
  clinic: ClinicPrintData,
) {
  const items = new Map(order.items.map((item) => [item.id, item]));
  const bindings = new Map(snapshot.bindings.map((binding) => [`${binding.blockId}:${binding.rowIndex}:${binding.resultColumnIndex}`, binding.itemId]));
  const renderedLayout: DocumentLayout = {
    ...snapshot.layout,
    blocks: snapshot.layout.blocks.map((block) => {
      if (block.type !== 'table') return block;
      return {
        ...block,
        rows: block.rows.map((row, rowIndex) => row.map((cell, columnIndex) => {
          const itemId = bindings.get(`${block.id}:${rowIndex}:${columnIndex}`);
          if (!itemId) return renderTokens(cell, order);
          const item = items.get(itemId);
          return item?.resultValue || item?.resultText || '';
        })),
      };
    }),
  };

  return `<main class="lab-page">
    ${renderHeader(clinic)}
    <h1>${escapeHtml(snapshot.documentTemplateTitle)}</h1>
    ${renderMeta(order)}
    ${order.comment ? `<div class="lab-comment"><strong>Комментарий</strong><br>${escapeHtml(order.comment)}</div>` : ''}
    ${renderLayout(renderedLayout, order)}
    ${renderedLayout.page.showSignatures ? renderSignatures() : ''}
  </main>`;
}

function renderGenericPage(order: LaboratoryPrintOrder, clinic: ClinicPrintData) {
  const rows = order.items.map((item) => `<tr>
    <td><strong>${escapeHtml(item.title)}</strong>${item.code ? `<br><small>${escapeHtml(item.code)}</small>` : ''}</td>
    <td>${escapeHtml(item.resultValue || item.resultText || '—')}</td>
    <td>${escapeHtml(item.unit || '—')}</td>
    <td>${escapeHtml(item.referenceRange || '—')}</td>
  </tr>`).join('');
  return `<main class="lab-page">
    ${renderHeader(clinic)}
    <h1>Результаты лабораторного исследования</h1>
    ${renderMeta(order)}
    <table class="lab-table"><thead><tr><th>Исследование</th><th>Результат</th><th>Ед.</th><th>Референс</th></tr></thead><tbody>${rows}</tbody></table>
    ${renderSignatures()}
  </main>`;
}

function renderLayout(layout: DocumentLayout, order: LaboratoryPrintOrder) {
  return layout.blocks.map((block) => {
    if (block.type === 'pageBreak') return '<div style="break-before:page;page-break-before:always"></div>';
    if (block.type === 'spacer') return `<div class="lab-spacer" style="height:${Math.max(4, block.height) / 4}px"></div>`;
    if (block.type === 'text') {
      return `<div class="lab-text" style="font-size:${Math.max(6.5, block.fontSize * .68)}px;font-weight:${block.bold ? 700 : 400};font-style:${block.italic ? 'italic' : 'normal'};text-align:${block.align}">${escapeHtml(renderTokens(block.text, order) || ' ')}</div>`;
    }
    const rows = block.rows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row, rowIndex) => `<tr>${row.map((cell) => {
        const tag = rowIndex < block.headerRows ? 'th' : 'td';
        return `<${tag}>${escapeHtml(renderTokens(cell, order) || ' ')}</${tag}>`;
      }).join('')}</tr>`)
      .join('');
    return rows ? `<table class="lab-table"><tbody>${rows}</tbody></table>` : '';
  }).join('');
}

function renderHeader(clinic: ClinicPrintData) {
  return `<header class="lab-header">
    <img class="lab-logo" src="${escapeHtml(clinic.logoUrl)}" alt="${escapeHtml(clinic.clinicName)}" />
    <div><div class="lab-brand">${escapeHtml(clinic.clinicName)}</div><div>Ветеринарная клиника</div>
      ${clinic.clinicAddress ? `<div class="lab-contact">${escapeHtml(clinic.clinicAddress)}</div>` : ''}
      ${clinic.clinicPhone ? `<div class="lab-contact">${escapeHtml(clinic.clinicPhone)}</div>` : ''}
    </div>
  </header>`;
}

function renderMeta(order: LaboratoryPrintOrder) {
  const patientDescription = [order.visit.animal.species, order.visit.animal.breed].filter(Boolean).join(', ') || '—';
  return `<section class="lab-meta">
    <div><span>Дата</span><strong>${escapeHtml(formatDateTime(order.createdAt))}</strong></div>
    <div><span>Врач</span><strong>${escapeHtml(order.visit.employee?.fullName || '—')}</strong></div>
    <div><span>Владелец</span><strong>${escapeHtml(order.visit.owner.fullName)}</strong></div>
    <div><span>Пациент</span><strong>${escapeHtml(order.visit.animal.nickname)}</strong></div>
    <div><span>Вид / порода</span><strong>${escapeHtml(patientDescription)}</strong></div>
    <div><span>Статус</span><strong>${escapeHtml(laboratoryOrderStatusLabels[order.status])}</strong></div>
  </section>`;
}

function renderSignatures() {
  return `<section class="lab-signatures"><div class="lab-signature">Подпись сотрудника лаборатории</div><div class="lab-signature">Подпись врача</div></section>`;
}

function renderTokens(text: string, order: LaboratoryPrintOrder) {
  const values: Record<string, string> = {
    'owner.fullName': order.visit.owner.fullName,
    'owner.phone': order.visit.owner.phone || '',
    'animal.nickname': order.visit.animal.nickname,
    'animal.species': order.visit.animal.species || '',
    'animal.breed': order.visit.animal.breed || '',
    'employee.fullName': order.visit.employee?.fullName || '',
    'visit.startedAt': formatDateTime(order.createdAt),
    currentDate: new Date(order.createdAt).toLocaleDateString('ru-RU'),
    currentDateTime: formatDateTime(order.createdAt),
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}|\{([\w.]+)\}/g, (_match, doubleKey: string | undefined, singleKey: string | undefined) => values[singleKey ?? doubleKey ?? ''] ?? '');
}

function isLaboratoryFormSnapshot(value: unknown): value is LaboratoryFormSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<LaboratoryFormSnapshot>;
  return snapshot.schemaVersion === 1 && Boolean(snapshot.layout) && Array.isArray(snapshot.bindings);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

type ClinicPrintData = {
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  logoUrl: string;
};
