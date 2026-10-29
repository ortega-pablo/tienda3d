'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { WebOrderDetailDto } from '@tienda3d/shared';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

/** Notas del taller sobre el pedido: el cliente no las ve. */
export function OrderNotes({ orderId, initial }: { orderId: string; initial: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [notes, setNotes] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const order = await api<WebOrderDetailDto>(`/web-orders/${orderId}/notes`, {
        method: 'PATCH',
        body: { internalNotes: notes },
      });
      setSaved(order.internalNotes);
      setNotes(order.internalNotes);
      toast.success('Notas guardadas.');
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
        <CardTitle>Notas internas</CardTitle>
        <CardDescription>Solo las ve el taller.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          aria-label="Notas internas"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          rows={4}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={save}
          disabled={saving || notes.trim() === saved}
        >
          Guardar notas
        </Button>
      </CardContent>
    </Card>
  );
}
