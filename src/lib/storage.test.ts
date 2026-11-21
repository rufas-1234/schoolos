import { describe, expect, it } from "vitest";
import { getObjectStorage, S3CompatibleStorage, VercelBlobStorage } from "./storage";

const storageEnvironmentVariables = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_STORE_ID",
  "VERCEL_OIDC_TOKEN",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_REGION",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY_ID",
  "OBJECT_STORAGE_SECRET_ACCESS_KEY",
] as const;

function withStorageEnvironment(values: Record<string, string>, run: () => void) {
  const previous = Object.fromEntries(
    storageEnvironmentVariables.map((name) => [name, process.env[name]]),
  );
  for (const name of storageEnvironmentVariables) delete process.env[name];
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const name of storageEnvironmentVariables) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("object storage selection", () => {
  it("prefers configured S3-compatible storage while a Vercel Blob token remains available", () => {
    withStorageEnvironment({
      BLOB_READ_WRITE_TOKEN: "legacy-vercel-token",
      OBJECT_STORAGE_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      OBJECT_STORAGE_REGION: "auto",
      OBJECT_STORAGE_BUCKET: "schoolos-media",
      OBJECT_STORAGE_ACCESS_KEY_ID: "test-access-key",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
    }, () => {
      expect(getObjectStorage()).toBeInstanceOf(S3CompatibleStorage);
    });
  });

  it("continues using Vercel Blob when no S3-compatible configuration is provided", () => {
    withStorageEnvironment({ BLOB_READ_WRITE_TOKEN: "legacy-vercel-token" }, () => {
      expect(getObjectStorage()).toBeInstanceOf(VercelBlobStorage);
    });
  });

  it("does not silently fall back to Vercel Blob for partial S3-compatible configuration", () => {
    withStorageEnvironment({
      BLOB_READ_WRITE_TOKEN: "legacy-vercel-token",
      OBJECT_STORAGE_BUCKET: "schoolos-media",
    }, () => {
      expect(() => getObjectStorage()).toThrow("S3-compatible storage configuration is incomplete.");
    });
  });
});
