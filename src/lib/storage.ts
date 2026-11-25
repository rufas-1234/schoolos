import { randomUUID } from "node:crypto";
import { del, get, list, put } from "@vercel/blob";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStorage {
  uploadObject(input: {
    contentType: string;
    fileName: string;
    schoolPublicId: string;
    body: Uint8Array;
  }): Promise<{ objectKey: string }>;
  downloadObject(input: {
    objectKey: string;
    fileName: string;
    disposition?: "attachment" | "inline";
  }): Promise<Response | null>;
  deleteObjectsByPrefix(prefix: string): Promise<void>;
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^\w.-]/g, "_").slice(0, 120);
}

function getVercelBlobCredentials() {
  const { BLOB_STORE_ID, VERCEL_OIDC_TOKEN, BLOB_READ_WRITE_TOKEN } = process.env;
  if (BLOB_STORE_ID && VERCEL_OIDC_TOKEN) {
    return { storeId: BLOB_STORE_ID, oidcToken: VERCEL_OIDC_TOKEN };
  }
  return BLOB_READ_WRITE_TOKEN ? { token: BLOB_READ_WRITE_TOKEN } : {};
}

export class S3CompatibleStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async uploadObject(input: {
    contentType: string;
    fileName: string;
    schoolPublicId: string;
    body: Uint8Array;
  }) {
    const objectKey = `${input.schoolPublicId}/${randomUUID()}-${safeFileName(input.fileName)}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      Body: input.body,
    }));
    return { objectKey };
  }

  async downloadObject(input: {
    objectKey: string;
    fileName: string;
    disposition?: "attachment" | "inline";
  }): Promise<Response> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ResponseContentDisposition: `${input.disposition ?? "attachment"}; filename="${safeFileName(input.fileName)}"`,
    });
    return Response.redirect(await getSignedUrl(this.client, command, { expiresIn: 300 }), 302);
  }

  async deleteObjectsByPrefix(prefix: string) {
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      const objects = (page.Contents ?? [])
        .flatMap((object) => object.Key ? [{ Key: object.Key }] : []);
      if (objects.length) {
        const result = await this.client.send(new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objects, Quiet: false },
        }));
        if (result.Errors?.length) {
          throw new Error(`Failed to delete ${result.Errors.length} stored practice file(s).`);
        }
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !continuationToken) {
        throw new Error("Object storage did not provide a continuation token.");
      }
    } while (continuationToken);
  }
}

export class VercelBlobStorage implements ObjectStorage {
  async uploadObject(input: {
    contentType: string;
    fileName: string;
    schoolPublicId: string;
    body: Uint8Array;
  }) {
    const pathname = `${input.schoolPublicId}/${randomUUID()}-${safeFileName(input.fileName)}`;
    const blob = await put(pathname, Buffer.from(input.body), {
      access: "private",
      contentType: input.contentType,
      ...getVercelBlobCredentials(),
    });
    return { objectKey: blob.pathname };
  }

  async downloadObject(input: {
    objectKey: string;
    fileName: string;
    disposition?: "attachment" | "inline";
  }): Promise<Response | null> {
    const blob = await get(input.objectKey, {
      access: "private",
      ...getVercelBlobCredentials(),
    });
    if (!blob || blob.statusCode !== 200) return null;

    return new Response(blob.stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `${input.disposition ?? "attachment"}; filename="${safeFileName(input.fileName)}"`,
        "Content-Type": blob.blob.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  async deleteObjectsByPrefix(prefix: string) {
    const credentials = getVercelBlobCredentials();
    let cursor: string | undefined;
    do {
      const page = await list({
        prefix,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
        ...credentials,
      });
      if (page.blobs.length) {
        await del(page.blobs.map((blob) => blob.pathname), credentials);
      }
      cursor = page.hasMore ? page.cursor : undefined;
      if (page.hasMore && !cursor) {
        throw new Error("Object storage did not provide a continuation cursor.");
      }
    } while (cursor);
  }
}

function getS3CompatibleConfiguration() {
  const {
    OBJECT_STORAGE_ENDPOINT,
    OBJECT_STORAGE_REGION,
    OBJECT_STORAGE_BUCKET,
    OBJECT_STORAGE_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY,
  } = process.env;

  const values = [
    OBJECT_STORAGE_ENDPOINT,
    OBJECT_STORAGE_REGION,
    OBJECT_STORAGE_BUCKET,
    OBJECT_STORAGE_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY,
  ];
  if (values.every((value) => !value)) return null;

  if (
    !OBJECT_STORAGE_ENDPOINT
    || !OBJECT_STORAGE_REGION
    || !OBJECT_STORAGE_BUCKET
    || !OBJECT_STORAGE_ACCESS_KEY_ID
    || !OBJECT_STORAGE_SECRET_ACCESS_KEY
  ) {
    throw new Error("S3-compatible storage configuration is incomplete.");
  }

  return {
    endpoint: OBJECT_STORAGE_ENDPOINT,
    region: OBJECT_STORAGE_REGION,
    bucket: OBJECT_STORAGE_BUCKET,
    accessKeyId: OBJECT_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: OBJECT_STORAGE_SECRET_ACCESS_KEY,
  };
}

export function isObjectStorageConfigured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN
      || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)
      || getS3CompatibleConfiguration(),
  );
}

export function getObjectStorage(): ObjectStorage {
  const s3Configuration = getS3CompatibleConfiguration();
  if (s3Configuration) {
    return new S3CompatibleStorage(s3Configuration);
  }

  if (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
    return new VercelBlobStorage();
  }

  throw new Error("Object storage is not fully configured.");
}
