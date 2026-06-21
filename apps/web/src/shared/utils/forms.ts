import { z } from 'zod';

export function optionalString(maxLength?: number) {
  let schema = z.string().trim();

  if (maxLength) {
    schema = schema.max(maxLength);
  }

  return schema.transform((value) => (value === '' ? undefined : value));
}

export function optionalEmail() {
  return z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.string().email('Введите корректный email').max(200).optional());
}

export function nullToEmpty(value: string | null | undefined) {
  return value ?? '';
}
