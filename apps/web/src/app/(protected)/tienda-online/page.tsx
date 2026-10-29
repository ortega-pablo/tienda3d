import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Secciones de la gestión de la tienda online, en el orden en que se habilitan. */
const SECCIONES: Array<{ titulo: string; detalle: string; href?: string }> = [
  {
    titulo: 'Publicaciones',
    detalle:
      'Qué productos del sistema se venden en la web, con sus fotos, colores, opciones y el botón para publicar u ocultar.',
    href: '/tienda-online/publicaciones',
  },
  {
    titulo: 'Categorías de la tienda',
    detalle: 'Cómo se navega la vidriera, sin tocar las categorías que definen los precios.',
    href: '/tienda-online/categorias',
  },
  {
    titulo: 'Pedidos web',
    detalle:
      'Los pedidos que entran por la tienda: pago, preparación, envío y orden de producción.',
    href: '/tienda-online/pedidos',
  },
  {
    titulo: 'Solicitudes de personalización',
    detalle: 'Los pedidos de cotización a medida que llegan desde la web.',
    href: '/tienda-online/solicitudes',
  },
  {
    titulo: 'Ajustes de la tienda',
    detalle: 'Envíos, retiro por el taller, datos de transferencia y email de avisos.',
    href: '/tienda-online/ajustes',
  },
];

export default function TiendaOnlinePage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Tienda online</h1>
        <p className="text-muted-foreground">
          Desde acá se gestiona todo lo que muestra y vende tiendaplastik.com. El precio de cada
          producto web es el de Venta Directa a cliente normal, calculado por el sistema.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {SECCIONES.map((s) => (
          <Card key={s.titulo}>
            <CardHeader>
              <CardTitle>{s.titulo}</CardTitle>
              <CardDescription>{s.detalle}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {s.href ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={s.href}>Abrir</Link>
                </Button>
              ) : (
                'Se habilita en las próximas entregas.'
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
