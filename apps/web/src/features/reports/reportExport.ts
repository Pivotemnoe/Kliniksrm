import { formatMoney } from '../../shared/utils/money';
import { ClinicReport } from './types';

type ExportCell = string | number | null | undefined;

export function exportReportToExcel(report: ClinicReport) {
  const sheets = [
    sheet('Сводка', [
      ['Показатель', 'Значение'],
      ['Период', `${report.range.from} — ${report.range.to}`],
      ['Начислено', report.finance.billedAmount],
      ['Оплачено', report.finance.paidAmount],
      ['Возвраты', report.finance.refundedAmount],
      ['Задолженность', report.finance.debtAmount],
      ['Депозиты владельцев', report.finance.depositsAmount],
      ['Валовая прибыль', report.profit.grossProfit],
      ['Приёмы', report.traffic.visitsTotal],
      ['Завершено приёмов', report.traffic.visitsCompleted],
      ['Не завершено более часа', report.traffic.visitsOverdue],
      ['Оповещений о просрочке', report.traffic.overdueNotifications],
      ['Новые владельцы', report.traffic.newOwners],
    ]),
    sheet('Оплаты', [
      ['Способ оплаты', 'Поступило', 'Возвраты', 'Итого', 'Операций'],
      ...report.finance.paymentMethods.map((item) => [item.title, item.received, item.refunded, item.net, item.count]),
    ]),
    sheet('Задолженность', [
      ['Владелец', 'Телефон', 'Дата счёта', 'Срок оплаты', 'Долг'],
      ...report.finance.debtors.map((item) => [item.ownerName, item.phone, date(item.createdAt), date(item.dueAt), item.debt]),
    ]),
    sheet('Услуги', salesRows(report.sales.services)),
    sheet('Товары', salesRows(report.sales.products)),
    sheet('Сотрудники', [
      ['Сотрудник', 'Должность', 'Приёмы', 'Завершено', 'Более часа', 'Оповещений', 'Начислено'],
      ...report.employees.map((item) => [item.fullName, item.position, item.visits, item.completedVisits, item.overdueVisits, item.overdueNotifications, item.billedAmount]),
    ]),
    sheet('Контроль приёмов', [
      ['Дата', 'Начато', 'Завершено', 'Не завершено более часа', 'Оповещений'],
      ...report.traffic.daily.map((item) => [item.date, item.visits, item.completedVisits, item.overdueVisits, item.overdueNotifications]),
    ]),
    sheet('Вакцинации', [
      ['Статус', 'Вакцина', 'Пациент', 'Владелец', 'Телефон', 'Дата', 'Серия', 'Партия', 'Микрочип'],
      ...report.vaccinations.administeredItems.map((item) => ['Проведено', item.title, item.animal.nickname, item.animal.owner.fullName, item.animal.owner.phone, date(item.vaccinatedAt), item.vaccineSeries, item.vaccineBatch, item.animal.microchip]),
      ...report.vaccinations.upcomingItems.map((item) => ['Предстоит', item.title, item.animal.nickname, item.animal.owner.fullName, item.animal.owner.phone, date(item.expiresAt)]),
      ...report.vaccinations.overdueItems.map((item) => ['Просрочено', item.title, item.animal.nickname, item.animal.owner.fullName, item.animal.owner.phone, date(item.expiresAt)]),
    ]),
    sheet('Идентификация', [
      ['Микрочип', 'Пациент', 'Вид', 'Порода', 'Владелец', 'Телефон'],
      ...report.vaccinations.identifiedAnimals.map((item) => [item.microchip, item.nickname, item.species, item.breed, item.owner.fullName, item.owner.phone]),
    ]),
    sheet('Склад', [
      ['Раздел', 'Статус', 'Товар', 'Склад', 'Серия', 'Срок годности', 'Остаток', 'Единица', 'Закупочная цена', 'Минимум'],
      ...report.stock.lowStockItems.map((item) => ['Низкий остаток', '', item.title, '', '', '', item.rest, item.unit, '', item.minStock]),
      ...report.stock.expiryItems.map((item) => ['Срок годности', item.status === 'EXPIRED' ? 'Просрочено' : 'Истекает', item.productTitle, item.warehouseName, item.series, date(item.expiresAt), item.rest, item.unit, item.purchasePrice, '']),
    ]),
  ].join('');
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets}</Workbook>`;
  download(new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }), `temichevvet-report-${report.range.from}-${report.range.to}.xls`);
}

export function printReportAsPdf(report: ClinicReport) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.opener = null;
  popup.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт TemichevVet</title><style>
    body{font-family:Arial,sans-serif;color:#183750;margin:28px}h1{margin:0 0 6px}h2{margin-top:28px;font-size:18px}p{color:#657b8d}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card{border:1px solid #dbe4ea;border-radius:8px;padding:12px}.card b{display:block;font-size:18px;margin-top:6px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:7px;border:1px solid #dbe4ea;text-align:left}th{background:#eef4f7}.num{text-align:right}@media print{body{margin:10mm}.no-print{display:none}}
  </style></head><body><h1>TemichevVet · Управленческий отчёт</h1><p>Период: ${escapeHtml(report.range.from)} — ${escapeHtml(report.range.to)}. Сформирован: ${escapeHtml(new Date(report.generatedAt).toLocaleString('ru-RU'))}</p>
  <div class="cards">${printCard('Начислено', formatMoney(report.finance.billedAmount))}${printCard('Оплачено', formatMoney(report.finance.paidAmount))}${printCard('Долг', formatMoney(report.finance.debtAmount))}${printCard('Валовая прибыль', formatMoney(report.profit.grossProfit))}</div>
  ${printTable('Контроль приёмов по дням', ['Дата', 'Начато', 'Завершено', 'Более часа', 'Оповещений'], report.traffic.daily.map((item) => [date(item.date), item.visits, item.completedVisits, item.overdueVisits, item.overdueNotifications]))}
  ${printTable('Финансы по дням', ['Дата', 'Начислено', 'Оплачено'], report.traffic.daily.map((item) => [date(item.date), formatMoney(item.billedAmount), formatMoney(item.paidAmount)]))}
  ${printTable('Услуги', ['Наименование', 'Количество', 'Выручка'], report.sales.services.map((item) => [item.title, item.quantity, formatMoney(item.revenue)]))}
  ${printTable('Товары', ['Наименование', 'Количество', 'Выручка'], report.sales.products.map((item) => [item.title, item.quantity, formatMoney(item.revenue)]))}
  ${printTable('Сотрудники', ['Сотрудник', 'Приёмы', 'Завершено', 'Более часа', 'Оповещений', 'Начислено'], report.employees.map((item) => [item.fullName, item.visits, item.completedVisits, item.overdueVisits, item.overdueNotifications, formatMoney(item.billedAmount)]))}
  ${printTable('Задолженность', ['Владелец', 'Телефон', 'Долг'], report.finance.debtors.map((item) => [item.ownerName, item.phone, formatMoney(item.debt)]))}
  ${printTable('Проведённые вакцинации', ['Дата', 'Вакцина', 'Пациент', 'Владелец', 'Микрочип'], report.vaccinations.administeredItems.map((item) => [date(item.vaccinatedAt), item.title, item.animal.nickname, item.animal.owner.fullName, item.animal.microchip]))}
  ${printTable('Идентифицированные животные', ['Микрочип', 'Пациент', 'Вид', 'Порода', 'Владелец'], report.vaccinations.identifiedAnimals.map((item) => [item.microchip, item.nickname, item.species, item.breed, item.owner.fullName]))}
  <p>${escapeHtml(report.profit.note)}</p><script>window.onload=()=>window.print();<\/script></body></html>`);
  popup.document.close();
  return true;
}

function salesRows(items: ClinicReport['sales']['services']): ExportCell[][] {
  return [
    ['Наименование', 'Количество', 'Строк', 'Скидка', 'Выручка'],
    ...items.map((item) => [item.title, item.quantity, item.lines, item.discount, item.revenue]),
  ];
}

function sheet(title: string, rows: ExportCell[][]) {
  return `<Worksheet ss:Name="${escapeXml(title.slice(0, 31))}"><Table>${rows.map((row) => `<Row>${row.map(cell).join('')}</Row>`).join('')}</Table></Worksheet>`;
}

function cell(value: ExportCell) {
  const numeric = typeof value === 'number' && Number.isFinite(value);
  return `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${escapeXml(value ?? '')}</Data></Cell>`;
}

function printCard(title: string, value: string) {
  return `<div class="card">${escapeHtml(title)}<b>${escapeHtml(value)}</b></div>`;
}

function printTable(title: string, headers: string[], rows: ExportCell[][]) {
  return `<h2>${escapeHtml(title)}</h2><table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((item) => `<td>${escapeHtml(item ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : '—';
}

function download(blob: Blob, fileName: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}

function escapeXml(value: ExportCell) {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] ?? char);
}

function escapeHtml(value: ExportCell) {
  return escapeXml(value);
}
