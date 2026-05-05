'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginInput } from '@tienda3d/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await api('/auth/login', { method: 'POST', body: values });
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setServerError(err.message);
      else setServerError('No se pudo iniciar sesión');
    }
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Plastik 3D</p>
        <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
        <CardDescription>Cotizador, costeo y stock</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              {...register('email')}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          {serverError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
              {serverError}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
