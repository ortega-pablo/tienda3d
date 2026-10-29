import {
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  Cog,
  Contact,
  Factory,
  FileText,
  FolderTree,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  Package,
  PackageSearch,
  Plug,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Store,
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
  /** Solo la ruta exacta lo marca activo: un resumen cuyas subpáginas tienen entrada propia. */
  exact?: boolean;
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
        label: 'Cotización de catálogo',
        href: '/cotizaciones/nueva-catalogo',
        icon: Package,
        permissions: ['quote:create'],
      },
      {
        label: 'Cotización a medida',
        href: '/cotizaciones/nueva-a-medida',
        icon: Zap,
        permissions: ['quote:create'],
      },
      {
        label: 'Cotización de llaveros',
        href: '/cotizaciones/nueva-llaveros',
        icon: KeyRound,
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
      {
        label: 'Clientes',
        href: '/clientes',
        icon: Contact,
        permissions: ['customer:read'],
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
        label: 'Categorías',
        href: '/categorias',
        icon: FolderTree,
        permissions: ['category:read'],
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
        label: 'Configuración de llaveros',
        href: '/parametros/llaveros',
        icon: KeyRound,
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
  {
    // Solo el rol admin tiene ecommerce:*. Cada sección suma su entrada al
    // habilitarse (publicaciones, pedidos web, solicitudes, categorías, ajustes).
    // "Pedidos web" muestra cuántos esperan al taller y "Solicitudes", las nuevas
    // (ver ProtectedLayout).
    label: 'Tienda online',
    items: [
      {
        label: 'Resumen',
        href: '/tienda-online',
        icon: Store,
        permissions: ['ecommerce:read'],
        exact: true,
      },
      {
        label: 'Pedidos web',
        href: '/tienda-online/pedidos',
        icon: Receipt,
        permissions: ['ecommerce:orders'],
      },
      {
        label: 'Solicitudes',
        href: '/tienda-online/solicitudes',
        icon: Lightbulb,
        permissions: ['ecommerce:orders'],
      },
      {
        label: 'Publicaciones',
        href: '/tienda-online/publicaciones',
        icon: LayoutGrid,
        permissions: ['ecommerce:read'],
      },
      {
        label: 'Categorías de la tienda',
        href: '/tienda-online/categorias',
        icon: FolderTree,
        permissions: ['ecommerce:read'],
      },
      {
        label: 'Ajustes de la tienda',
        href: '/tienda-online/ajustes',
        icon: Cog,
        permissions: ['ecommerce:settings'],
      },
    ],
  },
];
