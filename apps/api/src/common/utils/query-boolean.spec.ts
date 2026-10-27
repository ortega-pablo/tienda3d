import { z } from 'zod';
import { queryBoolean } from './query-boolean';

const schema = z.object({ activeOnly: queryBoolean.optional() });

describe('queryBoolean', () => {
  it('lee "false" y "0" como false (z.coerce.boolean los leía como true)', () => {
    expect(schema.parse({ activeOnly: 'false' }).activeOnly).toBe(false);
    expect(schema.parse({ activeOnly: '0' }).activeOnly).toBe(false);
  });

  it('lee "true" y "1" como true', () => {
    expect(schema.parse({ activeOnly: 'true' }).activeOnly).toBe(true);
    expect(schema.parse({ activeOnly: '1' }).activeOnly).toBe(true);
  });

  it('ausente queda undefined', () => {
    expect(schema.parse({}).activeOnly).toBeUndefined();
  });

  it('rechaza cualquier otro valor', () => {
    expect(schema.safeParse({ activeOnly: 'si' }).success).toBe(false);
  });
});
