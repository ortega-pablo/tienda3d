import Link from 'next/link';
import { Download, KeyRound, Package, Plus, Zap } from 'lucide-react';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';

interface QuoteSummary {
  id: string;
  code: string;
  type: 'PRODUCT' | 'ADHOC';
  status: string;
  customerName: string;
  channelName: string | null;
  total: number;
  itemCount: number;
  createdAt: string;
  templateKind: 'KEYCHAIN' | null;
}

const TABS = [
  { key: 'all', label: 'Todas', icon: null },
  { key: 'PRODUCT', label: 'Productos', icon: Package },
  { key: 'ADHOC', label: 'A medida', icon: Zap },
  { key: 'KEYCHAIN', label: 'Llaveros', icon: KeyRound },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission('quote:read');
  const { tab } = await searchParams;
  const activeTab: TabKey = TABS.find((t) => t.key === tab)?.key ?? 'all';
  const path =
    activeTab === 'PRODUCT'
      ? '/quotes?type=PRODUCT'
      : activeTab === 'ADHOC'
        ? '/quotes?type=ADHOC'
        : activeTab === 'KEYCHAIN'
          ? '/quotes?templateKind=KEYCHAIN'
          : '/quotes';
  const [quotes, allQuotes] = await Promise.all([
    api<QuoteSummary[]>(path),
    activeTab === 'all' ? Promise.resolve(null) : api<QuoteSummary[]>('/quotes'),
  ]);
  const counts = (allQuotes ?? quotes).reduce(
    (acc, q) => {
      acc.all++;
      if (q.type === 'PRODUCT') acc.PRODUCT++;
      else acc.ADHOC++;
      if (q.templateKind === 'KEYCHAIN') acc.KEYCHAIN++;
      return acc;
    },
    { all: 0, PRODUCT: 0, ADHOC: 0, KEYCHAIN: 0 } as Record<TabKey, number>,
  );

  const canCreate = user.permissions.includes('quote:create');
  const canExport = user.permissions.includes('quote:export');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Cotizaciones</h1>
          <p className="text-muted-foreground">
            Cotizá productos del catálogo, piezas a medida o llaveros en cantidad. Todo se
            exporta a PDF.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <Button asChild variant="outline">
              <a href="/api/reports/quotes.csv" download>
                <Download className="h-4 w-4" />
                CSV
              </a>
            </Button>
          )}
          {canCreate && (
            <>
              <Button asChild variant="outline">
                <Link href="/cotizaciones/nueva-llaveros">
                  <KeyRound className="h-4 w-4" />
                  Cotización de llaveros
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/cotizaciones/nueva-a-medida">
                  <Zap className="h-4 w-4" />
                  Cotización a medida
                </Link>
              </Button>
              <Button asChild>
                <Link href="/cotizaciones/nueva-catalogo">
                  <Plus className="h-4 w-4" />
                  Cotización de catálogo
                </Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-wrap gap-1 rounded-md border bg-card p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === activeTab;
          const href = t.key === 'all' ? '/cotizaciones' : `/cotizaciones?tab=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={
                isActive
                  ? 'inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium bg-secondary text-secondary-foreground'
                  : 'inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/10'
              }
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {t.label}
              <span className="rounded-full bg-background/60 px-1.5 text-xs">
                {counts[t.key]}
              </span>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{quotes.length} cotizaciones</CardTitle>
          <CardDescription>Más recientes primero.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Código</th>
                <th className="py-2 pr-4 font-medium">Cliente</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Canal</th>
                <th className="py-2 pr-4 font-medium">Items</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {quotes.map((q) => {
                const isKeychain = q.templateKind === 'KEYCHAIN';
                return (
                  <tr key={q.id}>
                    <td className="py-3 pr-4 font-mono">{q.code}</td>
                    <td className="py-3 pr-4">{q.customerName}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          q.type === 'PRODUCT'
                            ? 'inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary'
                            : isKeychain
                              ? 'inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary'
                              : 'inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent'
                        }
                      >
                        {q.type === 'PRODUCT' ? (
                          <Package className="h-3 w-3" />
                        ) : isKeychain ? (
                          <KeyRound className="h-3 w-3" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        {q.type === 'PRODUCT'
                          ? 'Producto'
                          : isKeychain
                            ? 'Llavero'
                            : 'A medida'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{q.channelName ?? '—'}</td>
                    <td className="py-3 pr-4">{q.itemCount}</td>
                    <td className="py-3 pr-4 font-mono">{formatMoney(q.total)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={q.status} />
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">
                      {new Date(q.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/cotizaciones/${q.id}`}>Abrir</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Sin cotizaciones aún.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
