'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  FolderPlus,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { handleApiError } from '@/lib/handle-error';
import { useConfirm } from '@/components/confirm-provider';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useHasPermission } from '@/components/user-provider';
import { CategoryDialog } from './category-dialog';

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  notes: string | null;
  /** Markup fallback. null = hereda del padre. */
  baseMarkupPct: number | null;
  productCount: number;
  children?: CategoryNode[];
}

type DialogState =
  | { mode: 'create-root' }
  | { mode: 'create-child'; parent: CategoryNode }
  | { mode: 'edit'; category: CategoryNode }
  | null;

export function CategoriesView({ initial }: { initial: CategoryNode[] }) {
  const can = useHasPermission();
  const canWrite = can('category:write');
  const router = useRouter();
  const confirm = useConfirm();

  const [tree, setTree] = useState(initial);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initial.map((c) => c.id)));
  const [dialog, setDialog] = useState<DialogState>(null);

  const totalCount = useMemo(
    () =>
      tree.reduce((acc, c) => acc + 1 + (c.children?.length ?? 0), 0),
    [tree],
  );
  const productsAssigned = useMemo(() => {
    let n = 0;
    for (const root of tree) {
      n += root.productCount;
      for (const child of root.children ?? []) n += child.productCount;
    }
    return n;
  }, [tree]);

  const reload = async () => {
    const fresh = await api<CategoryNode[]>('/categories');
    setTree(fresh);
    router.refresh();
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const remove = async (cat: CategoryNode) => {
    const ok = await confirm({
      title: `¿Eliminar "${cat.name}"?`,
      description:
        cat.parentId == null
          ? 'Si tiene subcategorías o productos asociados, no se podrá eliminar.'
          : 'Si tiene productos asociados, no se podrá eliminar.',
      confirmLabel: 'Eliminar',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await api(`/categories/${cat.id}`, { method: 'DELETE' });
      toast.success('Categoría eliminada.');
      await reload();
    } catch (err) {
      handleApiError(err);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <strong>{totalCount}</strong> categoría(s) · <strong>{productsAssigned}</strong> producto(s)
          asignado(s).
        </p>
        {canWrite && (
          <Button onClick={() => setDialog({ mode: 'create-root' })}>
            <Plus className="h-4 w-4" />
            Nueva categoría
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Árbol de categorías</CardTitle>
          <CardDescription>
            Click en el nombre para expandir/colapsar. Usá los botones para editar, agregar
            subcategoría o eliminar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {tree.length === 0 && (
            <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              No hay categorías cargadas todavía. Creá la primera para empezar a organizar el
              catálogo.
            </p>
          )}
          {tree.map((root) => {
            const isExpanded = expanded.has(root.id);
            const hasChildren = (root.children?.length ?? 0) > 0;
            return (
              <div key={root.id}>
                <CategoryRow
                  cat={root}
                  isExpanded={isExpanded}
                  hasChildren={hasChildren}
                  onToggle={() => toggleExpand(root.id)}
                  onEdit={
                    canWrite ? () => setDialog({ mode: 'edit', category: root }) : undefined
                  }
                  onAddChild={
                    canWrite ? () => setDialog({ mode: 'create-child', parent: root }) : undefined
                  }
                  onRemove={canWrite ? () => remove(root) : undefined}
                />
                {isExpanded &&
                  (root.children ?? []).map((child) => (
                    <CategoryRow
                      key={child.id}
                      cat={child}
                      isChild
                      onEdit={
                        canWrite
                          ? () => setDialog({ mode: 'edit', category: child })
                          : undefined
                      }
                      onRemove={canWrite ? () => remove(child) : undefined}
                    />
                  ))}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {dialog && (
        <CategoryDialog
          mode={dialog.mode === 'edit' ? 'edit' : 'create'}
          category={dialog.mode === 'edit' ? dialog.category : null}
          parent={dialog.mode === 'create-child' ? dialog.parent : null}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            await reload();
          }}
        />
      )}
    </>
  );
}

function CategoryRow({
  cat,
  isExpanded,
  hasChildren,
  isChild,
  onToggle,
  onEdit,
  onAddChild,
  onRemove,
}: {
  cat: CategoryNode;
  isExpanded?: boolean;
  hasChildren?: boolean;
  isChild?: boolean;
  onToggle?: () => void;
  onEdit?: () => void;
  onAddChild?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 rounded-md p-2 hover:bg-accent/40 ${
        isChild ? 'ml-8 border-l-2 border-muted pl-3' : ''
      } ${cat.isActive ? '' : 'opacity-60'}`}
    >
      {!isChild && hasChildren ? (
        <button
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground"
          title={isExpanded ? 'Colapsar' : 'Expandir'}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      ) : (
        <span className="inline-block w-4" />
      )}

      <div className="flex flex-1 items-center gap-2">
        {cat.icon && <span className="text-base">{cat.icon}</span>}
        <span className="font-medium">{cat.name}</span>
        {!cat.isActive && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <EyeOff className="inline h-3 w-3" /> inactiva
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          · {cat.productCount} producto(s)
          {!isChild && hasChildren ? ` · ${cat.children?.length ?? 0} subcategoría(s)` : ''}
        </span>
        <span className="ml-2 inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] font-mono">
          base {cat.baseMarkupPct != null ? `${cat.baseMarkupPct}%` : '— heredado'}
        </span>
      </div>

      <div className="hidden gap-1 group-hover:flex">
        <Button asChild variant="ghost" size="sm" title="Editar escalas por canal">
          <Link href={`/categorias/${cat.id}`}>
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Escalas</span>
          </Link>
        </Button>
        {onAddChild && (
          <Button variant="ghost" size="sm" onClick={onAddChild} title="Agregar subcategoría">
            <FolderPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Subcategoría</span>
          </Button>
        )}
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        )}
        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
