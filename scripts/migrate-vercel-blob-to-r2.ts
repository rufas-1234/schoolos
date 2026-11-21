import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { get, list } from "@vercel/blob";
import { config } from "dotenv";

config({ path: ".env", override: true });
config({ path: ".env.local", override: true });

const maxBlobBytes = 16 * 1024 * 1024;

class MigrationError extends Error {}

function getSourceOptions() {
  if (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN) {
    return { storeId: process.env.BLOB_STORE_ID, oidcToken: process.env.VERCEL_OIDC_TOKEN };
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) return { token: process.env.BLOB_READ_WRITE_TOKEN };
  throw new MigrationError("Set Vercel Blob credentials in .env.local before migrating.");
}

function getTargetConfiguration() {
  const {
    OBJECT_STORAGE_ENDPOINT,
    OBJECT_STORAGE_REGION,
    OBJECT_STORAGE_BUCKET,
    OBJECT_STORAGE_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY,
  } = process.env;
  if (
    !OBJECT_STORAGE_ENDPOINT ||
    !OBJECT_STORAGE_REGION ||
    !OBJECT_STORAGE_BUCKET ||
    !OBJECT_STORAGE_ACCESS_KEY_ID ||
    !OBJECT_STORAGE_SECRET_ACCESS_KEY
  ) {
    throw new MigrationError("Set all OBJECT_STORAGE_* target variables in .env.local before migrating.");
  }
  return {
    endpoint: OBJECT_STORAGE_ENDPOINT,
    region: OBJECT_STORAGE_REGION,
    bucket: OBJECT_STORAGE_BUCKET,
    accessKeyId: OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: OBJECT_STORAGE_SECRET_ACCESS_KEY,
  };
}

async function main() {
  const sourceOptions = getSourceOptions();
  const execute = process.argv.includes("--execute");
  const target = execute ? getTargetConfiguration() : null;
  const client = target
    ? new S3Client({
        endpoint: target.endpoint,
        region: target.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: target.accessKeyId,
          secretAccessKey: target.secretAccessKey,
        },
      })
    : null;

  let cursor: string | undefined;
  let hasMore = true;
  let totalBlobs = 0;
  let totalBytes = 0;
  let copied = 0;
  let failed = 0;

  do {
    const page = await list({ ...sourceOptions, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const blob of page.blobs) {
      totalBlobs += 1;
      totalBytes += blob.size;
      if (!execute) continue;
      if (!target || !client) throw new MigrationError("R2 target configuration is unavailable.");

      try {
        if (blob.size > maxBlobBytes) {
          throw new Error("Blob exceeds the migration size limit.");
        }
        const source = await get(blob.pathname, { ...sourceOptions, access: "private" });
        if (!source || source.statusCode !== 200) {
          throw new Error("Vercel Blob could not be read.");
        }
        const body = Buffer.from(await new Response(source.stream).arrayBuffer());
        if (body.byteLength !== blob.size) {
          throw new Error("Downloaded size did not match Vercel Blob metadata.");
        }
        await client.send(new PutObjectCommand({
          Bucket: target.bucket,
          Key: blob.pathname,
          Body: body,
          ContentType: source.blob.contentType,
          CacheControl: "private, no-store",
        }));
        copied += 1;
      } catch {
        failed += 1;
        console.error(`Copy failed for blob ${totalBlobs}; its pathname and contents were not logged.`);
      }
    }

    cursor = page.cursor;
    hasMore = page.hasMore;
    if (hasMore && !cursor) throw new MigrationError("Vercel Blob pagination returned no next cursor.");
  } while (hasMore);

  const sizeInMiB = (totalBytes / (1024 * 1024)).toFixed(2);
  if (!execute) {
    console.info(`Dry run: found ${totalBlobs} blobs (${sizeInMiB} MiB). No files were copied.`);
    console.info("Pass -- --execute to copy them to the configured object-storage bucket.");
    return;
  }

  console.info(`Copied ${copied} of ${totalBlobs} blobs (${sizeInMiB} MiB). Source blobs were not deleted.`);
  if (failed > 0) throw new MigrationError(`${failed} blob(s) could not be copied; fix the issue and rerun safely.`);
}

main().catch((error: unknown) => {
  if (error instanceof MigrationError) {
    console.error(error.message);
  } else {
    console.error("Storage migration stopped due to a provider error; source blobs were not deleted. Check credentials and retry.");
  }
  process.exitCode = 1;
});
