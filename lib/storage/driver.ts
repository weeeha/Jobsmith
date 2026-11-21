// Whole-object storage for audio clips and recordings. The spec names the
// interface `Storage`, which shadows the DOM global of that name, so import
// it explicitly wherever it is used.
export interface Storage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

// Thrown for any storage failure. The message names the failure kind only,
// never the key or the bytes.
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
