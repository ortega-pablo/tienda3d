'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/components/user-provider';

interface UserListItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  role: { id: string; name: string };
  createdAt: string;
}
interface RoleSummary {
  id: string;
  name: string;
}

export function UsersTable({
  users,
  roles,
}: {
  users: UserListItem[];
  roles: RoleSummary[];
}) {
  const can = useHasPermission();
  const canManage = can('user:manage');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const updateUser = async (id: string, data: Partial<{ roleId: string; isActive: boolean }>) => {
    setError(null);
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: data });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  };

  return (
    <div className="overflow-x-auto">
      {error && (
        <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Nombre</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Rol</th>
            <th className="py-2 pr-4 font-medium">Estado</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map((u) => (
            <tr key={u.id} className="align-middle">
              <td className="py-3 pr-4 font-medium">{u.name}</td>
              <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
              <td className="py-3 pr-4">
                {canManage ? (
                  <select
                    value={u.role.id}
                    onChange={(e) => updateUser(u.id, { roleId: e.target.value })}
                    disabled={pending}
                    className="rounded border bg-background px-2 py-1 text-sm"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="capitalize">{u.role.name}</span>
                )}
              </td>
              <td className="py-3 pr-4">
                <span
                  className={
                    u.isActive
                      ? 'inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs text-success'
                      : 'inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                  }
                >
                  {u.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="py-3 text-right">
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => updateUser(u.id, { isActive: !u.isActive })}
                  >
                    {u.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
