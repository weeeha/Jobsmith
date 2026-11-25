export type StorageConfig =
  | { provider: "local"; dir: string }
  | { provider: "memory" }
  | {
      provider: "s3";
      endpoint: string | null;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
    }
  | { provider: "vercel_blob"; token: string };

export const DEFAULT_LOCAL_DIR = ".data/storage";

export function parseStorageConfig(
  source: Record<string, string | undefined>,
): { ok: true; config: StorageConfig } | { ok: false; invalid: string[] } {
  // Blank means unset, as for AI_PROVIDER.
  const provider = source.STORAGE_PROVIDER || "local";

  if (provider === "local") {
    // A serverless disk is gone after each invocation: never boot on it.
    if (source.VERCEL) return { ok: false, invalid: ["STORAGE_PROVIDER"] };
    return { ok: true, config: { provider: "local", dir: source.STORAGE_LOCAL_DIR || DEFAULT_LOCAL_DIR } };
  }
  if (provider === "memory") {
    if (source.NODE_ENV === "production") return { ok: false, invalid: ["STORAGE_PROVIDER"] };
    return { ok: true, config: { provider: "memory" } };
  }
  if (provider === "s3") {
    const invalid = ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter(
      (name) => !source[name],
    );
    if (invalid.length > 0) return { ok: false, invalid };
    return {
      ok: true,
      config: {
        provider: "s3",
        endpoint: source.S3_ENDPOINT || null,
        region: source.S3_REGION as string,
        bucket: source.S3_BUCKET as string,
        accessKeyId: source.S3_ACCESS_KEY_ID as string,
        secretAccessKey: source.S3_SECRET_ACCESS_KEY as string,
        forcePathStyle: source.S3_FORCE_PATH_STYLE === "true",
      },
    };
  }
  if (provider === "vercel_blob") {
    const token = source.BLOB_READ_WRITE_TOKEN;
    if (!token) return { ok: false, invalid: ["BLOB_READ_WRITE_TOKEN"] };
    return { ok: true, config: { provider: "vercel_blob", token } };
  }
  return { ok: false, invalid: ["STORAGE_PROVIDER"] };
}
