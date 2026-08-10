import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DocumentLayout, DocumentLayoutBlock } from './document-layout';

const robotoVfs = require('pdfmake/build/vfs_fonts') as Record<string, string>;
const robotoRegular = Buffer.from(robotoVfs['Roboto-Regular.ttf'], 'base64');
const robotoBold = Buffer.from(robotoVfs['Roboto-Medium.ttf'], 'base64');
const robotoItalic = Buffer.from(robotoVfs['Roboto-Italic.ttf'], 'base64');
const robotoBoldItalic = Buffer.from(robotoVfs['Roboto-MediumItalic.ttf'], 'base64');

export type DocumentPdfSnapshot = {
  title: string;
  body: string;
  clinicName: string;
  visitStartedAt: string;
  employeeName: string;
  ownerName: string;
  animalName: string;
  animalDescription: string;
  layout?: DocumentLayout | null;
};

export type DocumentPdfLogo = {
  data: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
};

@Injectable()
export class DocumentPdfService {
  render(snapshot: DocumentPdfSnapshot, clinicLogo?: DocumentPdfLogo) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const document = new PDFDocument({
        size: 'A4',
        margins: snapshot.layout
          ? {
              top: snapshot.layout.page.marginTop,
              right: snapshot.layout.page.marginRight,
              bottom: snapshot.layout.page.marginBottom,
              left: snapshot.layout.page.marginLeft,
            }
          : { top: 48, right: 52, bottom: 52, left: 52 },
        bufferPages: true,
        info: {
          Title: snapshot.title,
          Author: snapshot.clinicName,
          Subject: 'Документ ветеринарной клиники',
        },
      });

      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));

      document.registerFont('Roboto', robotoRegular);
      document.registerFont('Roboto-Bold', robotoBold);
      document.registerFont('Roboto-Italic', robotoItalic);
      document.registerFont('Roboto-BoldItalic', robotoBoldItalic);

      if (snapshot.layout) {
        drawStructuredDocument(document, snapshot, clinicLogo);
      } else {
        drawLegacyDocument(document, snapshot, clinicLogo);
      }

      const pages = document.bufferedPageRange();
      for (let index = 0; index < pages.count; index += 1) {
        document.switchToPage(pages.start + index);
        const footerY = document.page.height - document.page.margins.bottom - 12;
        document
          .font('Roboto')
          .fontSize(8)
          .fillColor('#7b8794')
          .text(`Страница ${index + 1} из ${pages.count}`, document.page.margins.left, footerY, {
            width: contentWidth(document),
            align: 'right',
            lineBreak: false,
          });
      }

      document.end();
    });
  }
}

function drawLegacyDocument(
  document: PDFKit.PDFDocument,
  snapshot: DocumentPdfSnapshot,
  clinicLogo?: DocumentPdfLogo,
) {
  drawHeader(document, snapshot, clinicLogo);
  document.font('Roboto-Bold').fontSize(18).fillColor('#17324d').text(snapshot.title);
  document.moveDown(0.8);

  const metaTop = document.y;
  drawVisitMeta(document, snapshot, metaTop);
  document.y = metaTop + 126;
  document.font('Roboto').fontSize(11).fillColor('#17202a').text(snapshot.body || '—', 52, document.y, {
    width: 491,
    align: 'left',
    lineGap: 3,
  });

  if (document.y > 680) document.addPage();
  document.moveDown(3);
  const signatureY = Math.max(document.y, 700);
  drawSignature(document, 52, signatureY, 'Подпись владельца');
  drawSignature(document, 310, signatureY, 'Подпись врача');
}

function drawStructuredDocument(
  document: PDFKit.PDFDocument,
  snapshot: DocumentPdfSnapshot,
  clinicLogo?: DocumentPdfLogo,
) {
  const layout = snapshot.layout!;
  const left = document.page.margins.left;
  const width = contentWidth(document);

  if (layout.page.showClinicHeader) drawHeader(document, snapshot, clinicLogo);
  document.font('Roboto-Bold').fontSize(18).fillColor('#17324d').text(snapshot.title, left, document.y, { width });
  document.moveDown(0.8);

  if (layout.page.showVisitMeta) {
    const metaTop = document.y;
    drawVisitMeta(document, snapshot, metaTop);
    document.y = metaTop + 126;
  }

  for (const block of layout.blocks) drawLayoutBlock(document, block, layout);

  if (!layout.blocks.length) {
    document.font('Roboto').fontSize(layout.page.fontSize).fillColor('#17202a').text(snapshot.body || '—', left, document.y, {
      width,
      lineGap: layout.page.lineGap,
    });
  }

  if (layout.page.showSignatures) {
    ensureVerticalSpace(document, 82);
    const signatureY = document.y + 34;
    const gap = 38;
    const signatureWidth = (width - gap) / 2;
    drawSignature(document, left, signatureY, 'Подпись владельца', signatureWidth);
    drawSignature(document, left + signatureWidth + gap, signatureY, 'Подпись врача', signatureWidth);
    document.y = signatureY + 28;
  }
}

function drawVisitMeta(document: PDFKit.PDFDocument, snapshot: DocumentPdfSnapshot, top: number) {
  const left = document.page.margins.left;
  const width = contentWidth(document);
  const gap = 18;
  const columnWidth = (width - gap) / 2;
  drawMeta(document, left, top, 'Дата приёма', formatDateTime(snapshot.visitStartedAt), columnWidth);
  drawMeta(document, left + columnWidth + gap, top, 'Врач', snapshot.employeeName || '—', columnWidth);
  drawMeta(document, left, top + 38, 'Владелец', snapshot.ownerName || '—', columnWidth);
  drawMeta(document, left + columnWidth + gap, top + 38, 'Пациент', snapshot.animalName || '—', columnWidth);
  drawMeta(document, left, top + 76, 'Вид / порода / пол', snapshot.animalDescription || '—', width);
}

function drawLayoutBlock(document: PDFKit.PDFDocument, block: DocumentLayoutBlock, layout: DocumentLayout) {
  if (block.type === 'pageBreak') {
    document.addPage();
    return;
  }
  if (block.type === 'spacer') {
    ensureVerticalSpace(document, block.height);
    document.y += block.height;
    return;
  }
  if (block.type === 'table') {
    drawTable(document, block.rows, block.headerRows, layout.page.fontSize);
    document.moveDown(0.6);
    return;
  }

  const fontName = block.bold
    ? block.italic
      ? 'Roboto-BoldItalic'
      : 'Roboto-Bold'
    : block.italic
      ? 'Roboto-Italic'
      : 'Roboto';
  document
    .font(fontName)
    .fontSize(block.fontSize || layout.page.fontSize)
    .fillColor('#17202a')
    .text(block.text || ' ', document.page.margins.left, document.y, {
      width: contentWidth(document),
      align: block.align,
      lineGap: layout.page.lineGap,
    });
  document.moveDown(0.45);
}

function drawTable(document: PDFKit.PDFDocument, rows: string[][], headerRows: number, fontSize: number) {
  if (!rows.length) return;
  const left = document.page.margins.left;
  const width = contentWidth(document);
  const columns = Math.max(1, rows[0]?.length ?? 1);
  const cellWidth = width / columns;
  const padding = 5;

  rows.forEach((row, rowIndex) => {
    document
      .font(rowIndex < headerRows ? 'Roboto-Bold' : 'Roboto')
      .fontSize(Math.max(8, Math.min(fontSize, 12)));
    const rowHeight = Math.max(
      24,
      ...row.map((cell) =>
        document.heightOfString(cell || ' ', {
          width: cellWidth - padding * 2,
          lineGap: 1,
        }),
      ),
    ) + padding * 2;
    ensureVerticalSpace(document, rowHeight);
    const top = document.y;
    row.forEach((cell, columnIndex) => {
      const x = left + columnIndex * cellWidth;
      if (rowIndex < headerRows) document.save().fillColor('#eef5f6').rect(x, top, cellWidth, rowHeight).fill().restore();
      document.strokeColor('#9aabb8').lineWidth(0.45).rect(x, top, cellWidth, rowHeight).stroke();
      document
        .font(rowIndex < headerRows ? 'Roboto-Bold' : 'Roboto')
        .fontSize(Math.max(8, Math.min(fontSize, 12)))
        .fillColor('#17202a')
        .text(cell || ' ', x + padding, top + padding, {
          width: cellWidth - padding * 2,
          height: rowHeight - padding * 2,
          lineGap: 1,
        });
    });
    document.y = top + rowHeight;
  });
}

function ensureVerticalSpace(document: PDFKit.PDFDocument, height: number) {
  const bottom = document.page.height - document.page.margins.bottom - 18;
  if (document.y + height > bottom) document.addPage();
}

function contentWidth(document: PDFKit.PDFDocument) {
  return document.page.width - document.page.margins.left - document.page.margins.right;
}

function drawHeader(document: PDFKit.PDFDocument, snapshot: DocumentPdfSnapshot, clinicLogo?: DocumentPdfLogo) {
  const left = document.page.margins.left;
  const width = contentWidth(document);
  let logoRendered = false;
  if (clinicLogo && hasExpectedLogoSignature(clinicLogo)) {
    try {
      document.image(clinicLogo.data, left, 38, { fit: [54, 54], align: 'center', valign: 'center' });
      logoRendered = true;
    } catch {
      // Keep a clean text header if a previously uploaded image can no longer be decoded.
    }
  }

  const textX = logoRendered ? left + 68 : left;
  document
    .font('Roboto-Bold')
    .fontSize(18)
    .fillColor('#17324d')
    .text(snapshot.clinicName || 'TemichevVet', textX, 47, { width: left + width - textX, lineBreak: false, ellipsis: true });
  document
    .font('Roboto')
    .fontSize(9)
    .fillColor('#66788a')
    .text('Документ ветеринарной клиники', textX, 72, { width: left + width - textX, lineBreak: false });
  document.strokeColor('#1f7880').lineWidth(1.2).moveTo(left, 104).lineTo(left + width, 104).stroke();
  document.y = 119;
}

function hasExpectedLogoSignature(logo: DocumentPdfLogo) {
  if (logo.mimeType === 'image/jpeg') {
    return logo.data.length >= 3 && logo.data[0] === 0xff && logo.data[1] === 0xd8 && logo.data[2] === 0xff;
  }
  return (
    logo.data.length >= 8 &&
    logo.data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}

function drawMeta(document: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, width = 230) {
  document.font('Roboto').fontSize(8).fillColor('#7b8794').text(label, x, y, { width, lineBreak: false });
  document.font('Roboto-Bold').fontSize(10).fillColor('#25384a').text(value, x, y + 12, { width, height: 22 });
}

function drawSignature(document: PDFKit.PDFDocument, x: number, y: number, label: string, width = 220) {
  document.strokeColor('#66788a').lineWidth(0.6).moveTo(x, y).lineTo(x + width, y).stroke();
  document.font('Roboto').fontSize(8).fillColor('#66788a').text(label, x, y + 6, { width });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}
