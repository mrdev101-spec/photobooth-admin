import { z } from 'zod';

/** Error body every Admin API returns to the kiosk: `{ code, message, retryable }`. */
export const ApiErrorSchema = z.object({
  code: z.string().regex(/^[A-Z]{2}\d{4}$/),
  message: z.string(),
  retryable: z.boolean(),
  details: z.unknown().optional()
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
