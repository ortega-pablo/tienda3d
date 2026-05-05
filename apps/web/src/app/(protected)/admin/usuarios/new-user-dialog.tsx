'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasPermission } from '@/components/user-provider';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8),
  roleId: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function NewUserDialog({ roles }: { roles: { id: string; name: string }[] }) {
  const can = useHasPermission();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', name: '', password: '', roleId: roles[0]?.id ?? '' },
  });

  if (!can('user:manage')) return null;

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api('/users', { method: 'POST', body: values });
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario');
    }
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Nuevo usuario
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-md rounded-lg border bg-card shadow-lg">
            <form onSubmit={onSubmit} className="space-y-4 p-6" noValidate>
              <div>
                <h2 className="text-lg font-semibold">Nuevo usuario</h2>
                <p className="text-sm text-muted-foreground">
                  Recibirá la contraseña inicial que cargues acá.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" {...register('name')} />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña inicial</Label>
                <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="roleId">Rol</Label>
                <select
                  id="roleId"
                  {...register('roleId')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              {serverError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                  {serverError}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Creando…' : 'Crear'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
