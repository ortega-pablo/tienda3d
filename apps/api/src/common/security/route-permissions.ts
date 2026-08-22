import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

/** Un endpoint HTTP con el permiso que exige. */
export interface RouteInfo {
  controller: string;
  handler: string;
  /** GET / POST / PATCH / PUT / DELETE */
  method: string;
  path: string;
  /** Permisos exigidos, heredando los del controller si el método no declara. */
  permissions: string[];
  isPublic: boolean;
}

/** Métodos HTTP que mutan estado. */
export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const HTTP_METHOD_BY_INDEX = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'ALL',
  'OPTIONS',
  'HEAD',
  'SEARCH',
];

function listFiles(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, suffix));
    else if (entry.endsWith(suffix)) out.push(full);
  }
  return out;
}

/**
 * Recorre los controllers del proyecto y devuelve todos sus endpoints con los
 * permisos que exigen, leídos de la metadata que dejan los decoradores.
 *
 * Es reflexión pura sobre metadata: no necesita base de datos ni levantar la
 * app, así que puede correr en la suite unitaria.
 */
export function collectRoutes(modulesDir: string): RouteInfo[] {
  const routes: RouteInfo[] = [];

  for (const file of listFiles(modulesDir, '.controller.ts')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const controller = exported as { name: string; prototype: object };
      const basePath: unknown = Reflect.getMetadata(PATH_METADATA, controller);
      if (basePath === undefined) continue; // no es un @Controller

      const classPermissions =
        (Reflect.getMetadata(PERMISSIONS_KEY, controller) as string[] | undefined) ?? [];

      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        // Descriptor y no `proto[name]`: leer la propiedad EJECUTA los getters
        // del controller (p.ej. `private get isProd()`), que dependen de
        // servicios inyectados y explotan fuera del contexto de Nest.
        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        const handler = descriptor?.value as unknown;
        if (typeof handler !== 'function') continue;

        const methodIndex = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (methodIndex === undefined) continue; // no es una ruta

        const permissions =
          (Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[] | undefined) ??
          classPermissions;

        routes.push({
          controller: controller.name,
          handler: name,
          method: HTTP_METHOD_BY_INDEX[methodIndex] ?? `#${methodIndex}`,
          path: `/${String(basePath)}/${String(Reflect.getMetadata(PATH_METADATA, handler) ?? '')}`
            .replace(/\/+/g, '/')
            .replace(/\/$/, ''),
          permissions,
          isPublic: Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
        });
      }
    }
  }
  return routes;
}
