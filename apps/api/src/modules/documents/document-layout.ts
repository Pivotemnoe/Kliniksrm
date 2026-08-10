import { BadRequestException } from '@nestjs/common';

export type DocumentTextAlign = 'left' | 'center' | 'right' | 'justify';

export type DocumentLayoutPage = {
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  fontSize: number;
  lineGap: number;
  showClinicHeader: boolean;
  showVisitMeta: boolean;
  showSignatures: boolean;
};

export type DocumentTextBlock = {
  id: string;
  type: 'text';
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: DocumentTextAlign;
};

export type DocumentTableBlock = {
  id: string;
  type: 'table';
  rows: string[][];
  headerRows: number;
};

export type DocumentSpacerBlock = {
  id: string;
  type: 'spacer';
  height: number;
};

export type DocumentPageBreakBlock = {
  id: string;
  type: 'pageBreak';
};

export type DocumentLayoutBlock =
  | DocumentTextBlock
  | DocumentTableBlock
  | DocumentSpacerBlock
  | DocumentPageBreakBlock;

export type DocumentLayout = {
  schemaVersion: 1;
  page: DocumentLayoutPage;
  blocks: DocumentLayoutBlock[];
};

export const defaultDocumentLayoutPage: DocumentLayoutPage = {
  marginTop: 48,
  marginRight: 52,
  marginBottom: 52,
  marginLeft: 52,
  fontSize: 11,
  lineGap: 3,
  showClinicHeader: true,
  showVisitMeta: true,
  showSignatures: true,
};

export function normalizeDocumentLayout(value: unknown): DocumentLayout | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new BadRequestException('Макет документа должен быть объектом');
  if (value.schemaVersion !== 1) throw new BadRequestException('Версия макета документа не поддерживается');

  const rawPage = isRecord(value.page) ? value.page : {};
  const rawBlocks = Array.isArray(value.blocks) ? value.blocks : [];
  if (rawBlocks.length > 80) throw new BadRequestException('В одном документе может быть не более 80 блоков');

  return {
    schemaVersion: 1,
    page: {
      marginTop: numberInRange(rawPage.marginTop, defaultDocumentLayoutPage.marginTop, 24, 96),
      marginRight: numberInRange(rawPage.marginRight, defaultDocumentLayoutPage.marginRight, 24, 96),
      marginBottom: numberInRange(rawPage.marginBottom, defaultDocumentLayoutPage.marginBottom, 24, 96),
      marginLeft: numberInRange(rawPage.marginLeft, defaultDocumentLayoutPage.marginLeft, 24, 96),
      fontSize: numberInRange(rawPage.fontSize, defaultDocumentLayoutPage.fontSize, 8, 18),
      lineGap: numberInRange(rawPage.lineGap, defaultDocumentLayoutPage.lineGap, 0, 10),
      showClinicHeader: booleanValue(rawPage.showClinicHeader, true),
      showVisitMeta: booleanValue(rawPage.showVisitMeta, true),
      showSignatures: booleanValue(rawPage.showSignatures, true),
    },
    blocks: rawBlocks.map((block, index) => normalizeBlock(block, index)),
  };
}

export function tryNormalizeDocumentLayout(value: unknown) {
  try {
    return normalizeDocumentLayout(value);
  } catch {
    return null;
  }
}

export function renderDocumentLayout(layout: DocumentLayout | null, renderText: (value: string) => string) {
  if (!layout) return null;
  return {
    ...layout,
    blocks: layout.blocks.map((block) => {
      if (block.type === 'text') return { ...block, text: renderText(block.text) };
      if (block.type === 'table') {
        return { ...block, rows: block.rows.map((row) => row.map((cell) => renderText(cell))) };
      }
      return block;
    }),
  } satisfies DocumentLayout;
}

export function documentLayoutToPlainText(layout: DocumentLayout | null) {
  if (!layout) return '';
  return layout.blocks
    .map((block) => {
      if (block.type === 'text') return block.text;
      if (block.type === 'table') return block.rows.map((row) => row.join(' | ')).join('\n');
      if (block.type === 'pageBreak') return '\n--- Разрыв страницы ---\n';
      return '';
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function normalizeBlock(value: unknown, index: number): DocumentLayoutBlock {
  if (!isRecord(value)) throw new BadRequestException(`Блок ${index + 1} имеет неверный формат`);
  const id = safeString(value.id, 80) || `block-${index + 1}`;

  if (value.type === 'text') {
    return {
      id,
      type: 'text',
      text: safeString(value.text, 20_000),
      fontSize: numberInRange(value.fontSize, 11, 8, 28),
      bold: booleanValue(value.bold, false),
      italic: booleanValue(value.italic, false),
      align: isTextAlign(value.align) ? value.align : 'left',
    };
  }
  if (value.type === 'table') {
    const rawRows = Array.isArray(value.rows) ? value.rows : [];
    if (rawRows.length > 60) throw new BadRequestException('В таблице может быть не более 60 строк');
    const rows = rawRows.map((row, rowIndex) => {
      if (!Array.isArray(row)) throw new BadRequestException(`Строка ${rowIndex + 1} таблицы имеет неверный формат`);
      if (row.length < 1 || row.length > 6) throw new BadRequestException('В таблице должно быть от 1 до 6 столбцов');
      return row.map((cell) => safeString(cell, 2_000));
    });
    const width = rows[0]?.length ?? 2;
    if (rows.some((row) => row.length !== width)) {
      throw new BadRequestException('Во всех строках таблицы должно быть одинаковое число столбцов');
    }
    return {
      id,
      type: 'table',
      rows,
      headerRows: numberInRange(value.headerRows, 0, 0, Math.min(rows.length, 5)),
    };
  }
  if (value.type === 'spacer') {
    return { id, type: 'spacer', height: numberInRange(value.height, 16, 4, 120) };
  }
  if (value.type === 'pageBreak') return { id, type: 'pageBreak' };

  throw new BadRequestException(`Тип блока ${index + 1} не поддерживается`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numeric * 10) / 10));
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function isTextAlign(value: unknown): value is DocumentTextAlign {
  return value === 'left' || value === 'center' || value === 'right' || value === 'justify';
}
