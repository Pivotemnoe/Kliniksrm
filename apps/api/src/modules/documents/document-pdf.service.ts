import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

const robotoVfs = require('pdfmake/build/vfs_fonts') as Record<string, string>;
const robotoRegular = Buffer.from(robotoVfs['Roboto-Regular.ttf'], 'base64');
const robotoBold = Buffer.from(robotoVfs['Roboto-Medium.ttf'], 'base64');

export type DocumentPdfSnapshot = {
  title: string;
  body: string;
  clinicName: string;
  visitStartedAt: string;
  employeeName: string;
  ownerName: string;
  animalName: string;
  animalDescription: string;
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
        margins: { top: 48, right: 52, bottom: 52, left: 52 },
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

      drawHeader(document, snapshot, clinicLogo);
      document.font('Roboto-Bold').fontSize(18).fillColor('#17324d').text(snapshot.title);
      document.moveDown(0.8);

      const metaTop = document.y;
      drawMeta(document, 52, metaTop, 'Дата приёма', formatDateTime(snapshot.visitStartedAt));
      drawMeta(document, 300, metaTop, 'Врач', snapshot.employeeName || '—');
      drawMeta(document, 52, metaTop + 38, 'Владелец', snapshot.ownerName || '—');
      drawMeta(document, 300, metaTop + 38, 'Пациент', snapshot.animalName || '—');
      drawMeta(document, 52, metaTop + 76, 'Вид / порода / пол', snapshot.animalDescription || '—', 491);
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

      const pages = document.bufferedPageRange();
      for (let index = 0; index < pages.count; index += 1) {
        document.switchToPage(pages.start + index);
        document
          .font('Roboto')
          .fontSize(8)
          .fillColor('#7b8794')
          .text(`Страница ${index + 1} из ${pages.count}`, 52, 780, { width: 491, align: 'right', lineBreak: false });
      }

      document.end();
    });
  }
}

function drawHeader(document: PDFKit.PDFDocument, snapshot: DocumentPdfSnapshot, clinicLogo?: DocumentPdfLogo) {
  let logoRendered = false;
  if (clinicLogo && hasExpectedLogoSignature(clinicLogo)) {
    try {
      document.image(clinicLogo.data, 52, 38, { fit: [54, 54], align: 'center', valign: 'center' });
      logoRendered = true;
    } catch {
      // Keep a clean text header if a previously uploaded image can no longer be decoded.
    }
  }

  const textX = logoRendered ? 120 : 52;
  document
    .font('Roboto-Bold')
    .fontSize(18)
    .fillColor('#17324d')
    .text(snapshot.clinicName || 'TemichevVet', textX, 47, { width: 543 - textX, lineBreak: false, ellipsis: true });
  document
    .font('Roboto')
    .fontSize(9)
    .fillColor('#66788a')
    .text('Документ ветеринарной клиники', textX, 72, { width: 543 - textX, lineBreak: false });
  document.strokeColor('#1f7880').lineWidth(1.2).moveTo(52, 104).lineTo(543, 104).stroke();
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

function drawSignature(document: PDFKit.PDFDocument, x: number, y: number, label: string) {
  document.strokeColor('#66788a').lineWidth(0.6).moveTo(x, y).lineTo(x + 220, y).stroke();
  document.font('Roboto').fontSize(8).fillColor('#66788a').text(label, x, y + 6, { width: 220 });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}
