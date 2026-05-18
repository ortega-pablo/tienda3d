import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { QuoteDto } from './quotes.types';

const FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
};

@Injectable()
export class PdfService {
  async generateQuotePdf(quote: QuoteDto): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, quote);
      this.renderCustomer(doc, quote);
      this.renderItems(doc, quote);
      this.renderTotals(doc, quote);
      this.renderFooter(doc, quote);

      doc.end();
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    doc
      .fontSize(20)
      .fillColor('#0f172a')
      .text('Plastik 3D', { continued: true })
      .fontSize(10)
      .fillColor('#64748b')
      .text('   ·   Cotización', { align: 'left' });

    doc
      .moveDown(0.2)
      .fontSize(9)
      .fillColor('#475569')
      .text('Cotizador, costeo y stock');

    doc.moveDown(1);

    const headerY = doc.y;
    doc
      .fontSize(16)
      .fillColor('#0f172a')
      .text(quote.code, { continued: true });
    doc
      .fontSize(10)
      .fillColor('#64748b')
      .text(`   ·   ${STATUS_LABEL[quote.status] ?? quote.status}`);

    doc
      .fontSize(9)
      .fillColor('#475569')
      .text(`Emitida ${quote.createdAt.toLocaleDateString('es-AR')}`);
    if (quote.validUntil) {
      doc.text(`Válida hasta ${quote.validUntil.toLocaleDateString('es-AR')}`);
    }

    doc.moveDown(0.8);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.6);
    void headerY;
  }

  private renderCustomer(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    doc.fontSize(11).fillColor('#0f172a').text('Cliente', { continued: false });
    doc.fontSize(10).fillColor('#0f172a').text(quote.customerName);
    doc.fontSize(9).fillColor('#475569');
    if (quote.customerEmail) doc.text(quote.customerEmail);
    if (quote.customerPhone) doc.text(quote.customerPhone);
    if (quote.channelName) doc.text(`Canal: ${quote.channelName}`);
    doc.moveDown(0.8);
  }

  private renderItems(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    const startX = 40;
    const widths = [240, 60, 90, 90];
    const headerY = doc.y;

    doc
      .fontSize(9)
      .fillColor('#475569')
      .text('Detalle', startX, headerY, { width: widths[0] });
    doc.text('Cant.', startX + widths[0]!, headerY, { width: widths[1], align: 'right' });
    doc.text('Precio unit.', startX + widths[0]! + widths[1]!, headerY, {
      width: widths[2],
      align: 'right',
    });
    doc.text('Subtotal', startX + widths[0]! + widths[1]! + widths[2]!, headerY, {
      width: widths[3],
      align: 'right',
    });

    doc
      .moveTo(startX, headerY + 14)
      .lineTo(555, headerY + 14)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.y = headerY + 22;
    doc.fillColor('#0f172a').fontSize(10);

    for (const item of quote.items) {
      // Si el item ADHOC tiene cargo de diseño, lo mostramos como sub-línea
      // separada para que el cliente vea el desglose. La fila principal pasa
      // a mostrar (qty × unitPrice), y la sub-fila aporta el diseño hasta
      // sumar el lineTotal persistido.
      const designSurcharge =
        item.adhocPayload && typeof item.adhocPayload.designSurcharge === 'number'
          ? item.adhocPayload.designSurcharge
          : 0;
      const productLineTotal = item.lineTotal - designSurcharge;
      const batchSize =
        item.adhocPayload &&
        item.adhocPayload.templateKind === 'KEYCHAIN' &&
        typeof item.adhocPayload.batchSize === 'number' &&
        item.adhocPayload.batchSize > 1
          ? item.adhocPayload.batchSize
          : null;

      const rowY = doc.y;
      doc.text(item.description, startX, rowY, { width: widths[0] });
      doc.text(this.fmtQty(item.quantity), startX + widths[0]!, rowY, {
        width: widths[1],
        align: 'right',
      });
      doc.text(FORMATTER.format(item.unitPrice), startX + widths[0]! + widths[1]!, rowY, {
        width: widths[2],
        align: 'right',
      });
      doc.text(
        FORMATTER.format(productLineTotal),
        startX + widths[0]! + widths[1]! + widths[2]!,
        rowY,
        { width: widths[3], align: 'right' },
      );
      doc.moveDown(0.6);

      if (batchSize != null) {
        const subY = doc.y;
        doc
          .fontSize(8)
          .fillColor('#64748b')
          .text(
            `  Cotización basada en un batch de ${batchSize} unidades`,
            startX,
            subY,
            { width: widths[0]! + widths[1]! + widths[2]! + widths[3]! },
          );
        doc.fontSize(10).fillColor('#0f172a');
        doc.moveDown(0.5);
      }

      if (designSurcharge > 0) {
        const subY = doc.y;
        doc
          .fontSize(9)
          .fillColor('#475569')
          .text('  Cargo único de diseño', startX, subY, { width: widths[0] });
        doc.text(
          FORMATTER.format(designSurcharge),
          startX + widths[0]! + widths[1]! + widths[2]!,
          subY,
          { width: widths[3], align: 'right' },
        );
        doc.fontSize(10).fillColor('#0f172a');
        doc.moveDown(0.6);
      }
    }

    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(555, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.5);
  }

  private renderTotals(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    const right = (label: string, value: string, opts: { bold?: boolean } = {}) => {
      const y = doc.y;
      doc.fontSize(opts.bold ? 12 : 10).fillColor(opts.bold ? '#0f172a' : '#475569');
      doc.text(label, 320, y, { width: 120, align: 'right' });
      doc.fontSize(opts.bold ? 13 : 10).fillColor('#0f172a');
      doc.text(value, 445, y, { width: 110, align: 'right' });
      doc.moveDown(0.6);
    };

    right('Subtotal', FORMATTER.format(quote.subtotal));
    if (quote.discount > 0) right('Descuento', `- ${FORMATTER.format(quote.discount)}`);
    right('Total', FORMATTER.format(quote.total), { bold: true });

    if (quote.withInvoice) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#475569').text('Operación con factura', { align: 'right' });
    }
  }

  private renderFooter(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    if (quote.notes) {
      doc.moveDown(1);
      doc.fontSize(10).fillColor('#0f172a').text('Notas');
      doc.fontSize(9).fillColor('#475569').text(quote.notes, { width: 515 });
    }
    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(
        `Generado por Plastik 3D · Cotizador y costeo · ${new Date().toLocaleString('es-AR')}`,
        40,
        780,
        { align: 'center', width: 515 },
      );
  }

  private fmtQty(n: number): string {
    return Number.isInteger(n) ? n.toString() : n.toFixed(2);
  }
}
