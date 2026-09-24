export type Result<T, C extends string = string> =
  | { ok: true; data: T }
  | { ok: false; code: C; message: string };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function fail<C extends string>(code: C, message: string): Result<never, C> {
  return { ok: false, code, message };
}
