import { describe, expect, it } from "vitest";
import { parseStorageConfig } from "@/lib/storage/config";

const S3 = {
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "b",
  S3_REGION: "r",
  S3_ACCESS_KEY_ID: "id",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("parseStorageConfig", () => {
  it("defaults to local with dir .data/storage when STORAGE_PROVIDER is unset", () => {
    expect(parseStorageConfig({})).toEqual({
      ok: true,
      config: { provider: "local", dir: ".data/storage" },
    });
  });

  it("STORAGE_LOCAL_DIR overrides the directory", () => {
    expect(parseStorageConfig({ STORAGE_LOCAL_DIR: "/srv/audio" })).toEqual({
      ok: true,
      config: { provider: "local", dir: "/srv/audio" },
    });
  });

  it("refuses local when VERCEL is set, naming STORAGE_PROVIDER", () => {
    expect(parseStorageConfig({ VERCEL: "1" })).toEqual({ ok: false, invalid: ["STORAGE_PROVIDER"] });
    expect(parseStorageConfig({ VERCEL: "1", STORAGE_PROVIDER: "local" })).toEqual({
      ok: false,
      invalid: ["STORAGE_PROVIDER"],
    });
  });

  it("s3 needs S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY; S3_ENDPOINT is optional; S3_FORCE_PATH_STYLE=true sets forcePathStyle", () => {
    expect(parseStorageConfig(S3)).toEqual({
      ok: true,
      config: {
        provider: "s3",
        endpoint: null,
        region: "r",
        bucket: "b",
        accessKeyId: "id",
        secretAccessKey: "secret",
        forcePathStyle: false,
      },
    });
    const full = parseStorageConfig({
      ...S3,
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_FORCE_PATH_STYLE: "true",
    });
    expect(full).toMatchObject({
      ok: true,
      config: { endpoint: "http://127.0.0.1:9000", forcePathStyle: true },
    });
    for (const name of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      const source: Record<string, string | undefined> = { ...S3 };
      delete source[name];
      expect(parseStorageConfig(source)).toEqual({ ok: false, invalid: [name] });
    }
  });

  it("vercel_blob needs BLOB_READ_WRITE_TOKEN", () => {
    expect(parseStorageConfig({ STORAGE_PROVIDER: "vercel_blob", BLOB_READ_WRITE_TOKEN: "tok" })).toEqual({
      ok: true,
      config: { provider: "vercel_blob", token: "tok" },
    });
    expect(parseStorageConfig({ STORAGE_PROVIDER: "vercel_blob" })).toEqual({
      ok: false,
      invalid: ["BLOB_READ_WRITE_TOKEN"],
    });
  });

  it("memory is allowed outside production and refused when NODE_ENV is production", () => {
    expect(parseStorageConfig({ STORAGE_PROVIDER: "memory" })).toEqual({
      ok: true,
      config: { provider: "memory" },
    });
    expect(parseStorageConfig({ STORAGE_PROVIDER: "memory", NODE_ENV: "production" })).toEqual({
      ok: false,
      invalid: ["STORAGE_PROVIDER"],
    });
  });

  it("an unknown provider is invalid", () => {
    expect(parseStorageConfig({ STORAGE_PROVIDER: "gcs" })).toEqual({
      ok: false,
      invalid: ["STORAGE_PROVIDER"],
    });
  });
});
