import { z } from 'zod';
import { IdSchema } from '../common/ids.js';

export const NotificationDtoSchema = z.object({
  id: IdSchema,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.unknown()),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type NotificationDto = z.infer<typeof NotificationDtoSchema>;

export const MarkNotificationsReadRequestSchema = z.object({
  ids: z.array(IdSchema).optional(),
});
export type MarkNotificationsReadRequest = z.infer<typeof MarkNotificationsReadRequestSchema>;
