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

export type DocumentTableBlock = { id: string; type: 'table'; rows: string[][]; headerRows: number };
export type DocumentSpacerBlock = { id: string; type: 'spacer'; height: number };
export type DocumentPageBreakBlock = { id: string; type: 'pageBreak' };
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

export function createDefaultDocumentLayout(body = ''): DocumentLayout {
  return {
    schemaVersion: 1,
    page: { ...defaultDocumentLayoutPage },
    blocks: [createTextBlock(body)],
  };
}

export function createTextBlock(text = '', overrides: Partial<DocumentTextBlock> = {}): DocumentTextBlock {
  return {
    id: createBlockId(),
    type: 'text',
    text,
    fontSize: 11,
    bold: false,
    italic: false,
    align: 'left',
    ...overrides,
  };
}

export function createTableBlock(): DocumentTableBlock {
  return {
    id: createBlockId(),
    type: 'table',
    rows: [
      ['Показатель', 'Значение'],
      ['', ''],
    ],
    headerRows: 1,
  };
}

export function createSpacerBlock(): DocumentSpacerBlock {
  return { id: createBlockId(), type: 'spacer', height: 16 };
}

export function createPageBreakBlock(): DocumentPageBreakBlock {
  return { id: createBlockId(), type: 'pageBreak' };
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

export const documentLayoutPresets: Array<{ key: string; label: string; layout: () => DocumentLayout }> = [
  {
    key: 'primary-exam',
    label: 'Лист первичного приёма',
    layout: () => ({
      schemaVersion: 1,
      page: { ...defaultDocumentLayoutPage },
      blocks: [
        createTextBlock('Жалобы:', { bold: true, fontSize: 12 }),
        createTextBlock(''),
        createTextBlock('Анамнез:', { bold: true, fontSize: 12 }),
        createTextBlock(''),
        createTextBlock('Осмотр:', { bold: true, fontSize: 12 }),
        createTextBlock(''),
        createTextBlock('Диагноз:', { bold: true, fontSize: 12 }),
        createTextBlock(''),
        createTextBlock('Рекомендации:', { bold: true, fontSize: 12 }),
        createTextBlock(''),
      ],
    }),
  },
  {
    key: 'recommendations',
    label: 'Рекомендации после приёма',
    layout: () => ({
      schemaVersion: 1,
      page: { ...defaultDocumentLayoutPage, showSignatures: false },
      blocks: [
        createTextBlock('Пациент: {animal.nickname}', { bold: true, fontSize: 12 }),
        createTextBlock('Назначения и уход:'),
        createTextBlock(''),
        createTextBlock('Контрольный визит:'),
      ],
    }),
  },
  {
    key: 'consent',
    label: 'Информированное согласие',
    layout: () => ({
      schemaVersion: 1,
      page: { ...defaultDocumentLayoutPage, showVisitMeta: false, showSignatures: true },
      blocks: [
        createTextBlock(
          'Я, {owner.fullName}, подтверждаю, что получил(а) понятную информацию о планируемых действиях в отношении пациента {animal.nickname}.',
          { align: 'justify' },
        ),
        createSpacerBlock(),
        createTextBlock('Дополнительные условия:'),
      ],
    }),
  },
];

function createBlockId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
