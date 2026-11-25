import { describe } from "vitest";
import { parseStorageConfig } from "@/lib/storage/config";
import { createS3Storage } from "@/lib/storage/s3";
import { createVercelBlobStorage } from "@/lib/storage/vercel-blob";
import { runStorageContract } from "../helpers/storage-contract";

// Live runs need the owner's services: a MinIO or S3 endpoint, and a private
// Vercel Blob store. Skipped unless JOBSMITH_LIVE_STORAGE=1.
const live = process.env.JOBSMITH_LIVE_STORAGE === "1";

describe.skipIf(!live)("live storage", () => {
  const s3 = parseStorageConfig({ ...process.env, STORAGE_PROVIDER: "s3" });
  if (s3.ok && s3.config.provider === "s3") {
    const config = s3.config;
    runStorageContract("s3 (live)", () => createS3Storage(config));
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    runStorageContract("vercel_blob (live)", () => createVercelBlobStorage(token));
  }
});
