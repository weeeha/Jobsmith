import { StorageError, type Storage } from "./driver";
import type { StorageConfig } from "./config";

type S3Config = Extract<StorageConfig, { provider: "s3" }>;

// The one method the driver calls, so tests inject a fake.
export type S3Like = { send(command: unknown): Promise<unknown> };

// The SDK loads here and only here, so a deployment on another provider
// never pays for it.
export async function buildS3Client(config: S3Config) {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "error";
}

function isMissing(error: unknown): boolean {
  return errorName(error) === "NoSuchKey";
}

export function createS3Storage(config: S3Config, injected?: S3Like): Storage {
  let clientPromise: Promise<S3Like> | undefined;
  const client = () => (clientPromise ??= injected ? Promise.resolve(injected) : buildS3Client(config));

  return {
    async put(key, bytes, contentType) {
      try {
        const { PutObjectCommand } = await import("@aws-sdk/client-s3");
        // No ACL: the bucket stays private and the app serves every clip.
        await (await client()).send(
          new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentType: contentType }),
        );
      } catch (error) {
        throw new StorageError(`s3 put failed: ${errorName(error)}`);
      }
    },
    async get(key) {
      try {
        const { GetObjectCommand } = await import("@aws-sdk/client-s3");
        const response = (await (await client()).send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
        if (!response.Body) return null;
        return await response.Body.transformToByteArray();
      } catch (error) {
        if (isMissing(error)) return null;
        throw new StorageError(`s3 get failed: ${errorName(error)}`);
      }
    },
    async delete(key) {
      try {
        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        await (await client()).send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch (error) {
        if (isMissing(error)) return;
        throw new StorageError(`s3 delete failed: ${errorName(error)}`);
      }
    },
  };
}
