import {
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  Cog,
  Factory,
  FileText,
  Layers,
  LayoutDashboard,
  Package,
  PackageSearch,
  Plug,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Permissions required to see this item. If empty, always visible to authenticated users.
   * Match is "any of": showing the item is enough if the user has at least one.
   */
  permissions?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    label: 'General',
    items: [
      { label: 'Panel', href: '/dashboard', icon: LayoutDashboard },
      {
        label: 'Cotizaciones',
        href: '/cotizaciones',
        icon: FileText,
        permissions: ['quote:read'],
      },
      {
        label: 'Cotizar producto',
        href: '/cotizaciones/nueva-producto',
        icon: Package,
        permissions: ['quote:create'],
      },
      {
        label: 'Cotización rápida',
        href: '/cotizaciones/nueva-rapida',
        icon: Zap,
        permissions: ['quote:create'],
      },
      {
        label: 'Producción',
        href: '/produccion',
        icon: Factory,
        permissions: ['production:read'],
      },
      {
        label: 'Reportes',
        href: '/reportes',
        icon: BarChart3,
        permissions: ['quote:read'],
      },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      {
        label: 'Productos',
        href: '/productos',
        icon: ShoppingBag,
        permissions: ['product:read'],
      },
      {
        label: 'Insumos',
        href: '/insumos',
        icon: PackageSearch,
        permissions: ['material:read'],
      },
      {
        label: 'Proveedores',
        href: '/proveedores',
        icon: Truck,
        permissions: ['supplier:read'],
      },
      {
        label: 'Canales',
        href: '/canales',
        icon: Layers,
        permissions: ['channel:read'],
      },
    ],
  },
  {
    label: 'Configuración',
    items: [
      {
        label: 'Parámetros',
        href: '/parametros',
        icon: Cog,
        permissions: ['parameter:read'],
      },
      {
        label: 'Equipos',
        href: '/equipos',
        icon: Boxes,
        permissions: ['machine:read'],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        label: 'Usuarios',
        href: '/admin/usuarios',
        icon: Users,
        permissions: ['user:read'],
      },
      {
        label: 'Roles y permisos',
        href: '/admin/roles',
        icon: ShieldCheck,
        permissions: ['user:read'],
      },
      {
        label: 'Auditoría',
        href: '/admin/auditoria',
        icon: ClipboardList,
        permissions: ['audit:read'],
      },
      {
        label: 'Métodos de cálculo',
        href: '/admin/contabilidad',
        icon: BookOpen,
        permissions: ['user:manage'],
      },
      {
        label: 'Integraciones',
        href: '/admin/integraciones',
        icon: Plug,
        permissions: ['user:read'],
      },
    ],
  },
];
