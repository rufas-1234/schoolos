import { randomUUID } from "node:crypto";
import { get, put } from "@vercel/blob";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
}

function getS3CompatibleConfiguration() {
  const {
    OBJECT_STORAGE_ENDPOINT,
    OBJECT_STORAGE_REGION,
    OBJECT_STORAGE_BUCKET,
    OBJECT_STORAGE_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY,
  } = process.env;

  if (
    !OBJECT_STORAGE_ENDPOINT
    || !OBJECT_STORAGE_REGION
    || !OBJECT_STORAGE_BUCKET
    || !OBJECT_STORAGE_ACCESS_KEY_ID
    || !OBJECT_STORAGE_SECRET_ACCESS_KEY
  ) {
    return null;
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
  if (process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN)) {
    return new VercelBlobStorage();
  }

  const s3Configuration = getS3CompatibleConfiguration();
  if (s3Configuration) {
    return new S3CompatibleStorage(s3Configuration);
  }

  throw new Error("Object storage is not fully configured.");
}
