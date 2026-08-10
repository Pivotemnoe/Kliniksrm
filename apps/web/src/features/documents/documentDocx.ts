import { strToU8, zipSync } from 'fflate';
import { DocumentLayout, DocumentLayoutBlock, createDefaultDocumentLayout } from './documentLayout';

export function exportDocumentDocx({
  title,
  body,
  layout,
  renderText = (text) => text,
}: {
  title: string;
  body?: string | null;
  layout?: DocumentLayout | null;
  renderText?: (text: string) => string;
}) {
  const effectiveLayout = layout ?? createDefaultDocumentLayout(body ?? '');
  const content = buildDocumentXml(title, effectiveLayout, renderText);
  const archive = zipSync({
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(packageRelationshipsXml),
    'word/document.xml': strToU8(content),
    'word/styles.xml': strToU8(stylesXml),
    'word/_rels/document.xml.rels': strToU8(documentRelationshipsXml),
  });
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(archive)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(title || 'Документ')}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildDocumentXml(title: string, layout: DocumentLayout, renderText: (text: string) => string) {
  const blocks: string[] = [];
  if (layout.page.showClinicHeader) {
    blocks.push(paragraph('TemichevVet', { bold: true, size: 18, color: '17324D' }));
    blocks.push(paragraph('Документ ветеринарной клиники', { size: 9, color: '66788A' }));
  }
  blocks.push(paragraph(title || 'Без названия', { bold: true, size: 18, color: '17324D', spacingAfter: 180 }));
  if (layout.page.showVisitMeta) {
    blocks.push(
      tableXml([
        ['Дата приёма: —', 'Врач: —'],
        ['Владелец: —', 'Пациент: —'],
      ], 0, renderText),
    );
  }
  layout.blocks.forEach((block) => blocks.push(blockXml(block, renderText, layout.page.fontSize)));
  if (layout.page.showSignatures) {
    blocks.push(paragraph(''));
    blocks.push(tableXml([['____________________\nПодпись владельца', '____________________\nПодпись врача']], 0, renderText));
  }
  const margins = layout.page;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${blocks.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="${margins.marginTop * 20}" w:right="${margins.marginRight * 20}" w:bottom="${margins.marginBottom * 20}" w:left="${margins.marginLeft * 20}" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function blockXml(block: DocumentLayoutBlock, renderText: (text: string) => string, defaultFontSize: number) {
  if (block.type === 'text') {
    return paragraph(renderText(block.text), {
      bold: block.bold,
      italic: block.italic,
      size: block.fontSize || defaultFontSize,
      align: block.align,
    });
  }
  if (block.type === 'table') return tableXml(block.rows, block.headerRows, renderText);
  if (block.type === 'pageBreak') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  return `<w:p><w:pPr><w:spacing w:after="${Math.round(block.height * 20)}"/></w:pPr></w:p>`;
}

function paragraph(
  text: string,
  options: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    color?: string;
    align?: string;
    spacingAfter?: number;
  } = {},
) {
  const lines = text.split('\n');
  const runs = lines
    .map(
      (line, index) =>
        `${index ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${options.bold ? '<w:b/>' : ''}${options.italic ? '<w:i/>' : ''}${options.size ? `<w:sz w:val="${options.size * 2}"/>` : ''}${options.color ? `<w:color w:val="${options.color}"/>` : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`,
    )
    .join('');
  return `<w:p><w:pPr>${options.align ? `<w:jc w:val="${options.align}"/>` : ''}${options.spacingAfter ? `<w:spacing w:after="${options.spacingAfter}"/>` : ''}</w:pPr>${runs}</w:p>`;
}

function tableXml(rows: string[][], headerRows: number, renderText: (text: string) => string) {
  if (!rows.length) return '';
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="9AABB8"/><w:left w:val="single" w:sz="4" w:color="9AABB8"/><w:bottom w:val="single" w:sz="4" w:color="9AABB8"/><w:right w:val="single" w:sz="4" w:color="9AABB8"/><w:insideH w:val="single" w:sz="4" w:color="9AABB8"/><w:insideV w:val="single" w:sz="4" w:color="9AABB8"/></w:tblBorders></w:tblPr>${rows
    .map(
      (row, rowIndex) =>
        `<w:tr>${row
          .map(
            (cell) =>
              `<w:tc><w:tcPr>${rowIndex < headerRows ? '<w:shd w:fill="EEF5F6"/>' : ''}</w:tcPr>${paragraph(renderText(cell), { bold: rowIndex < headerRows, size: 10 })}</w:tc>`,
          )
          .join('')}</w:tr>`,
    )
    .join('')}</w:tbl>`;
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function safeFileName(value: string) {
  return value.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'Документ';
}

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
const packageRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const documentRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
