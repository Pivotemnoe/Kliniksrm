import type { DocumentTemplate } from '../documents/types';

// Preserve template order, including each row of a composite document's tables.
export function documentFragments(template: DocumentTemplate): string[] {
  if (template.layout?.blocks.length) return template.layout.blocks.flatMap(block => {
    if (block.type === 'text') return block.text.trim() ? [block.text] : [];
    if (block.type === 'table') return block.rows.map(row => row.filter(Boolean).join(' | ')).filter(text => text.trim());
    return [];
  });
  return (template.body ?? '').split(/\n\s*\n/).filter(text => text.trim());
}
