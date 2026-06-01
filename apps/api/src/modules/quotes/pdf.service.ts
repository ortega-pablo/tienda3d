import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { QuoteDto } from './quotes.types';

const FORMATTER = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});
// Layout: márgenes A4 + columnas fijas para que la tabla quede prolija
// y los multi-line de PDFKit no se desalineen (evitamos `continued: true`
// con coordenadas relativas que era el problema del layout viejo).
const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;
const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

// Anchos de columna de la tabla de items (totalizan CONTENT_WIDTH = 515).
const COL_DETAIL_W = 245;
const COL_QTY_W = 60;
const COL_PRICE_W = 100;
const COL_SUBTOTAL_W = 110;
const COL_QTY_X = PAGE_LEFT + COL_DETAIL_W;
const COL_PRICE_X = COL_QTY_X + COL_QTY_W;
const COL_SUBTOTAL_X = COL_PRICE_X + COL_PRICE_W;

// Colores (paleta neutra muy parecida a Tailwind slate).
const COLOR_TITLE = '#0f172a';
const COLOR_BODY = '#1e293b';
const COLOR_MUTED = '#64748b';
const COLOR_SUBTLE = '#94a3b8';
const COLOR_HAIRLINE = '#e2e8f0';

interface AdhocPayloadView {
  pieces?: Array<{
    name?: string;
    grams?: number;
    printMinutes?: number;
    filamentName?: string;
  }>;
  materials?: Array<{
    quantity?: number;
    materialName?: string;
  }>;
  designSurcharge?: number;
  templateKind?: string;
  batchSize?: number;
}

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

  // ----- Header: dos columnas (branding izq + metadata der) -----

  private renderHeader(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    const top = 40;
    const rightColW = 200;
    const rightColX = PAGE_RIGHT - rightColW;

    // Branding (izquierda): nombre + label "PRESUPUESTO" como tipo de documento
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(COLOR_TITLE)
      .text('Plastik 3D', PAGE_LEFT, top, { width: 300, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLOR_MUTED)
      .text('PRESUPUESTO', PAGE_LEFT, top + 30, {
        width: 300,
        characterSpacing: 1.5,
        lineBreak: false,
      });

    // Metadata (derecha) — código + fechas alineados a la derecha
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(COLOR_TITLE)
      .text(quote.code, rightColX, top, { width: rightColW, align: 'right', lineBreak: false });

    let dateY = top + 28;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(`Emitida ${quote.createdAt.toLocaleDateString('es-AR')}`, rightColX, dateY, {
        width: rightColW,
        align: 'right',
        lineBreak: false,
      });
    dateY += 12;
    if (quote.validUntil) {
      doc.text(`Válida hasta ${quote.validUntil.toLocaleDateString('es-AR')}`, rightColX, dateY, {
        width: rightColW,
        align: 'right',
        lineBreak: false,
      });
      dateY += 12;
    }

    // Separador
    const sepY = Math.max(top + 60, dateY + 6);
    doc.moveTo(PAGE_LEFT, sepY).lineTo(PAGE_RIGHT, sepY).strokeColor(COLOR_HAIRLINE).stroke();
    doc.y = sepY + 14;
  }

  // ----- Cliente -----

  private renderCustomer(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    const startY = doc.y;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR_MUTED)
      .text('CLIENTE', PAGE_LEFT, startY, {
        characterSpacing: 1.2,
        lineBreak: false,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(COLOR_TITLE)
      .text(quote.customerName, PAGE_LEFT, startY + 12, { width: CONTENT_WIDTH });

    let lineY = doc.y + 2;
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_MUTED);
    const writeLine = (text: string) => {
      doc.text(text, PAGE_LEFT, lineY, { width: CONTENT_WIDTH, lineBreak: false });
      lineY += 12;
    };
    if (quote.customerEmail) writeLine(quote.customerEmail);
    if (quote.customerPhone) writeLine(quote.customerPhone);
    if (quote.channelName) writeLine(`Canal: ${quote.channelName}`);

    doc.y = lineY + 8;
    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(COLOR_HAIRLINE).stroke();
    doc.y += 14;
  }

  // ----- Items -----

  private renderItems(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    // Header de la tabla
    this.renderTableHeader(doc);

    for (const item of quote.items) {
      this.ensureSpace(doc, 60);
      this.renderItemRow(doc, item);
    }

    doc.moveDown(0.4);
    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(COLOR_HAIRLINE).stroke();
    doc.moveDown(0.6);
  }

  private renderTableHeader(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR_MUTED);
    doc.text('DETALLE', PAGE_LEFT, y, {
      width: COL_DETAIL_W,
      characterSpacing: 1.1,
      lineBreak: false,
    });
    doc.text('CANT.', COL_QTY_X, y, {
      width: COL_QTY_W,
      align: 'right',
      characterSpacing: 1.1,
      lineBreak: false,
    });
    doc.text('PRECIO UNIT.', COL_PRICE_X, y, {
      width: COL_PRICE_W,
      align: 'right',
      characterSpacing: 1.1,
      lineBreak: false,
    });
    doc.text('SUBTOTAL', COL_SUBTOTAL_X, y, {
      width: COL_SUBTOTAL_W,
      align: 'right',
      characterSpacing: 1.1,
      lineBreak: false,
    });
    doc.y = y + 14;
    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(COLOR_HAIRLINE).stroke();
    doc.y += 6;
  }

  private renderItemRow(doc: PDFKit.PDFDocument, item: QuoteDto['items'][number]): void {
    const adhocPayload = (item.adhocPayload ?? null) as AdhocPayloadView | null;
    const designSurcharge =
      adhocPayload && typeof adhocPayload.designSurcharge === 'number'
        ? adhocPayload.designSurcharge
        : 0;
    const productLineTotal = item.lineTotal - designSurcharge;
    const batchSize =
      adhocPayload &&
      adhocPayload.templateKind === 'KEYCHAIN' &&
      typeof adhocPayload.batchSize === 'number' &&
      adhocPayload.batchSize > 1
        ? adhocPayload.batchSize
        : null;

    const rowY = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLOR_BODY)
      .text(item.description, PAGE_LEFT, rowY, {
        width: COL_DETAIL_W,
        lineBreak: false,
        ellipsis: true,
      });
    doc.font('Helvetica').text(this.fmtQty(item.quantity), COL_QTY_X, rowY, {
      width: COL_QTY_W,
      align: 'right',
      lineBreak: false,
    });
    doc.text(FORMATTER.format(item.unitPrice), COL_PRICE_X, rowY, {
      width: COL_PRICE_W,
      align: 'right',
      lineBreak: false,
    });
    doc.text(FORMATTER.format(productLineTotal), COL_SUBTOTAL_X, rowY, {
      width: COL_SUBTOTAL_W,
      align: 'right',
      lineBreak: false,
    });
    doc.y = rowY + 14;

    // Itemizado: solo si hay 2+ componentes (piezas + insumos). Una sola
    // pieza o un solo insumo no necesita desglose — la descripción del
    // grupo ya identifica de qué se trata.
    const componentLines = this.composeComponentList(adhocPayload);
    if (componentLines.length >= 2) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_MUTED);
      for (const line of componentLines) {
        this.ensureSpace(doc, 12);
        doc.text(`• ${line}`, PAGE_LEFT + 8, doc.y, {
          width: COL_DETAIL_W - 8,
          lineBreak: false,
        });
        doc.y += 11;
      }
      doc.y += 2;
    }

    // Nota de batch para keychain
    if (batchSize != null) {
      this.ensureSpace(doc, 14);
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor(COLOR_SUBTLE)
        .text(
          `Cotización basada en un batch de ${batchSize} unidades`,
          PAGE_LEFT + 8,
          doc.y,
          { width: CONTENT_WIDTH - 8, lineBreak: false },
        );
      doc.y += 12;
    }

    // Cargo de diseño como sub-fila
    if (designSurcharge > 0) {
      this.ensureSpace(doc, 14);
      const subY = doc.y;
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(COLOR_MUTED)
        .text('Cargo único de diseño', PAGE_LEFT + 8, subY, {
          width: COL_DETAIL_W - 8,
          lineBreak: false,
        });
      doc.text(FORMATTER.format(designSurcharge), COL_SUBTOTAL_X, subY, {
        width: COL_SUBTOTAL_W,
        align: 'right',
        lineBreak: false,
      });
      doc.y = subY + 13;
    }

    doc.y += 4;
  }

  /**
   * Lista textual de los componentes del item (piezas e insumos) para el
   * itemizado. Sin precios — solo identifica de qué se compone el grupo.
   * Por convención mostramos primero las piezas impresas y después los
   * insumos.
   *
   *   - Piezas: "{name} ({filamentName})" o solo el nombre si no hay
   *     filamento snapshoteado.
   *   - Insumos: "{qty} × {materialName}".
   */
  private composeComponentList(payload: AdhocPayloadView | null): string[] {
    if (!payload) return [];
    const lines: string[] = [];
    const pieces = payload.pieces ?? [];
    for (const p of pieces) {
      const name = p.name?.trim() || 'Pieza';
      lines.push(p.filamentName ? `${name} (${p.filamentName})` : name);
    }
    const materials = payload.materials ?? [];
    for (const m of materials) {
      const name = m.materialName?.trim() || 'Insumo';
      const qty = typeof m.quantity === 'number' ? m.quantity : 1;
      lines.push(`${this.fmtQty(qty)} × ${name}`);
    }
    return lines;
  }

  // ----- Totales -----

  private renderTotals(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    const labelX = 360;
    const valueX = 480;
    const totalRowW = PAGE_RIGHT - labelX;

    const row = (label: string, value: string, opts: { bold?: boolean } = {}) => {
      this.ensureSpace(doc, 18);
      const y = doc.y;
      doc
        .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(opts.bold ? 12 : 10)
        .fillColor(opts.bold ? COLOR_TITLE : COLOR_MUTED)
        .text(label, labelX, y, { width: 110, align: 'right', lineBreak: false });
      doc
        .fontSize(opts.bold ? 13 : 10)
        .fillColor(COLOR_TITLE)
        .text(value, valueX, y, { width: 75, align: 'right', lineBreak: false });
      doc.y = y + (opts.bold ? 16 : 14);
    };

    row('Subtotal', FORMATTER.format(quote.subtotal));
    if (quote.discount > 0) row('Descuento', `- ${FORMATTER.format(quote.discount)}`);

    // Línea encima del total para separar visualmente
    doc.y += 2;
    doc
      .moveTo(labelX, doc.y)
      .lineTo(PAGE_RIGHT, doc.y)
      .strokeColor(COLOR_HAIRLINE)
      .stroke();
    doc.y += 6;
    row('Total', FORMATTER.format(quote.total), { bold: true });
    void totalRowW;
  }

  // ----- Footer / notas -----

  private renderFooter(doc: PDFKit.PDFDocument, quote: QuoteDto): void {
    if (quote.notes) {
      doc.y += 8;
      this.ensureSpace(doc, 40);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLOR_MUTED)
        .text('NOTAS', PAGE_LEFT, doc.y, {
          characterSpacing: 1.1,
          lineBreak: false,
        });
      doc.y += 12;
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(COLOR_BODY)
        .text(quote.notes, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
    }
    // Footer fijo al pie de la página
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR_SUBTLE)
      .text(
        `Generado por Plastik 3D · ${new Date().toLocaleString('es-AR')}`,
        PAGE_LEFT,
        790,
        { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
      );
  }

  // ----- Utils -----

  private fmtQty(n: number): string {
    return Number.isInteger(n) ? n.toString() : n.toFixed(2);
  }

  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    const bottom = doc.page.height - doc.page.margins.bottom - 20;
    if (doc.y + needed > bottom) {
      doc.addPage();
    }
  }
}
