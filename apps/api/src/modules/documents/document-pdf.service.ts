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
  ownerPhone: string;
  animalName: string;
  animalDescription: string;
};

@Injectable()
export class DocumentPdfService {
  render(snapshot: DocumentPdfSnapshot) {
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

      document.font('Roboto-Bold').fontSize(18).fillColor('#17324d').text(snapshot.clinicName || 'TemichevVet');
      document
        .font('Roboto')
        .fontSize(9)
        .fillColor('#66788a')
        .text('Документ ветеринарной клиники');
      document.moveDown(0.8).strokeColor('#1f7880').lineWidth(1.2).moveTo(52, document.y).lineTo(543, document.y).stroke();
      document.moveDown(1.2);
      document.font('Roboto-Bold').fontSize(18).fillColor('#17324d').text(snapshot.title);
      document.moveDown(0.8);

      const metaTop = document.y;
      drawMeta(document, 52, metaTop, 'Дата приёма', formatDateTime(snapshot.visitStartedAt));
      drawMeta(document, 300, metaTop, 'Врач', snapshot.employeeName || '—');
      drawMeta(document, 52, metaTop + 38, 'Владелец', snapshot.ownerName || '—');
      drawMeta(document, 300, metaTop + 38, 'Телефон', snapshot.ownerPhone || '—');
      drawMeta(document, 52, metaTop + 76, 'Пациент', snapshot.animalName || '—');
      drawMeta(document, 300, metaTop + 76, 'Вид / порода', snapshot.animalDescription || '—');
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

function drawMeta(document: PDFKit.PDFDocument, x: number, y: number, label: string, value: string) {
  document.font('Roboto').fontSize(8).fillColor('#7b8794').text(label, x, y, { width: 230, lineBreak: false });
  document.font('Roboto-Bold').fontSize(10).fillColor('#25384a').text(value, x, y + 12, { width: 230, height: 22 });
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
