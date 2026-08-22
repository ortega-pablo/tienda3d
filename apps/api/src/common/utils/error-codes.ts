/**
 * Códigos de error canónicos de la API.
 *
 * La definición vive en `@tienda3d/shared` para que backend y frontend no
 * puedan divergir: antes estaba duplicada acá y en los dos fetchers de web, y
 * agregar un código nuevo no producía ningún error de tipo del otro lado.
 * Este re-export mantiene los imports existentes (`@/common/utils/error-codes`)
 * funcionando sin tocar los 20+ call sites.
 */
export { ErrorCode } from '@tienda3d/shared';
