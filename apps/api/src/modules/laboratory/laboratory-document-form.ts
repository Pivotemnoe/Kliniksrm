import type { DocumentLayout, DocumentTableBlock } from '../documents/document-layout';
import { tryNormalizeDocumentLayout } from '../documents/document-layout';

export type LaboratoryDocumentIndicator = {
  blockId: string;
  rowIndex: number;
  resultColumnIndex: number;
  unitColumnIndex?: number;
  referenceColumnIndex?: number;
  title: string;
  code: string | null;
  unit: string | null;
  referenceRange: string | null;
};

export type LaboratoryFormSnapshot = {
  schemaVersion: 1;
  testId: string;
  testTitle: string;
  documentTemplateId: string;
  documentTemplateTitle: string;
  documentTemplateVersion: number;
  layout: DocumentLayout;
  bindings: Array<{
    itemId: string;
    blockId: string;
    rowIndex: number;
    resultColumnIndex: number;
    unitColumnIndex?: number;
    referenceColumnIndex?: number;
  }>;
};

/**
 * Reads editable result rows from a document created in the common document
 * editor. The laboratory does not own another form editor: it only binds the
 * result column of an existing document table to laboratory order items.
 */
export function extractLaboratoryDocumentIndicators(value: unknown, species?: string | null) {
  const layout = tryNormalizeDocumentLayout(value);
  if (!layout) return { layout: null, indicators: [] as LaboratoryDocumentIndicator[] };

  // Specialize only new orders, never the template or historical snapshots.
  if (species !== undefined) {
    layout.blocks = layout.blocks.map((block) => block.type === 'table' ? specializeReferences(block, species) : block);
  }

  return {
    layout,
    indicators: layout.blocks.flatMap((block) => (block.type === 'table' ? extractTableIndicators(block) : [])),
  };
}

function extractTableIndicators(block: DocumentTableBlock): LaboratoryDocumentIndicator[] {
  if (block.rows.length < 2) return [];

  const headerRowIndex = Math.max(0, Math.min(block.rows.length - 1, (block.headerRows || 1) - 1));
  const headers = block.rows[headerRowIndex].map(normalizeHeader);
  const titleColumnIndex = findColumn(headers, ['полноенаименование', 'наименование', 'тест', 'анализ'])
    ?? findColumn(headers, ['показатель']);
  const resultColumnIndex = findColumn(headers, ['результат', 'значение'])
    ?? headers.findIndex((header, index) => header.includes('показатель') && index !== titleColumnIndex);

  if (titleColumnIndex === undefined || resultColumnIndex < 0) return [];

  const codeColumnIndex = findColumn(headers, ['сокращение', 'код']);
  const unitColumnIndex = findColumn(headers, ['единицаизмерения', 'едизмерения', 'ед', 'unit']);
  const referenceColumnIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => isReferenceHeader(header))
    .map(({ index }) => index);

  return block.rows.slice(Math.max(1, block.headerRows)).flatMap((row, offset) => {
    const title = cleanCell(row[titleColumnIndex]);
    const code = codeColumnIndex === undefined ? null : cleanCell(row[codeColumnIndex]);
    if (!title && !code) return [];

    const referenceRange = referenceColumnIndexes
      .map((index) => {
        const value = cleanCell(row[index]);
        if (!value) return null;
        if (referenceColumnIndexes.length === 1) return value;
        return `${block.rows[headerRowIndex][index].trim()}: ${value}`;
      })
      .filter((value): value is string => Boolean(value))
      .join('; ') || null;

    return [{
      blockId: block.id,
      rowIndex: Math.max(1, block.headerRows) + offset,
      resultColumnIndex,
      ...(unitColumnIndex !== undefined ? { unitColumnIndex } : {}),
      ...(referenceColumnIndexes.length === 1 ? { referenceColumnIndex: referenceColumnIndexes[0] } : {}),
      title: title || code || 'Показатель',
      code,
      unit: unitColumnIndex === undefined ? null : cleanCell(row[unitColumnIndex]),
      referenceRange,
    }];
  });
}

function isReferenceHeader(header: string) {
  return header.includes('норм') || header.includes('референс');
}

function referenceSpecies(value: string): 'cat' | 'dog' | null {
  const text = normalizeHeader(value);
  if (/кош|кот|cat|feline/.test(text)) return 'cat';
  if (/собак|пес|dog|canine/.test(text)) return 'dog';
  return null;
}

function specializeReferences(block: DocumentTableBlock, species: string | null): DocumentTableBlock {
  const headerIndex = Math.max(0, (block.headerRows || 1) - 1);
  const headers = block.rows[headerIndex];
  if (!headers) return block;
  const specific = headers.flatMap((header, index) => isReferenceHeader(normalizeHeader(header)) && referenceSpecies(header) ? [index] : []);
  if (!specific.length) return block;
  const animal = referenceSpecies(species || '');
  const matched = specific.filter(index => animal && referenceSpecies(headers[index]) === animal);
  const keep = matched.length ? matched : [specific[0]];
  const indexes = headers.map((_, index) => index).filter(index => !specific.includes(index) || keep.includes(index));
  return {
    ...block,
    rows: block.rows.map((row, rowIndex) => indexes.map(index => {
      if (!matched.length && index === specific[0]) return rowIndex === headerIndex ? 'Норма (вид не определён или не поддерживается)' : '';
      return row[index] || '';
    })),
  };
}

function findColumn(headers: string[], candidates: string[]) {
  const index = headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
  return index >= 0 ? index : undefined;
}

function normalizeHeader(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function cleanCell(value?: string) {
  const trimmed = value?.trim();
  return trimmed || null;
}
