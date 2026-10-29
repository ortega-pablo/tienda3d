import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Zap } from 'lucide-react';
import type { WebQuoteRequestDetailDto } from '@tienda3d/shared';
import { api, ApiError } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatDateTime, formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { REQUEST_STATUS } from '../request-labels';
import { RequestEditor } from './request-editor';

/** "820 KB", "3,4 MB". */
function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${formatNumber(Math.max(1, Math.round(bytes / 1024)), 0)} KB`
    : `${formatNumber(bytes / 1024 / 1024, 1)} MB`;
}

export default async function SolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('ecommerce:orders');
  const { id } = await params;

  let request: WebQuoteRequestDetailDto;
  try {
    request = await api<WebQuoteRequestDetailDto>(`/web-quote-requests/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const canQuote = user.permissions.includes('quote:create');

  return (
    <div className="space-y-6">
      <Link
        href="/tienda-online/solicitudes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Solicitudes
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{request.name}</h1>
            <Badge variant={REQUEST_STATUS[request.status].variant}>
              {REQUEST_STATUS[request.status].label}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Solicitud de personalización · {formatDateTime(request.requestedAt)}
          </p>
        </div>
        {request.quote ? (
          <Button asChild variant="outline">
            <Link href={`/cotizaciones/${request.quote.id}`}>
              Ver cotización {request.quote.code}
            </Link>
          </Button>
        ) : (
          canQuote && (
            <Button asChild>
              <Link href={`/cotizaciones/nueva-a-medida?solicitud=${request.id}`}>
                <Zap className="h-4 w-4" />
                Crear cotización a medida
              </Link>
            </Button>
          )
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>La idea</CardTitle>
            <CardDescription>Como la escribió el cliente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{request.idea}</p>
            {request.attachment ? (
              <a
                href={`/api/web-quote-requests/${request.id}/attachment`}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/60"
              >
                <Download className="h-4 w-4" />
                {request.attachment.name}
                {request.attachment.size != null && (
                  <span className="text-muted-foreground">{fileSize(request.attachment.size)}</span>
                )}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Sin archivo.</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">
                <Link href={`/clientes/${request.customerId}`} className="hover:underline">
                  {request.name}
                </Link>
              </p>
              <p>
                <a href={`mailto:${request.email}`} className="break-all hover:underline">
                  {request.email}
                </a>
              </p>
              {request.phone && <p>{request.phone}</p>}
            </CardContent>
          </Card>
          <RequestEditor request={request} />
        </div>
      </div>
    </div>
  );
}
