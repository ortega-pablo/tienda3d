'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorName: string | null;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  at: string;
}

const ENTITY_LABEL: Record<string, string> = {
  GlobalParam: 'Parámetro',
  Role: 'Rol',
  Quote: 'Cotización',
  ProductionOrder: 'Producción',
};

export function AuditLogView({ initialLogs }: { initialLogs: AuditLog[] }) {
  const [logs, setLogs] = useState(initialLogs);
  const [entity, setEntity] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const apply = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (entity) params.set('entity', entity);
      const fresh = await api<AuditLog[]>(`/audit?${params}`);
      setLogs(fresh);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium">Entidad</label>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="flex h-10 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Todas</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={apply} disabled={loading}>
          {loading ? 'Cargando…' : 'Aplicar filtro'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Entidad</th>
              <th className="px-3 py-2 font-medium">Acción</th>
              <th className="px-3 py-2 font-medium">Antes</th>
              <th className="px-3 py-2 font-medium">Después</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(l.at).toLocaleString('es-AR')}
                </td>
                <td className="px-3 py-2 text-xs">{l.actorName ?? '—'}</td>
                <td className="px-3 py-2 text-xs">
                  <div>{ENTITY_LABEL[l.entity] ?? l.entity}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{l.entityId}</div>
                </td>
                <td className="px-3 py-2 text-xs font-mono">{l.action}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                  <JsonPreview value={l.before} />
                </td>
                <td className="px-3 py-2 text-xs font-mono">
                  <JsonPreview value={l.after} />
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Sin eventos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  if (value == null) return <span>—</span>;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return (
    <span className="block max-w-[18rem] truncate" title={text}>
      {text}
    </span>
  );
}
