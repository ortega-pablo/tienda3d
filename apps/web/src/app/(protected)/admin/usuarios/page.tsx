import { api } from '@/lib/api-server';
import { requirePermission } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UsersTable } from './users-table';
import { NewUserDialog } from './new-user-dialog';

interface UserListItem {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  role: { id: string; name: string };
  createdAt: string;
}

interface RoleSummary {
  id: string;
  name: string;
}

export default async function UsersPage() {
  await requirePermission('user:read');
  const [users, roles] = await Promise.all([
    api<UserListItem[]>('/users'),
    api<RoleSummary[]>('/roles'),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Usuarios</h1>
          <p className="text-muted-foreground">Gestiona el acceso al sistema y sus roles.</p>
        </div>
        <NewUserDialog roles={roles} />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{users.length} usuarios</CardTitle>
          <CardDescription>Activos e inactivos.</CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable users={users} roles={roles} />
        </CardContent>
      </Card>
    </div>
  );
}
