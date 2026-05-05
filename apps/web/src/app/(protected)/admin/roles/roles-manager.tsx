'use client';

import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasPermission } from '@/components/user-provider';

interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}
interface PermissionDto {
  key: string;
  description: string | null;
}

function groupKey(key: string): string {
  return key.split(':')[0] ?? 'otros';
}

export function RolesManager({
  initialRoles,
  permissions,
}: {
  initialRoles: RoleDto[];
  permissions: PermissionDto[];
}) {
  const can = useHasPermission();
  const canManage = can('role:manage');
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of permissions) {
      const k = groupKey(p.key);
      const arr = map.get(k);
      if (arr) arr.push(p);
      else map.set(k, [p]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const togglePermission = (roleId: string, key: string) => {
    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              permissions: r.permissions.includes(key)
                ? r.permissions.filter((p) => p !== key)
                : [...r.permissions, key],
            }
          : r,
      ),
    );
  };

  const savePermissions = async (role: RoleDto) => {
    setError(null);
    setSavingId(role.id);
    try {
      await api(`/roles/${role.id}/permissions`, {
        method: 'PUT',
        body: { permissions: role.permissions },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron guardar los permisos');
    } finally {
      setSavingId(null);
    }
  };

  const createRole = async () => {
    setError(null);
    try {
      await api('/roles', { method: 'POST', body: { name: newRoleName.trim() } });
      setNewRoleName('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el rol');
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {canManage && (
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-2">
            <Label htmlFor="newRole">Nombre del nuevo rol</Label>
            <Input
              id="newRole"
              placeholder="Ej. cliente-mayorista-A"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
            />
          </div>
          <Button onClick={createRole} disabled={!newRoleName.trim()}>
            <Plus className="h-4 w-4" />
            Crear rol
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="sticky left-0 z-10 w-64 bg-muted/50 p-3 text-left font-medium">
                Permiso
              </th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-[180px] p-3 text-left font-medium">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="capitalize">{r.name}</span>
                      {r.isSystem && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-secondary-foreground">
                          sistema
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-normal text-muted-foreground">
                      {r.userCount} usuarios · {r.permissions.length} permisos
                    </span>
                    {canManage && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1 h-7"
                        disabled={savingId === r.id}
                        onClick={() => savePermissions(r)}
                      >
                        <Save className="h-3 w-3" />
                        {savingId === r.id ? 'Guardando…' : 'Guardar'}
                      </Button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([groupName, perms]) => (
              <Fragment key={groupName}>
                <tr className="border-b bg-muted/20">
                  <td
                    colSpan={roles.length + 1}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {groupName}
                  </td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.key} className="border-b last:border-b-0">
                    <td className="sticky left-0 bg-card p-3 align-top">
                      <div className="font-mono text-xs">{p.key}</div>
                      {p.description && p.description !== p.key && (
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      )}
                    </td>
                    {roles.map((r) => (
                      <td key={`${r.id}-${p.key}`} className="p-3">
                        <Checkbox
                          checked={r.permissions.includes(p.key)}
                          onChange={() => togglePermission(r.id, p.key)}
                          disabled={!canManage}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
