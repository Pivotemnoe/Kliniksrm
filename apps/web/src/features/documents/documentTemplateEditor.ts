export type DocumentTemplateSelection = {
  start: number;
  end: number;
};

export type DocumentTemplateInsertion = {
  value: string;
  cursor: number;
};

export function insertDocumentTemplateContent(
  body: string,
  content: string,
  selection: DocumentTemplateSelection,
  kind: 'inline' | 'block' = 'inline',
): DocumentTemplateInsertion {
  const start = clamp(selection.start, 0, body.length);
  const end = clamp(selection.end, start, body.length);
  const before = body.slice(0, start);
  const after = body.slice(end);

  if (kind === 'block') {
    const normalizedContent = content.trim();
    const prefix = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const suffix = after.length === 0 || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const inserted = `${prefix}${normalizedContent}${suffix}`;

    return {
      value: `${before}${inserted}${after}`,
      cursor: before.length + prefix.length + normalizedContent.length,
    };
  }

  const prefix = needsInlineSeparator(before.at(-1)) ? ' ' : '';
  const suffix = needsInlineSeparator(after.at(0)) ? ' ' : '';
  const inserted = `${prefix}${content}${suffix}`;

  return {
    value: `${before}${inserted}${after}`,
    cursor: before.length + prefix.length + content.length,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : max, min), max);
}

function needsInlineSeparator(character: string | undefined) {
  return Boolean(character && !/[\s([{"'«—–-]/.test(character));
}
