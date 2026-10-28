/**
 * Correspondencia del catálogo de la web con los productos del sistema (plan
 * §4.8, F9·2), por slug de la web. Las diferencias que se concilian al final
 * con la base real (F9·3) se cambian acá.
 */
export interface PublicationMapping {
  /**
   * Producto(s) del sistema detrás de la publicación. Con más de uno, `value`
   * es el valor de `memberOption` en la web que elige cada uno.
   */
  members: Array<{ sku: string; value?: string }>;
  /** Opción de la web que distingue a los miembros ("tamano" en la Trapecio). */
  memberOption?: string;
  /** Diferencia con la web que se informa al importar. */
  note?: string;
}

export const STOREFRONT_MAPPING: Readonly<Record<string, PublicationMapping>> = {
  'cuaderno-a5-army': { members: [{ sku: 'PTK-PROD-000026' }] },
  'cuaderno-a5-inteligente-dev': { members: [{ sku: 'PTK-PROD-000019' }] },
  'cuaderno-plastik-a5-inteligente-arirang': { members: [{ sku: 'PTK-PROD-000017' }] },
  'cuaderno-a5-inteligente-monocromatico': {
    members: [{ sku: 'PTK-PROD-000001' }],
    note: 'la web lo vende como TPK-PROD-000001 (error de tipeo): queda como SKU viejo',
  },
  'cuaderno-a5-bicolor-noche-y-dia': {
    members: [],
    note: 'no existe en el sistema: queda en borrador, sin variantes, hasta conciliarlo (F9·3)',
  },
  'cuaderno-a5-riso': {
    members: [],
    note: 'no existe en el sistema: queda en borrador, sin variantes, hasta conciliarlo (F9·3)',
  },
  'lampara-lana-mesa-3d': { members: [{ sku: 'PTK-PROD-000006' }] },
  'lampara-lia-colgante-3d': { members: [{ sku: 'PTK-PROD-000025' }] },
  'lampara-lina-mesa-3d': { members: [{ sku: 'PTK-PROD-000005' }] },
  'lampara-mila-colgante-3d': { members: [{ sku: 'PTK-PROD-000009' }] },
  'lampara-nala-colgante-3d': { members: [{ sku: 'PTK-PROD-000010' }] },
  'lampara-trapecio-mesa-3d': {
    memberOption: 'tamano',
    members: [
      { sku: 'PTK-PROD-000003', value: '280' },
      { sku: 'PTK-PROD-000004', value: '380' },
    ],
    note: 'la web ofrece 380 y el sistema tiene la Trapecio 390: se publica como 380 hasta conciliarlo (F9·3)',
  },
  'lampara-vera-mesa-3d': { members: [{ sku: 'PTK-PROD-000002' }] },
};
