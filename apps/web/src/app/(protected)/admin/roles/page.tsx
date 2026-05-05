import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RolesManager } from './roles-manager';

interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}
interface PermissionDto {
  key: string;
  description: string | null;
}

export default async function RolesPage() {
  await requirePermission('user:read');
  const [roles, permissions] = await Promise.all([
    api<RoleDto[]>('/roles'),
    api<PermissionDto[]>('/roles/permissions'),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Roles y permisos</h1>
        <p className="text-muted-foreground">
          Configura los permisos de cada rol. Los cambios se aplican al refrescar la sesión.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Matriz de permisos</CardTitle>
          <CardDescription>
            Tildá los permisos para cada rol y guardá. Los roles del sistema no pueden ser eliminados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RolesManager initialRoles={roles} permissions={permissions} />
        </CardContent>
      </Card>
    </div>
  );
}
