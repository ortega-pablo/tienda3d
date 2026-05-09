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

@Injectable()
export class CustomerCatalogPdfService {
  async render(catalog: CustomerCatalog): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderHeader(doc, catalog);
      this.renderProducts(doc, catalog.products);
      this.renderFooter(doc, catalog);

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
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.6);
  }

  private renderProducts(doc: PDFKit.PDFDocument, products: CatalogProduct[]): void {
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

    // Agrupamos por categoría para que el PDF quede legible.
    const byCategory = new Map<string, CatalogProduct[]>();
    for (const p of products) {
      const key = p.categoryName ?? 'Sin categoría';
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(p);
    }

    for (const [category, list] of byCategory) {
      this.ensureSpace(doc, 60);
      doc
        .moveDown(0.4)
        .fontSize(12)
        .fillColor('#0f172a')
        .text(category, { underline: false });
      doc.moveDown(0.2);

      for (const product of list) {
        this.renderProductCard(doc, product);
      }
    }
  }

  private renderProductCard(doc: PDFKit.PDFDocument, product: CatalogProduct): void {
    const startY = doc.y;
    const cardX = 40;
    const cardWidth = 515;
    const padding = 8;

    const tiersToShow = product.tiers.length > 0 ? product.tiers.length : 1;
    const estHeight = 40 + tiersToShow * 14 + (product.description ? 14 : 0);
    this.ensureSpace(doc, estHeight + 10);

    const headerY = doc.y;
    doc
      .fontSize(11)
      .fillColor('#0f172a')
      .text(product.name, cardX + padding, headerY, { width: cardWidth - padding * 2 });
    if (product.sku) {
      doc.fontSize(8).fillColor('#94a3b8').text(`SKU ${product.sku}`, cardX + padding, doc.y);
    }
    if (product.description) {
      doc
        .fontSize(9)
        .fillColor('#475569')
        .text(product.description, cardX + padding, doc.y, {
          width: cardWidth - padding * 2,
        });
    }

    doc.moveDown(0.3);

    // Precios:
    if (product.tiers.length === 0 && product.basePrice == null) {
      doc.fontSize(9).fillColor('#94a3b8').text('Sin precio configurado para este canal.');
    } else if (product.tiers.length === 0 && product.basePrice != null) {
      doc.fontSize(10).fillColor('#0f172a').text(`Precio: ${MONEY.format(product.basePrice)}`);
    } else {
      // Tabla compacta: cantidad · precio · ganancia (la ganancia se muestra
      // solo en el catálogo del staff; podríamos quitarla en una versión
      // "client-facing"). Por ahora la dejamos; el staff la usa para análisis.
      doc.fontSize(8.5).fillColor('#475569');
      const rangeX = cardX + padding;
      const priceX = cardX + 200;
      doc.text('Cantidad', rangeX, doc.y, { continued: true });
      doc.text('Precio unitario', priceX - rangeX, 0, { continued: false });
      doc.moveDown(0.2);
      for (const t of product.tiers) {
        const range = t.maxQty == null ? `${t.minQty}+` : `${t.minQty}-${t.maxQty}`;
        const lineY = doc.y;
        doc.fontSize(9).fillColor('#0f172a').text(range, rangeX, lineY);
        doc
          .fontSize(9)
          .fillColor('#0f172a')
          .text(MONEY.format(t.finalPrice), priceX, lineY);
      }
    }

    doc.moveDown(0.3);
    doc.moveTo(cardX, doc.y).lineTo(cardX + cardWidth, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.4);
    void startY;
  }

  private renderFooter(doc: PDFKit.PDFDocument, catalog: CustomerCatalog): void {
    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(
        'Los precios incluyen las condiciones particulares acordadas con el cliente. ' +
          'Sujetos a cambios sin previo aviso.',
        { align: 'center' },
      );
    void catalog;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + needed > bottom) {
      doc.addPage();
    }
  }
}
