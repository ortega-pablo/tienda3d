import Link from 'next/link';
import { Paperclip } from 'lucide-react';
import {
  webQuoteRequestListQuerySchema,
  type WebQuoteRequestStatusValue,
  type WebQuoteRequestSummaryDto,
} from '@tienda3d/shared';
import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { REQUEST_STATUS } from './request-labels';

const TABS: Array<{ status?: WebQuoteRequestStatusValue; label: string }> = [
  { label: 'Todas' },
  ...(Object.entries(REQUEST_STATUS) as Array<[WebQuoteRequestStatusValue, { label: string }]>).map(
    ([status, s]) => ({ status, label: s.label === 'Nueva' ? 'Nuevas' : s.label }),
  ),
];

export default async function SolicitudesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('ecommerce:orders');
  const parsed = webQuoteRequestListQuerySchema.safeParse(await searchParams);
  const status = parsed.success ? parsed.data.status : undefined;
  const requests = await api<WebQuoteRequestSummaryDto[]>(
    `/web-quote-requests${status ? `?status=${status}` : ''}`,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Solicitudes de personalización</h1>
        <p className="text-muted-foreground">
          Lo que piden los clientes desde el formulario de la tienda. De cada una sale una
          cotización a medida.
        </p>
      </header>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>{requests.length} solicitudes</CardTitle>
              <CardDescription>De la más nueva a la más vieja.</CardDescription>
            </div>
            <nav className="flex flex-wrap gap-1 rounded-md border bg-muted/30 p-1 text-sm">
              {TABS.map((t) => (
                <Link
                  key={t.label}
                  href={t.status ? `?status=${t.status}` : '?'}
                  className={cn(
                    'rounded px-3 py-1.5',
                    t.status === status
                      ? 'bg-secondary font-medium text-secondary-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {status ? 'Ninguna solicitud en este estado.' : 'Todavía no llegó ninguna solicitud.'}
            </p>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/tienda-online/solicitudes/${r.id}`}
                    className="flex flex-wrap items-start gap-x-4 gap-y-1 rounded-md px-2 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        <Badge variant={REQUEST_STATUS[r.status].variant}>
                          {REQUEST_STATUS[r.status].label}
                        </Badge>
                        {r.quoteCode && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {r.quoteCode}
                          </span>
                        )}
                        {r.hasAttachment && (
                          <Paperclip
                            aria-label="Con archivo"
                            className="h-3.5 w-3.5 text-muted-foreground"
                          />
                        )}
                      </span>
                      <span className="block text-sm text-muted-foreground">{r.ideaPreview}</span>
                    </span>
                    <span className="text-right text-sm text-muted-foreground">
                      {formatDateTime(r.requestedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
