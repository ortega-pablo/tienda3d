'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasPermission } from '@/components/user-provider';

interface SupplierDto {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  materialCount: number;
}

const EMPTY: SupplierDto = {
  id: '',
  name: '',
  contact: null,
  phone: null,
  email: null,
  notes: null,
  isActive: true,
  materialCount: 0,
};

export function SuppliersList({ initial }: { initial: SupplierDto[] }) {
  const can = useHasPermission();
  const canWrite = can('supplier:write');
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<SupplierDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async () => {
    if (!editing || !editing.name) return;
    setError(null);
    setPending(true);
    try {
      const payload = {
        name: editing.name,
        contact: editing.contact || null,
        phone: editing.phone || null,
        email: editing.email || null,
        notes: editing.notes || null,
        isActive: editing.isActive,
      };
      if (editing.id) {
        const updated = await api<SupplierDto>(`/suppliers/${editing.id}`, {
          method: 'PATCH',
          body: payload,
        });
        setItems((list) => list.map((s) => (s.id === updated.id ? updated : s)));
      } else {
        const created = await api<SupplierDto>('/suppliers', { method: 'POST', body: payload });
        setItems((list) => [...list, created]);
      }
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar');
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar proveedor? Si tiene precios asociados será desactivado.')) return;
    setPending(true);
    try {
      await api(`/suppliers/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing({ ...EMPTY })}>
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Nombre</th>
              <th className="py-2 pr-4 font-medium">Contacto</th>
              <th className="py-2 pr-4 font-medium">Email</th>
              <th className="py-2 pr-4 font-medium">Insumos</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((s) => (
              <tr key={s.id}>
                <td className="py-3 pr-4 font-medium">{s.name}</td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {[s.contact, s.phone].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{s.email ?? '—'}</td>
                <td className="py-3 pr-4">{s.materialCount}</td>
                <td className="py-3 pr-4">
                  <span
                    className={
                      s.isActive
                        ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs text-success'
                        : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                    }
                  >
                    {s.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {canWrite && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing({ ...s })}>
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(s.id)}
                        disabled={pending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-lg rounded-lg border bg-card shadow-lg">
            <div className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">
                {editing.id ? 'Editar proveedor' : 'Nuevo proveedor'}
              </h2>
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact">Contacto</Label>
                  <Input
                    id="contact"
                    value={editing.contact ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, contact: e.target.value || null })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    value={editing.phone ?? ''}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editing.email ?? ''}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notas</Label>
                <Input
                  id="notes"
                  value={editing.notes ?? ''}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={save} disabled={!editing.name || pending}>
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
