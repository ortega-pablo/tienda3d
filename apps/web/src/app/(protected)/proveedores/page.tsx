import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SuppliersList } from './suppliers-list';

interface SupplierDto {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  materialCount: number;
}

export default async function SuppliersPage() {
  await requirePermission('supplier:read');
  const suppliers = await api<SupplierDto[]>('/suppliers');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Proveedores</h1>
        <p className="text-muted-foreground">
          Catálogo de proveedores y su historial de precios queda asociado a cada insumo.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{suppliers.length} proveedores</CardTitle>
          <CardDescription>Activos e inactivos.</CardDescription>
        </CardHeader>
        <CardContent>
          <SuppliersList initial={suppliers} />
        </CardContent>
      </Card>
    </div>
  );
}
