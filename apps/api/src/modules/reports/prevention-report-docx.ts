import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { diseaseTitles } from './prevention-types';
import { PreventionSnapshot } from './prevention-report-data';

export function renderPreventionDocx(report: PreventionSnapshot, reference = readFileSync(join(process.cwd(), 'apps/api/assets/reports/prevention-reference.docx'))) {
  const parts = unzipSync(reference);
  const source = strFromU8(parts['word/document.xml']);
  const section = source.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)?.[0];
  const header = source.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/)?.[0];
  if (!section || !header) throw new Error('Некорректный шаблон профилактического отчёта');
  const month = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${report.month}-15T12:00:00Z`)).replace(/\s*г\.$/, '');
  const headerCells = [...header.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)];
  if (headerCells.length !== 2) throw new Error('Некорректная шапка отчёта');
  const tc = headerCells[1][0];
  const tcPr = tc.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0] ?? '';
  const clinicHeader = header.replace(tc, `<w:tc>${tcPr}${p(report.clinic.name, 24, true, 'center')}${p(report.clinic.address, 16, true, 'center')}${p(report.clinic.phone ? `тел. ${report.clinic.phone}` : '', 16, true, 'center')}</w:tc>`);
  const body: string[] = [clinicHeader, p('О Т Ч Е Т', 18, true, 'center'), p('О профилактических мероприятиях', 14, true, 'center'), p(`За ${month} года`, 14, true, 'center')];
  const summaryRows = [tr(['Вид животного и название мероприятия', 'Количество голов'], [7800, 1946], true)];
  for (const section of report.summary) {
    summaryRows.push(tr([section.title, ''], [7800, 1946], true));
    section.rows.forEach((row, i) => summaryRows.push(tr([`${i + 1}. ${row.title}`, display(row.count)], [7800, 1946])));
  }
  body.push(table(summaryRows, [7800, 1946]).replace(/w:after="60"/g, 'w:after="0"'));
  body.push(p(`Зарегистрировано больных первично всего: ${report.illness.total} голов, в т. ч. собак ${report.illness.dogs} голов, кошек ${report.illness.cats} голов.`, 11, true));
  for (const species of ['CAT', 'DOG']) body.push(p(`${species === 'CAT' ? 'Из числа заболевших кошек' : 'Собак'}: ${report.illness.conditions.filter(row => row.species === species).map(row => `${row.title.toLocaleLowerCase('ru-RU')} ${row.count} голов`).join('; ')}.`, 11, true));
  body.push(pageBreak(), p(`Реестр вакцинированных животных за ${month} года`, 14, true, 'center'));
  const widths = [460, 1250, 2700, 1730, 1900, 1706];
  const registry = [tr(['№', 'Дата', 'Владелец и адрес', 'Животное', 'Наименование биопрепарата', 'Доза и метод введения'], widths, true)];
  report.rows.forEach((row, i) => registry.push(tr([
    String(i + 1), shortDate(row.vaccinatedAt, report.timezone), `${row.animal.owner.fullName}\n${row.animal.owner.address || ''}`,
    `${row.animal.nickname}\n${row.animal.species || ''}${row.animal.breed ? `, ${row.animal.breed}` : ''}${row.animal.sex === 'MALE' ? '\nСамец' : row.animal.sex === 'FEMALE' ? '\nСамка' : ''}${row.animal.birthDate ? `\nРожд. ${shortDate(row.animal.birthDate, report.timezone)}` : ''}${row.animal.microchip ? `\nЧип: ${row.animal.microchip}` : ''}`,
    `${row.vaccineName}${row.vaccineSeries ? `\nСерия: ${row.vaccineSeries}` : ''}`, `${row.doseText || '________'}\n${row.administrationRoute || '________'}`,
  ], widths)));
  if (!report.rows.length) registry.push(tr(['', '', 'Вакцинации за период не зарегистрированы', '', '', ''], widths));
  body.push(table(registry, widths));
  for (const act of report.acts) {
    body.push(pageBreak(), p(`${report.clinic.legalName || report.clinic.name}                                      За ${month} года`, 11), p(report.clinic.address, 11), p(report.clinic.phone ? `Тел. ${report.clinic.phone}` : '', 11), p('А К Т', 18, false, 'center', 420));
    const doctors = report.signatories.length ? report.signatories.map(name => `ветврач ${name}`).join(', ') : 'ветврач ____________________';
    const species = act.species === 'DOG' ? 'собак' : act.species === 'CAT' ? 'кошек' : act.species === 'FERRET' ? 'хорьков' : 'животных';
    const infections = act.diseases.length ? act.diseases.map(code => diseaseTitles[code]).join(', ') : '____________________';
    body.push(p(`Мы, нижеподписавшиеся, ${doctors}, составили настоящий акт в том, что с ${shortDate(report.range.from + 'T12:00:00Z', 'UTC')} по ${shortDate(report.range.to + 'T12:00:00Z', 'UTC')} была проведена вакцинация ${species} против ${infections}.`, 16));
    body.push(p(`В количестве ${act.heads} голов.`, 16), p(`Применялась вакцина ${act.vaccineName}.`, 16), p(`В дозе ${act.doseText || '________'}, способ введения: ${act.administrationRoute || '________'}.`, 16), p(`Производитель: ${act.manufacturer || '____________________'}.`, 16));
    body.push(p(`Израсходовано ${display(act.consumedDoses)} доз.`, 16, false, 'left', 300), p(`Использовано ${display(act.usedDoses)} доз.`, 16));
    // A statement about actual syringe/needle use requires recorded clinical data;
    // the source form's boilerplate is retained as a field for verification.
    body.push(p(`Применялись шприцы и иглы: ${act.syringesAndNeedles || '______________________________'}.`, 16));
    (report.signatories.length ? report.signatories : ['____________________', '____________________']).forEach((name, i) => body.push(p(`${i + 1}. Ветврач                         ${name} ____________________`, 14, false, 'left', i === 0 ? 500 : 240)));
  }
  const open = source.slice(0, source.indexOf('<w:body>') + '<w:body>'.length);
  parts['word/document.xml'] = strToU8(`${open}${body.join('')}${section}</w:body></w:document>`);
  return Buffer.from(zipSync(parts, { level: 6 }));
}

function escape(value: unknown) { return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function p(text: string, size = 11, bold = false, align = 'left', before = 0) {
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="${before}" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="${size * 2}"/>${bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escape(text).replace(/\n/g, '</w:t><w:br/><w:t xml:space="preserve">')}</w:t></w:r></w:p>`;
}
function tr(cells: string[], widths: number[], header = false) { return `<w:tr><w:trPr><w:cantSplit/>${header ? '<w:tblHeader/>' : ''}</w:trPr>${cells.map((text, i) => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>${p(text, 11, header)}</w:tc>`).join('')}</w:tr>`; }
function table(rows: string[], widths: number[]) { return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((sum, w) => sum + w, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="000000"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`; }
function pageBreak() { return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; }
function display(value: number | null) { return value === null ? '________' : Number(value.toFixed(3)).toLocaleString('ru-RU'); }
function shortDate(value: string, timezone: string) { return new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)); }
