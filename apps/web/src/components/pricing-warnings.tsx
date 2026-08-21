import { AlertTriangle } from 'lucide-react';

/**
 * Advertencias del motor de costeo y precios, junto al número que afectan.
 *
 * No es un toast a propósito: son avisos sobre el precio que el vendedor está
 * por firmar («este filamento no tiene precio vigente, se costeó en 0»), así
 * que tienen que quedar a la vista mientras el precio esté a la vista.
 */
export function PricingWarnings({
  warnings,
  className = '',
}: {
  warnings: string[] | undefined;
  className?: string;
}) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <ul
      className={`space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 ${className}`}
      aria-label="Advertencias del cálculo"
    >
      {warnings.map((w) => (
        <li
          key={w}
          className="flex gap-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}
