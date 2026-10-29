'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { WebQuoteRequestDetailDto, WebQuoteRequestStatusValue } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { REQUEST_STATUS } from '../request-labels';

/** Estado y nota interna de la solicitud. El estado lo ve el cliente en Mi cuenta (F15·4). */
export function RequestEditor({ request }: { request: WebQuoteRequestDetailDto }) {
  const router = useRouter();
  const [status, setStatus] = useState<WebQuoteRequestStatusValue>(request.status);
  const [note, setNote] = useState(request.adminNote);
  const [saving, setSaving] = useState(false);
  const dirty = status !== request.status || note.trim() !== request.adminNote;

  const save = async () => {
    setSaving(true);
    try {
      await api(`/web-quote-requests/${request.id}`, {
        method: 'PATCH',
        body: { status, adminNote: note },
      });
      toast.success('Solicitud guardada.');
      router.refresh();
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguimiento</CardTitle>
        <CardDescription>El cliente ve el estado en Mi cuenta; la nota es interna.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="sol-estado">Estado</Label>
          <Select
            id="sol-estado"
            value={status}
            onChange={(e) => setStatus(e.target.value as WebQuoteRequestStatusValue)}
          >
            {Object.entries(REQUEST_STATUS).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sol-nota">Nota interna</Label>
          <Textarea
            id="sol-nota"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={4000}
            rows={4}
          />
        </div>
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          Guardar
        </Button>
      </CardContent>
    </Card>
  );
}
