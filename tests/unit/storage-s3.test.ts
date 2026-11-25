import { describe, expect, it } from "vitest";
import { StorageError } from "@/lib/storage/driver";
import { buildS3Client, createS3Storage, type S3Like } from "@/lib/storage/s3";
import type { StorageConfig } from "@/lib/storage/config";

const CONFIG: Extract<StorageConfig, { provider: "s3" }> = {
  provider: "s3",
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  bucket: "jobsmith-test",
  accessKeyId: "AKID",
  secretAccessKey: "SECRET",
  forcePathStyle: true,
};
const KEY = "u/0123456789abcdef/tts/0123456789abcdef0123456789abcdef.mp3";

type Sent = { name: string; input: Record<string, unknown> };

function fakeClient(respond: (sent: Sent) => unknown): { client: S3Like; sent: Sent[] } {
  const sent: Sent[] = [];
  const client: S3Like = {
    async send(command) {
      const entry = {
        name: (command as object).constructor.name,
        input: (command as { input: Record<string, unknown> }).input,
      };
      sent.push(entry);
      return respond(entry);
    },
  };
  return { client, sent };
}

function awsError(name: string): Error {
  const error = new Error(`${name} detail with ${KEY}`);
  error.name = name;
  return error;
}

describe("createS3Storage", () => {
  it("put sends PutObject with Bucket, Key, Body and ContentType and no ACL", async () => {
    const { client, sent } = fakeClient(() => ({}));
    const bytes = new Uint8Array([1, 2, 3]);
    await createS3Storage(CONFIG, client).put(KEY, bytes, "audio/mpeg");
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe("PutObjectCommand");
    expect(sent[0].input).toEqual({ Bucket: "jobsmith-test", Key: KEY, Body: bytes, ContentType: "audio/mpeg" });
    expect(sent[0].input).not.toHaveProperty("ACL");
  });

  it("get returns the bytes and returns null for NoSuchKey", async () => {
    const stored = new Uint8Array([5, 6, 7]);
    const hit = fakeClient(() => ({ Body: { transformToByteArray: async () => stored } }));
    const got = await createS3Storage(CONFIG, hit.client).get(KEY);
    expect(Array.from(got ?? [])).toEqual([5, 6, 7]);
    expect(hit.sent[0].name).toBe("GetObjectCommand");
    expect(hit.sent[0].input).toEqual({ Bucket: "jobsmith-test", Key: KEY });

    const miss = fakeClient(() => {
      throw awsError("NoSuchKey");
    });
    expect(await createS3Storage(CONFIG, miss.client).get(KEY)).toBeNull();
  });

  it("get rethrows other errors as StorageError", async () => {
    const { client } = fakeClient(() => {
      throw awsError("AccessDenied");
    });
    const error = await createS3Storage(CONFIG, client)
      .get(KEY)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as Error).message).toContain("AccessDenied");
    expect((error as Error).message).not.toContain(KEY);
  });

  it("put failures surface as StorageError with the SDK error name only", async () => {
    const { client } = fakeClient(() => {
      throw awsError("SlowDown");
    });
    const error = await createS3Storage(CONFIG, client)
      .put(KEY, new Uint8Array([1]), "audio/mpeg")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as Error).message).toContain("SlowDown");
    expect((error as Error).message).not.toContain(KEY);
  });

  it("delete sends DeleteObject and swallows NoSuchKey", async () => {
    const ok = fakeClient(() => ({}));
    await createS3Storage(CONFIG, ok.client).delete(KEY);
    expect(ok.sent[0].name).toBe("DeleteObjectCommand");
    expect(ok.sent[0].input).toEqual({ Bucket: "jobsmith-test", Key: KEY });

    const miss = fakeClient(() => {
      throw awsError("NoSuchKey");
    });
    await expect(createS3Storage(CONFIG, miss.client).delete(KEY)).resolves.toBeUndefined();

    const denied = fakeClient(() => {
      throw awsError("AccessDenied");
    });
    await expect(createS3Storage(CONFIG, denied.client).delete(KEY)).rejects.toBeInstanceOf(StorageError);
  });

  it("builds the client with endpoint, region, forcePathStyle and credentials from the config", async () => {
    const client = await buildS3Client(CONFIG);
    expect(await client.config.region()).toBe("us-east-1");
    expect(client.config.forcePathStyle).toBe(true);
    const endpoint = await client.config.endpoint?.();
    expect(endpoint?.hostname).toBe("127.0.0.1");
    expect(endpoint?.port).toBe(9000);
    const credentials = await client.config.credentials();
    expect(credentials.accessKeyId).toBe("AKID");
    expect(credentials.secretAccessKey).toBe("SECRET");
    client.destroy();

    const plain = await buildS3Client({ ...CONFIG, endpoint: null, forcePathStyle: false });
    expect(plain.config.forcePathStyle).toBe(false);
    expect(await plain.config.region()).toBe("us-east-1");
    plain.destroy();
  });
});
