export function stripScopedKeys<T extends object>(
  values: T,
): Omit<T, "userId" | "createdAt" | "updatedAt"> {
  const clone = { ...values } as Record<string, unknown>;
  delete clone.userId;
  delete clone.createdAt;
  delete clone.updatedAt;
  return clone as Omit<T, "userId" | "createdAt" | "updatedAt">;
}
