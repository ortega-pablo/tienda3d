'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TYPE_LABEL, type CustomerListItem, type CustomerSource, type CustomerType } from './types';

/** Origen (F13·8): los compradores de la tienda online entran solos como "Web". */
const SOURCE_OPTIONS: { key: CustomerSource | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todo origen' },
  { key: 'WEB', label: 'Web' },
  { key: 'SYSTEM', label: 'Sistema' },
];

const FILTER_OPTIONS: Array<{ key: CustomerType | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Todos' },
  { key: 'WHOLESALE', label: 'Mayoristas' },
  { key: 'CONSIGNMENT', label: 'Consignación' },
  { key: 'SPECIAL', label: 'Especiales' },
];

export function CustomersList({
  customers,
  canWrite,
}: {
  customers: CustomerListItem[];
  canWrite: boolean;
}) {
  const [filter, setFilter] = useState<CustomerType | 'ALL'>('ALL');
  const [source, setSource] = useState<CustomerSource | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filter !== 'ALL' && c.type !== filter) return false;
      if (source !== 'ALL' && c.source !== source) return false;
      if (q) {
        const hay = `${c.name} ${c.email ?? ''} ${c.taxId ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [customers, filter, source, search]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">
            Mayoristas, consignación y especiales, más los compradores de la tienda online (origen
            web), que entran solos. Los ocasionales del taller van como walk-in en la cotización.
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/clientes/nuevo">
              <Plus className="h-4 w-4" />
              Nuevo cliente
            </Link>
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border bg-muted/30 p-1 text-sm">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={
                filter === opt.key
                  ? 'rounded px-3 py-1.5 font-medium bg-secondary text-secondary-foreground'
                  : 'rounded px-3 py-1.5 text-muted-foreground hover:bg-accent'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md border bg-muted/30 p-1 text-sm" aria-label="Origen">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSource(opt.key)}
              className={
                source === opt.key
                  ? 'rounded px-3 py-1.5 font-medium bg-secondary text-secondary-foreground'
                  : 'rounded px-3 py-1.5 text-muted-foreground hover:bg-accent'
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre, email o CUIT…"
          className="flex h-9 w-56 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} clientes</CardTitle>
          <CardDescription>
            {filtered.length === customers.length ? 'Todos.' : 'Filtrados.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Cliente</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Contacto</th>
                <th className="py-2 pr-4 font-medium">Pedidos web</th>
                <th className="py-2 pr-4 font-medium">Portal</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pr-4">
                    <div className="font-medium">
                      {c.name}
                      {c.source === 'WEB' && (
                        <span className="ml-2 inline-flex rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-normal text-sky-700 dark:text-sky-300">
                          Web
                        </span>
                      )}
                    </div>
                    {c.taxId && (
                      <div className="font-mono text-xs text-muted-foreground">{c.taxId}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4">{TYPE_LABEL[c.type]}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {c.email ?? '—'}
                    {c.phone && <div className="text-xs">{c.phone}</div>}
                  </td>
                  <td className="py-3 pr-4 tabular-nums">
                    {c.webOrderCount > 0 ? (
                      c.webOrderCount
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {c.hasPortalAccess ? (
                      <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                        Activo
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={
                        c.isActive
                          ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs text-success'
                          : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                      }
                    >
                      {c.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/clientes/${c.id}`}>Abrir</Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    {customers.length === 0
                      ? 'Sin clientes cargados todavía.'
                      : 'No hay clientes con esos filtros.'}
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
