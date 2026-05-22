'use client';

import { useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useHasPermission } from '@/components/user-provider';

/**
 * Card admin con botón "Hacer backup ahora". Dispara `POST /admin/backup`,
 * recibe el dump como blob y lo entrega al browser como descarga. El
 * usuario elige dónde guardarlo — recomendado apuntar a una carpeta
 * sincronizada con iCloud Drive.
 *
 * El endpoint requiere permiso `parameter:write`. El backend genera el
 * archivo en formato `pg_dump -Fc` (custom, comprimido, restore selectivo).
 */
export function DatabaseBackupCard() {
  const can = useHasPermission();
  const canWrite = can('parameter:write');
  const [downloading, setDownloading] = useState(false);

  const handleBackup = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string; error?: string };
          detail = body.message ?? body.error ?? detail;
        } catch {
          // ignore: el endpoint pudo haber empezado a streamear binario.
        }
        throw new Error(detail);
      }
      // Tomamos el filename del header `Content-Disposition` para
      // preservar el timestamp que generó el backend.
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? `tienda3d_${Date.now()}.dump`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup descargado. Movelo a tu carpeta de respaldo (iCloud, etc).');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(`No se pudo hacer el backup: ${msg}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Backup de la base
        </CardTitle>
        <CardDescription>
          Genera un dump completo (formato custom de Postgres) y lo descarga al browser. Guardalo
          en una carpeta sincronizada con iCloud, OneDrive o similar para conservar la copia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!canWrite ? (
          <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Solo administradores pueden generar backups.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Tip: configurá Chrome con <em>"Preguntar dónde guardar cada archivo antes de
              descargar"</em> y la primera vez apuntá a tu carpeta de iCloud
              (<span className="font-mono">~/iCloud Drive/Plastik3D/Backups</span>). Las
              descargas siguientes recuerdan esa ubicación.
            </p>
            <Button onClick={handleBackup} disabled={downloading}>
              {downloading ? <Spinner size="sm" /> : <Download className="h-4 w-4" />}
              {downloading ? 'Generando…' : 'Hacer backup ahora'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Para restaurar: <span className="font-mono">docker exec -i tienda3d_db pg_restore -U
              $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists &lt; archivo.dump</span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
