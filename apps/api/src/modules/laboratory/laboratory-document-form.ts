import type { DocumentLayout, DocumentTableBlock } from '../documents/document-layout';
import { tryNormalizeDocumentLayout } from '../documents/document-layout';

export type LaboratoryDocumentIndicator = {
  blockId: string;
  rowIndex: number;
  resultColumnIndex: number;
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
  }>;
};

/**
 * Reads editable result rows from a document created in the common document
 * editor. The laboratory does not own another form editor: it only binds the
 * result column of an existing document table to laboratory order items.
 */
export function extractLaboratoryDocumentIndicators(value: unknown) {
  const layout = tryNormalizeDocumentLayout(value);
  if (!layout) return { layout: null, indicators: [] as LaboratoryDocumentIndicator[] };

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
    .filter(({ header }) => header.includes('норма') || header.includes('референс'))
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
      title: title || code || 'Показатель',
      code,
      unit: unitColumnIndex === undefined ? null : cleanCell(row[unitColumnIndex]),
      referenceRange,
    }];
  });
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
