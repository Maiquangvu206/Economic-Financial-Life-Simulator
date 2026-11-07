import { z } from 'zod';

/** All identifiers crossing a service boundary are UUIDs. */
export const IdSchema = z.string().uuid();
export type Id = z.infer<typeof IdSchema>;

export const IdParamSchema = z.object({ id: IdSchema });
