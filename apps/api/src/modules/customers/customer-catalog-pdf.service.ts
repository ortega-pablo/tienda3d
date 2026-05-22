import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { CatalogProduct, CustomerCatalog } from './customer-catalog.service';

const MONEY = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const TYPE_LABEL: Record<string, string> = {
  STANDARD: 'Estándar',
  WHOLESALE: 'Mayorista',
  CONSIGNMENT: 'Consignación',
  SPECIAL: 'Especial',
};

// Layout: A4 con margins de 40 → ancho útil 515pt.
// Las columnas se posicionan en X absoluto para que cada celda quede
// alineada sin recurrir a `text(..., continued: true)`, que rompe el
// layout cuando los anchos varían entre filas.
const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;
const CARD_PADDING = 8;

interface ColumnSet {
  qtyX: number;
  markupX: number | null;
  priceX: number;
  profitX: number | null;
  endX: number;
}

const COLUMNS_CLIENT: ColumnSet = {
  qtyX: PAGE_LEFT + CARD_PADDING,
  markupX: null,
  priceX: 400,
  profitX: null,
  endX: PAGE_RIGHT,
};

const COLUMNS_INTERNAL: ColumnSet = {
  qtyX: PAGE_LEFT + CARD_PADDING,
  markupX: 180,
  priceX: 290,
  profitX: 430,
  endX: PAGE_RIGHT,
};

export interface CatalogPdfOptions {
  /**
   * Cuando `true`, agrega columnas "Markup %" y "Ganancia / unidad" para uso
   * interno del staff. Default `false` — versión cliente, solo cantidad +
   * precio. El cliente nunca debe ver márgenes; este flag solo se setea
   * desde el panel de admin.
   */
  showMargins?: boolean;
}

@Injectable()
export class CustomerCatalogPdfService {
  async render(
    catalog: CustomerCatalog,
    options: CatalogPdfOptions = {},
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const showMargins = options.showMargins === true;
      const columns = showMargins ? COLUMNS_INTERNAL : COLUMNS_CLIENT;

      this.renderHeader(doc, catalog);
      this.renderProducts(doc, catalog.products, columns, showMargins);
      this.renderFooter(doc);

      doc.end();
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, catalog: CustomerCatalog): void {
    doc
      .fontSize(20)
      .fillColor('#0f172a')
      .text('Plastik 3D', { continued: true })
      .fontSize(10)
      .fillColor('#64748b')
      .text('   ·   Catálogo personalizado', { align: 'left' });

    doc.moveDown(0.6);
    doc.fontSize(14).fillColor('#0f172a').text(catalog.customerName);
    doc
      .fontSize(9)
      .fillColor('#475569')
      .text(`${TYPE_LABEL[catalog.customerType] ?? catalog.customerType}`);
    if (catalog.channelName) {
      doc.text(`Precios para canal: ${catalog.channelName}`);
    }
    doc.text(`Generado el ${new Date(catalog.generatedAt).toLocaleDateString('es-AR')}`);

    doc.moveDown(0.6);
    doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.6);
  }

  private renderProducts(
    doc: PDFKit.PDFDocument,
    products: CatalogProduct[],
    columns: ColumnSet,
    showMargins: boolean,
  ): void {
    if (products.length === 0) {
      doc
        .fontSize(11)
        .fillColor('#475569')
        .text(
          'Este catálogo está vacío. Asigná productos / categorías al cliente para que aparezcan acá.',
          { align: 'center' },
        );
      return;
    }

    const byCategory = new Map<string, CatalogProduct[]>();
    for (const p of products) {
      const key = p.categoryName ?? 'Sin categoría';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(p);
    }

    for (const [category, list] of byCategory) {
      this.ensureSpace(doc, 60);
      doc.moveDown(0.4).fontSize(12).fillColor('#0f172a').text(category);
      doc.moveDown(0.2);

      for (const product of list) {
        this.renderProductCard(doc, product, columns, showMargins);
      }
    }
  }

  private renderProductCard(
    doc: PDFKit.PDFDocument,
    product: CatalogProduct,
    columns: ColumnSet,
    showMargins: boolean,
  ): void {
    const tiersCount = product.tiers.length > 0 ? product.tiers.length : 1;
    // Estimación de altura: título (14) + sku (10) + desc (14 si existe) +
    // header tabla (16) + tiers × 14 + padding (10).
    const estHeight =
      14 + 10 + (product.description ? 14 : 0) + 16 + tiersCount * 14 + 10;
    this.ensureSpace(doc, estHeight);

    // Título + SKU + descripción (todos con X = PAGE_LEFT + padding, sin
    // `continued` ni offsets relativos).
    doc
      .fontSize(11)
      .fillColor('#0f172a')
      .text(product.name, PAGE_LEFT + CARD_PADDING, doc.y, {
        width: PAGE_RIGHT - PAGE_LEFT - CARD_PADDING * 2,
      });
    if (product.sku) {
      doc
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(`SKU ${product.sku}`, PAGE_LEFT + CARD_PADDING, doc.y, {
          width: PAGE_RIGHT - PAGE_LEFT - CARD_PADDING * 2,
        });
    }
    if (product.description) {
      doc
        .fontSize(9)
        .fillColor('#475569')
        .text(product.description, PAGE_LEFT + CARD_PADDING, doc.y, {
          width: PAGE_RIGHT - PAGE_LEFT - CARD_PADDING * 2,
        });
    }

    doc.moveDown(0.3);

    if (product.tiers.length === 0 && product.basePrice == null) {
      doc
        .fontSize(9)
        .fillColor('#94a3b8')
        .text(
          'Sin precio configurado para este canal.',
          PAGE_LEFT + CARD_PADDING,
          doc.y,
        );
    } else if (product.tiers.length === 0 && product.basePrice != null) {
      doc
        .fontSize(10)
        .fillColor('#0f172a')
        .text(
          `Precio: ${MONEY.format(product.basePrice)}`,
          PAGE_LEFT + CARD_PADDING,
          doc.y,
        );
    } else {
      this.renderTiersTable(doc, product, columns, showMargins);
    }

    doc.moveDown(0.3);
    doc
      .moveTo(PAGE_LEFT, doc.y)
      .lineTo(PAGE_RIGHT, doc.y)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.moveDown(0.4);
  }

  /**
   * Tabla de tiers con posicionamiento absoluto por columna. Las constantes
   * `qtyX`, `markupX`, `priceX`, `profitX` definen el inicio de cada
   * columna; cada `doc.text` se ancla en ese X con `align: 'right'` cuando
   * corresponde para que números y headers queden alineados.
   */
  private renderTiersTable(
    doc: PDFKit.PDFDocument,
    product: CatalogProduct,
    columns: ColumnSet,
    showMargins: boolean,
  ): void {
    // Header
    const headerY = doc.y;
    doc.fontSize(8).fillColor('#64748b');
    doc.text('Cantidad', columns.qtyX, headerY, { width: 80 });
    if (showMargins && columns.markupX != null) {
      doc.text('Markup %', columns.markupX, headerY, { width: 70, align: 'right' });
    }
    doc.text('Precio unitario', columns.priceX, headerY, { width: 100, align: 'right' });
    if (showMargins && columns.profitX != null) {
      doc.text('Ganancia / u', columns.profitX, headerY, { width: 90, align: 'right' });
    }
    // Mover el cursor hacia abajo manualmente — pdfkit no avanza Y cuando
    // se usa posición absoluta. Después del header dejamos 12pt de gap.
    doc.y = headerY + 12;

    // Línea fina debajo del header.
    doc
      .moveTo(columns.qtyX, doc.y)
      .lineTo(columns.endX, doc.y)
      .strokeColor('#e2e8f0')
      .stroke();
    doc.y += 2;

    // Filas
    doc.fontSize(9).fillColor('#0f172a');
    for (const tier of product.tiers) {
      const rowY = doc.y;
      const range = tier.maxQty == null ? `${tier.minQty}+` : `${tier.minQty}-${tier.maxQty}`;
      doc.text(range, columns.qtyX, rowY, { width: 80 });
      if (showMargins && columns.markupX != null) {
        doc.text(
          `${tier.markupPct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
          columns.markupX,
          rowY,
          { width: 70, align: 'right' },
        );
      }
      doc.text(MONEY.format(tier.finalPrice), columns.priceX, rowY, {
        width: 100,
        align: 'right',
      });
      if (showMargins && columns.profitX != null) {
        doc
          .fillColor('#059669')
          .text(MONEY.format(tier.profit), columns.profitX, rowY, {
            width: 90,
            align: 'right',
          })
          .fillColor('#0f172a');
      }
      doc.y = rowY + 14;
    }
  }

  private renderFooter(doc: PDFKit.PDFDocument): void {
    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(
        'Los precios incluyen las condiciones particulares acordadas con el cliente. ' +
          'Sujetos a cambios sin previo aviso.',
        { align: 'center' },
      );
  }

  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + needed > bottom) {
      doc.addPage();
    }
  }
}
