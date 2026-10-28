import { SetMetadata } from '@nestjs/common';
import type { IntegrationScope } from './integration-keys';

export const INTEGRATION_SCOPES_KEY = 'integrationScopes';

/**
 * Alcances que exige una ruta de la API de integración (F11·1). Reemplaza a
 * `@Permissions` en esas rutas: las llama un sistema con su clave, no un usuario.
 */
export const IntegrationScopes = (...scopes: IntegrationScope[]) =>
  SetMetadata(INTEGRATION_SCOPES_KEY, scopes);
