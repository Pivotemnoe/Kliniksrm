import type { DataTransferKind, DataTransferMapping, VetafImportRow } from './imports.api';

export type ImportKindCandidate = {
  kind: DataTransferKind;
  confidence: number;
  reasons: string[];
};

export type ColumnMappingSuggestion = {
  sourceColumn: string;
  targetField: string;
  confidence: number;
  reason: string;
};

export type ParsedImportFile = {
  columns: string[];
  rows: VetafImportRow[];
  formatLabel: string;
  sheetName?: string;
  warnings: string[];
  detectedKind: DataTransferKind | null;
  kindCandidates: ImportKindCandidate[];
};

export function prepareTransferPayload(
  kind: DataTransferKind,
  rows: VetafImportRow[],
  mapping: Record<string, string>,
): { rows: VetafImportRow[]; mappings: DataTransferMapping[] } {
  const baseMappings = Object.entries(mapping)
    .filter(([, targetField]) => targetField)
    .map(([sourceColumn, targetField]) => ({ sourceColumn, targetField }));
  if (kind !== 'catalog') return { rows, mappings: baseMappings };
  const sourceFor = (target: string) => baseMappings.find((item) => item.targetField === target)?.sourceColumn;
  const priceSource = sourceFor('price');
  if (!priceSource) return { rows, mappings: baseMappings };

  const internal = {
    priceNote: sourceFor('price_note') ?? '__TemichevVet: исходная цена',
    review: sourceFor('review_status') ?? '__TemichevVet: требует проверки',
    priceType: sourceFor('price_type') ?? '__TemichevVet: тип цены',
  };
  let hasFlexiblePrice = false;
  const preparedRows = rows.map((row) => {
    const rawPrice = cleanText(row.data[priceSource] ?? '');
    if (!rawPrice) return row;
    const exactPrice = parseExactPrice(rawPrice);
    if (exactPrice !== null) return { ...row, data: { ...row.data, [priceSource]: exactPrice } };
    hasFlexiblePrice = true;
    const currentNote = cleanText(row.data[internal.priceNote] ?? '');
    return {
      ...row,
      data: {
        ...row.data,
        [priceSource]: '',
        [internal.priceNote]: currentNote && currentNote !== rawPrice ? `${currentNote}; ${rawPrice}` : rawPrice,
        [internal.review]: 'Да',
        [internal.priceType]: 'Плавающая',
      },
    };
  });
  if (!hasFlexiblePrice) return { rows: preparedRows, mappings: baseMappings };
  const mappings = [...baseMappings];
  if (!sourceFor('price_note')) mappings.push({ sourceColumn: internal.priceNote, targetField: 'price_note' });
  if (!sourceFor('review_status')) mappings.push({ sourceColumn: internal.review, targetField: 'review_status' });
  if (!sourceFor('price_type')) mappings.push({ sourceColumn: internal.priceType, targetField: 'price_type' });
  return { rows: preparedRows, mappings };
}

type ParsedTable = Pick<ParsedImportFile, 'columns' | 'rows'>;
type DocxCell = { text: string; paragraphs: string[] };

const MAX_SHEET_ROWS = 30_001;
const MAX_DOCX_XML_BYTES = 30 * 1024 * 1024;

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('ru-RU') ?? '';
  let parsed: ParsedTable & { formatLabel: string; sheetName?: string; warnings?: string[] };
  if (extension === 'xls') {
    parsed = await parseExcelWorkbook(file, 'Excel XLS');
  } else if (extension === 'xlsx' || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    parsed = await parseExcelWorkbook(file, 'Excel XLSX');
  } else if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    parsed = await parseDocxTable(file);
  } else if (['csv', 'tsv', 'txt'].includes(extension) || file.type.startsWith('text/')) {
    parsed = { ...parseDelimitedTable(await file.text()), formatLabel: extension === 'tsv' ? 'TSV' : extension === 'txt' ? 'Текстовая таблица' : 'CSV' };
  } else {
    throw new Error('Поддерживаются Excel XLS/XLSX, CSV, TSV, TXT и таблицы Word DOCX');
  }

  const candidates = detectImportKind(parsed.columns, parsed.rows);
  const detectedKind = candidates[0]?.confidence >= 0.42 ? candidates[0].kind : null;
  return {
    ...parsed,
    warnings: parsed.warnings ?? [],
    detectedKind,
    kindCandidates: candidates,
  };
}

export function detectImportKind(columns: string[], rows: VetafImportRow[]): ImportKindCandidate[] {
  const suggestionsByKind = Object.fromEntries(importKinds.map((kind) => [kind, suggestColumnMappings(kind, columns, rows)])) as Record<DataTransferKind, ColumnMappingSuggestion[]>;
  const weights: Record<DataTransferKind, Record<string, number>> = {
    clients: { owner_name: 4, phone: 4, animal_name: 3, species: 2, breed: 1.5, birth_date: 1.5, microchip: 2 },
    history: { visit_date: 5, animal_name: 2, owner_name: 2, diagnosis: 3, anamnesis: 2, examination: 2, treatment_plan: 2 },
    catalog: { title: 5, price: 3, item_type: 4, barcode: 2, sku: 2, category: 1.5, unit: 1 },
    stock: { title: 3, quantity: 6, warehouse: 4, purchase_price: 3, expires_at: 2, series: 1.5, barcode: 1 },
  };
  return importKinds.map((kind) => {
    const suggestions = suggestionsByKind[kind];
    const matched = new Map(suggestions.filter((item) => item.targetField).map((item) => [item.targetField, item]));
    const totalWeight = Object.values(weights[kind]).reduce((sum, weight) => sum + weight, 0);
    const weighted = Object.entries(weights[kind]).reduce((sum, [field, weight]) => sum + (matched.get(field)?.confidence ?? 0) * weight, 0);
    const reasons = [...matched.values()]
      .filter((item) => (weights[kind][item.targetField] ?? 0) >= 2 && item.confidence >= 0.72)
      .sort((a, b) => (weights[kind][b.targetField] ?? 0) - (weights[kind][a.targetField] ?? 0))
      .slice(0, 4)
      .map((item) => `«${item.sourceColumn}» похоже на ${fieldLabel(item.targetField)}`);
    return { kind, confidence: Math.min(0.99, weighted / totalWeight), reasons };
  }).sort((a, b) => b.confidence - a.confidence);
}

export function suggestColumnMappings(kind: DataTransferKind, columns: string[], rows: VetafImportRow[]): ColumnMappingSuggestion[] {
  const allowedTargets = Object.keys(targetAliases[kind]);
  const used = new Set<string>();
  return columns.map((column) => {
    const samples = rows.slice(0, 80).map((row) => row.data[column] ?? '').filter(Boolean);
    const ranked = allowedTargets
      .map((target) => scoreColumn(column, target, targetAliases[kind][target], samples))
      .sort((a, b) => b.confidence - a.confidence);
    const best = ranked[0];
    if (!best || best.confidence < 0.62 || used.has(best.targetField)) {
      return { sourceColumn: column, targetField: '', confidence: best?.confidence ?? 0, reason: best?.reason ?? 'Совпадение не найдено' };
    }
    used.add(best.targetField);
    return { sourceColumn: column, ...best };
  });
}

function scoreColumn(column: string, targetField: string, aliases: string[], samples: string[]) {
  const normalizedColumn = normalizeHeader(column);
  const normalizedAliases = aliases.map(normalizeHeader);
  if (normalizedAliases.includes(normalizedColumn)) {
    return { targetField, confidence: 0.99, reason: 'Точное совпадение названия' };
  }
  const containment = normalizedAliases.some((alias) => alias.length >= 4 && (normalizedColumn.includes(alias) || alias.includes(normalizedColumn)));
  const similarity = Math.max(...normalizedAliases.map((alias) => diceCoefficient(normalizedColumn, alias)), 0);
  let confidence = containment ? 0.86 : similarity >= 0.58 ? 0.55 + similarity * 0.35 : 0;
  let reason = containment ? 'Название содержит знакомое поле' : similarity >= 0.58 ? 'Похожее название колонки' : 'Совпадение не найдено';
  const contentScore = scoreColumnContent(targetField, samples);
  if (contentScore > confidence && contentScore >= 0.68) {
    confidence = contentScore;
    reason = 'Распознано по значениям в колонке';
  }
  return { targetField, confidence: Math.min(0.96, confidence), reason };
}

function scoreColumnContent(target: string, samples: string[]) {
  if (samples.length < 2) return 0;
  const ratio = (predicate: (value: string) => boolean) => samples.filter(predicate).length / samples.length;
  if (target === 'phone') return ratio((value) => /(?:\+?7|8)?[\s()-]*\d{3}[\s()-]*\d{3}/.test(value)) >= 0.65 ? 0.78 : 0;
  if (target === 'email') return ratio((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) >= 0.65 ? 0.84 : 0;
  if (target === 'barcode') return ratio((value) => /^\d{8,14}$/.test(value.replace(/\s/g, ''))) >= 0.75 ? 0.72 : 0;
  if (['price', 'minimum_price', 'quantity', 'purchase_price', 'min_stock', 'amount'].includes(target)) {
    return ratio(isNumberLike) >= 0.8 ? 0.68 : 0;
  }
  if (['birth_date', 'visit_date', 'vaccinated_at', 'vaccination_due_at', 'expires_at'].includes(target)) {
    return ratio(isDateLike) >= 0.75 ? 0.7 : 0;
  }
  if (target === 'item_type') return ratio((value) => /^(товар|услуга|работа|product|service)$/i.test(value.trim())) >= 0.6 ? 0.9 : 0;
  return 0;
}

async function parseExcelWorkbook(file: File, formatLabel: 'Excel XLS' | 'Excel XLSX') {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
    cellFormula: false,
    dense: true,
    sheetRows: MAX_SHEET_ROWS,
  });
  const candidates = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, dateNF: 'dd.mm.yyyy' })
      .map((row) => row.map(cellToText));
    return { sheetName, table, score: headerTableScore(table) };
  }).filter((candidate) => candidate.table.some((row) => row.some(Boolean)));
  const selected = candidates.sort((a, b) => b.score - a.score || b.table.length - a.table.length)[0];
  if (!selected) throw new Error('В Excel нет непустых листов');
  return {
    ...parseSpreadsheetTable(selected.table),
    formatLabel,
    sheetName: selected.sheetName,
    warnings: workbook.SheetNames.length > 1 ? [`Автоматически выбран лист «${selected.sheetName}» из ${workbook.SheetNames.length}`] : [],
  };
}

function parseSpreadsheetTable(table: string[][]): ParsedTable {
  const headerIndex = findHeaderRow(table);
  const headers = buildHeaders(table[headerIndex]);
  if (!headers.length) throw new Error('В таблице не найдены заголовки колонок');
  const rows: VetafImportRow[] = [];
  let started = false;
  for (let rowIndex = headerIndex + 1; rowIndex < table.length; rowIndex += 1) {
    const data = Object.fromEntries(headers.map(({ index, title }) => [title, table[rowIndex]?.[index]?.trim() ?? '']));
    const nonempty = Object.values(data).some(Boolean);
    if (!nonempty) continue;
    started = true;
    rows.push({ rowNumber: rowIndex + 1, data });
  }
  if (!rows.length) throw new Error('После заголовков нет строк данных');
  return { columns: headers.map((header) => header.title), rows };
}

function parseDelimitedTable(text: string): ParsedTable {
  const normalizedText = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalizedText) throw new Error('Файл пустой');
  const delimiter = detectDelimiter(normalizedText);
  return parseSpreadsheetTable(parseDelimitedRows(normalizedText, delimiter).map((row) => row.map((cell) => cell.trim())));
}

async function parseDocxTable(file: File) {
  const { strFromU8, unzipSync } = await import('fflate');
  let oversizedXml = false;
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      if (entry.name !== 'word/document.xml') return false;
      if (entry.originalSize > MAX_DOCX_XML_BYTES) {
        oversizedXml = true;
        return false;
      }
      return true;
    },
  });
  if (oversizedXml) throw new Error('Таблица Word слишком большая для безопасного чтения');
  const documentXml = archive['word/document.xml'];
  if (!documentXml) throw new Error('В DOCX не найден основной документ');
  const xml = new DOMParser().parseFromString(strFromU8(documentXml), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Не удалось разобрать структуру DOCX');
  const tables = Array.from(xml.getElementsByTagNameNS('*', 'tbl')).map((table) => parseWordTable(table));
  const selected = tables.sort((a, b) => b.length - a.length)[0];
  if (!selected?.length) throw new Error('В Word не найдена таблица');
  const matrix = selected.map((row) => row.map((cell) => cell.text));
  if (looksLikePriceList(matrix)) return parseWordPriceList(selected);
  return { ...parseSpreadsheetTable(matrix), formatLabel: 'Word DOCX', warnings: tables.length > 1 ? ['Выбрана самая большая таблица документа'] : [] };
}

function parseWordTable(table: Element): DocxCell[][] {
  return Array.from(table.children)
    .filter((element) => element.localName === 'tr')
    .map((row) => Array.from(row.children).filter((element) => element.localName === 'tc').map((cell) => {
      const paragraphs = Array.from(cell.getElementsByTagNameNS('*', 'p')).map((paragraph) => cleanText(Array.from(paragraph.getElementsByTagNameNS('*', 't')).map((item) => item.textContent ?? '').join(''))).filter(Boolean);
      return { paragraphs, text: cleanText(paragraphs.join(' ')) };
    }));
}

function looksLikePriceList(table: string[][]) {
  const headerIndex = findHeaderRow(table);
  const row = table[headerIndex] ?? [];
  return row.length >= 2 && /наименован|назван|услуг|процедур/i.test(row[0] ?? '') && /цен|стоимост|тариф/i.test(row[1] ?? '');
}

function parseWordPriceList(table: DocxCell[][]) {
  const matrix = table.map((row) => row.map((cell) => cell.text));
  const headerIndex = findHeaderRow(matrix);
  const rows: VetafImportRow[] = [];
  let category = 'Общие услуги';
  let baseTitle = '';
  let reviewCount = 0;
  for (let index = headerIndex + 1; index < table.length; index += 1) {
    const cells = table[index];
    const titleCell = cells[0];
    const priceCell = cells[1];
    const title = cleanText(titleCell?.paragraphs[0] ?? titleCell?.text ?? '');
    const description = cleanText(titleCell?.paragraphs.slice(1).join(' ') ?? '');
    const priceText = cleanText(priceCell?.text ?? '');
    if (!title && !priceText) continue;
    if (isWordCategoryRow(cells, title, priceText)) {
      category = normalizeCategory(title);
      baseTitle = '';
      continue;
    }
    if (!title) continue;
    const normalizedTitle = /^[—–-]/.test(title) && baseTitle
      ? `${baseTitle} ${title.replace(/^[—–-]\s*/, '')}`
      : title;
    if (!/^[—–-]/.test(title)) baseTitle = title;
    const exactPrice = parseExactPrice(priceText);
    const needsReview = exactPrice === null;
    if (needsReview) reviewCount += 1;
    const note = priceText ? `Цена по исходному прайсу: ${priceText}` : 'Цена в исходном прайсе не указана';
    rows.push({
      rowNumber: index + 1,
      data: {
        'ID строки': `docx-${index + 1}`,
        'Тип позиции': 'Услуга',
        'Наименование': normalizedTitle,
        'Категория': category,
        'Цена': exactPrice ?? '',
        'Тип цены': needsReview ? 'Плавающая' : 'Фиксированная',
        'Описание': [description, needsReview ? note : ''].filter(Boolean).join('. '),
        'Исходная цена': priceText,
        'Требует проверки': needsReview ? 'Да' : 'Нет',
      },
    });
  }
  if (!rows.length) throw new Error('В прайсе Word не найдены строки услуг');
  return {
    columns: ['ID строки', 'Тип позиции', 'Наименование', 'Категория', 'Цена', 'Тип цены', 'Описание', 'Исходная цена', 'Требует проверки'],
    rows,
    formatLabel: 'Word DOCX — прайс услуг',
    warnings: reviewCount ? [`${reviewCount} строк имеют диапазон, тариф или пустую цену и требуют подтверждения`] : [],
  };
}

function isWordCategoryRow(cells: DocxCell[], title: string, price: string) {
  const letters = title.replace(/[^A-Za-zА-Яа-яЁё]+/g, '');
  const uppercase = Boolean(letters) && letters === letters.toLocaleUpperCase('ru-RU');
  return cells.length < 2 || (title && title === price) || (!price && (uppercase || /:\s*$/.test(title)));
}

function normalizeCategory(value: string) {
  const uppercasePrefix = value.match(/^([А-ЯЁ][А-ЯЁ\s]{2,}?)(?=\s+[А-ЯЁ][а-яё])/u)?.[1];
  const category = cleanText(uppercasePrefix || value.split(/[.!?]/)[0]).replace(/(?:\s*\*)+\s*$/, '');
  return category.slice(0, 160) || 'Общие услуги';
}

function parseExactPrice(value: string) {
  const normalized = cleanText(value).replace(/₽/g, '').replace(/руб\.?/gi, '').trim();
  if (!normalized) return null;
  if (/^(бесплатно|б\/п)$/i.test(normalized)) return '0';
  if (/(^|\s)(от|до|тариф|договорн)/i.test(normalized) || /\d\s*[-–—]\s*\d/.test(normalized)) return null;
  const groupedThousands = /^(?:\d{1,2}(?: \d{3})+|\d{1,3}(?:\.\d{3})+)$/.test(normalized);
  if (!groupedThousands && !/^\d+(?:,\d{1,2})?$/.test(normalized)) return null;
  return groupedThousands ? normalized.replace(/[ .]/g, '') : normalized.replace(',', '.');
}

function findHeaderRow(rows: string[][]) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 100).forEach((row, index) => {
    const score = row.reduce((sum, cell) => sum + (allKnownAliases.has(normalizeHeader(cell)) ? 4 : cell.trim() ? 0.15 : 0), 0);
    if (score > best.score) best = { index, score };
  });
  if (best.index < 0 || best.score < 1) throw new Error('Не удалось найти строку с заголовками');
  return best.index;
}

function headerTableScore(rows: string[][]) {
  try {
    const index = findHeaderRow(rows);
    return rows[index].filter((cell) => allKnownAliases.has(normalizeHeader(cell))).length * 100 + rows.length;
  } catch {
    return rows.length;
  }
}

function buildHeaders(row: string[]) {
  return uniqueHeaders(row.map((title) => title.trim())).map((title, index) => ({ index, title })).filter((item) => item.title);
}

function uniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    if (!header) return header;
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count ? `${header} ${count + 1}` : header;
  });
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${String(value.getDate()).padStart(2, '0')}.${String(value.getMonth() + 1).padStart(2, '0')}.${value.getFullYear()}`;
  return cleanText(String(value));
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (count) {
      overlap += 1;
      pairs.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length - 2);
}

function isNumberLike(value: string) {
  return /^-?\d+(?:[\s.,]\d+)*$/.test(value.trim());
}

function isDateLike(value: string) {
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(value.trim()) || /^\d{4}-\d{2}-\d{2}/.test(value.trim());
}

function detectDelimiter(text: string) {
  const firstLine = text.split('\n')[0] ?? '';
  return [';', '\t', ','].map((delimiter) => ({ delimiter, count: parseDelimitedRows(firstLine, delimiter)[0]?.length ?? 0 })).sort((a, b) => b.count - a.count)[0].delimiter;
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { current += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(current); current = ''; continue; }
    if (char === '\n' && !quoted) { row.push(current); rows.push(row); row = []; current = ''; continue; }
    current += char;
  }
  if (quoted) throw new Error('В CSV/TSV есть незакрытая кавычка');
  row.push(current);
  rows.push(row);
  return rows;
}

function fieldLabel(value: string) {
  return fieldLabels[value] ?? value;
}

const importKinds: DataTransferKind[] = ['clients', 'history', 'catalog', 'stock'];

const targetAliases: Record<DataTransferKind, Record<string, string[]>> = {
  clients: {
    source_id: ['id', 'внешний id', 'идентификатор', 'id строки'],
    owner_source_id: ['id владельца', 'owner id'], animal_source_id: ['id пациента', 'id животного', 'animal id'],
    owner_name: ['владелец', 'фио', 'фио владельца', 'клиент', 'заказчик'], phone: ['телефон', 'мобильный', 'phone', 'номер телефона'],
    extra_phone: ['доп телефон', 'дополнительный телефон'], email: ['email', 'e-mail', 'почта'], address: ['адрес', 'место жительства'],
    owner_comment: ['комментарий владельца', 'примечание владельца'], animal_name: ['кличка', 'пациент', 'животное', 'кличка пациента'],
    species: ['вид', 'тип животного'], animal_status: ['статус пациента', 'статус животного'], breed: ['порода'], sex: ['пол'],
    birth_date: ['дата рождения', 'день рождения'], microchip: ['микрочип', 'чип', 'номер чипа'], animal_comment: ['комментарий пациента', 'примечание пациента'],
    vaccination_title: ['вакцинация', 'вакцина'], vaccinated_at: ['дата вакцинации'], vaccination_due_at: ['следующая вакцинация', 'ревакцинация'], vaccination_series: ['серия вакцины'],
  },
  history: {
    source_id: ['id', 'внешний id', 'id записи'], owner_name: ['владелец', 'фио владельца', 'клиент'], phone: ['телефон', 'phone'],
    animal_name: ['кличка', 'пациент', 'животное'], species: ['вид'], breed: ['порода'], microchip: ['микрочип', 'чип'],
    visit_date: ['дата приема', 'дата приёма', 'прием', 'визит', 'дата обращения'], doctor: ['врач', 'доктор'], visit_type: ['тип приема', 'тип приёма'],
    purpose: ['причина обращения', 'цель приема'], anamnesis: ['анамнез'], examination: ['осмотр'], symptoms: ['симптомы', 'жалобы'],
    manipulations: ['манипуляции', 'процедуры'], diagnosis: ['диагноз'], diagnosis_description: ['описание диагноза'], treatment_plan: ['назначения', 'лечение'],
    care_notes: ['рекомендации'], amount: ['сумма счета', 'стоимость'], bill_status: ['статус оплаты'], document_title: ['название документа'], document_body: ['текст документа'],
  },
  catalog: {
    source_id: ['id', 'внешний id', 'код', 'id строки'], item_type: ['тип', 'тип позиции', 'вид позиции'], title: ['наименование', 'название', 'товар', 'услуга'],
    category: ['категория', 'группа', 'раздел'], sku: ['артикул', 'sku'], barcode: ['штрихкод', 'штрих код', 'barcode'], price: ['цена', 'цена продажи', 'стоимость', 'цена в рублях'],
    minimum_price: ['минимальная цена', 'мин цена'], price_type: ['тип цены', 'вид цены', 'фиксированная цена', 'плавающая цена'], unit: ['единица', 'ед изм', 'ед. изм.', 'единица измерения'], min_stock: ['минимальный остаток', 'мин остаток'],
    description: ['описание', 'комментарий', 'примечание'], price_note: ['исходная цена', 'текст цены', 'тариф'], review_status: ['требует проверки', 'проверка цены'],
  },
  stock: {
    source_id: ['id', 'внешний id', 'код'], title: ['наименование', 'название', 'товар'], category: ['категория', 'группа'], sku: ['артикул', 'sku'], barcode: ['штрихкод', 'barcode'],
    unit: ['единица', 'ед изм', 'единица измерения'], quantity: ['остаток', 'количество', 'количество на складе'], price: ['цена продажи', 'цена'],
    purchase_price: ['закупочная цена', 'себестоимость'], min_stock: ['минимальный остаток'], warehouse: ['склад', 'место хранения'],
    expires_at: ['срок годности', 'годен до'], series: ['серия', 'партия'], description: ['описание', 'комментарий'],
  },
};

const fieldLabels: Record<string, string> = {
  source_id: 'идентификатор', owner_name: 'ФИО владельца', phone: 'телефон', animal_name: 'кличку пациента', species: 'вид животного',
  visit_date: 'дату приёма', diagnosis: 'диагноз', anamnesis: 'анамнез', examination: 'осмотр', treatment_plan: 'назначения',
  title: 'наименование', price: 'цену', minimum_price: 'минимальную цену', price_type: 'тип цены', item_type: 'тип позиции', barcode: 'штрихкод', sku: 'артикул', category: 'категорию', unit: 'единицу измерения',
  quantity: 'остаток', warehouse: 'склад', purchase_price: 'закупочную цену', expires_at: 'срок годности', series: 'серию',
};

const allKnownAliases = new Set(Object.values(targetAliases).flatMap((kind) => Object.values(kind)).flat().map(normalizeHeader));
