'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { WebOrderListQuery } from '@tienda3d/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DELIVERY_LABEL, FULFILLMENT_LABEL, PAYMENT_LABEL } from './order-labels';

/** Los filtros viven en la URL: se pueden compartir y el contador del menú lleva a "para atender". */
export function OrderFilters({ filters }: { filters: WebOrderListQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const filtered = Object.values(filters).some(Boolean);

  const setFilter = (key: keyof WebOrderListQuery, value: string) => {
    const next = new URLSearchParams(
      Object.entries(filters).filter((e): e is [string, string] => !!e[1]),
    );
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Button
        variant={filters.attention ? 'default' : 'outline'}
        size="sm"
        className="h-9"
        onClick={() => setFilter('attention', filters.attention ? '' : '1')}
        aria-pressed={!!filters.attention}
      >
        Para atender
      </Button>
      <FilterSelect
        id="ped-preparacion"
        label="Preparación"
        value={filters.fulfillment ?? ''}
        onChange={(v) => setFilter('fulfillment', v)}
        options={Object.entries(FULFILLMENT_LABEL).map(([v, l]) => [v, l.label])}
      />
      <FilterSelect
        id="ped-pago"
        label="Pago"
        value={filters.payment ?? ''}
        onChange={(v) => setFilter('payment', v)}
        options={Object.entries(PAYMENT_LABEL).map(([v, l]) => [v, l.label])}
      />
      <FilterSelect
        id="ped-entrega"
        label="Entrega"
        value={filters.delivery ?? ''}
        onChange={(v) => setFilter('delivery', v)}
        options={Object.entries(DELIVERY_LABEL)}
      />
      <div className="space-y-1">
        <Label htmlFor="ped-desde" className="text-xs text-muted-foreground">
          Desde
        </Label>
        <Input
          id="ped-desde"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setFilter('from', e.target.value)}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ped-hasta" className="text-xs text-muted-foreground">
          Hasta
        </Label>
        <Input
          id="ped-hasta"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setFilter('to', e.target.value)}
          className="h-9 w-40"
        />
      </div>
      {filtered && (
        <Button variant="ghost" size="sm" className="h-9" onClick={() => router.replace(pathname)}>
          Limpiar
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 [&_select]:h-9"
      >
        <option value="">Todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );
}
