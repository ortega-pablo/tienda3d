import { z } from 'zod';

/**
 * Booleano de query string: "true"/"1" → true, "false"/"0" → false.
 *
 * `z.coerce.boolean()` hace `Boolean(valor)`, y cualquier texto no vacío es
 * verdadero: `?activeOnly=false` se leía como `true`. Un valor que no es
 * ninguno de los cuatro es un error de validación, no un booleano inventado.
 */
export const queryBoolean = z.preprocess((value) => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean());
