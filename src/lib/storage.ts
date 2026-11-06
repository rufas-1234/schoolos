import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStorage {
  createUploadUrl(input: {
    contentType: string;
    fileName: string;
    schoolPublicId: string;
  }): Promise<{ objectKey: string; uploadUrl: string }>;
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

  async createUploadUrl(input: {
    contentType: string;
    fileName: string;
    schoolPublicId: string;
  }) {
    const safeFileName = input.fileName.replace(/[^\w.-]/g, "_").slice(0, 120);
    const objectKey = `${input.schoolPublicId}/${randomUUID()}-${safeFileName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
    });

    return {
      objectKey,
      uploadUrl: await getSignedUrl(this.client, command, { expiresIn: 300 }),
    };
  }
}

export function getObjectStorage(): ObjectStorage {
  const { OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_REGION, OBJECT_STORAGE_BUCKET } = process.env;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;

  if (!OBJECT_STORAGE_ENDPOINT || !OBJECT_STORAGE_REGION || !OBJECT_STORAGE_BUCKET || !accessKeyId || !secretAccessKey) {
    throw new Error("External object storage is not fully configured.");
  }

  return new S3CompatibleStorage({
    endpoint: OBJECT_STORAGE_ENDPOINT,
    region: OBJECT_STORAGE_REGION,
    bucket: OBJECT_STORAGE_BUCKET,
    accessKeyId,
    secretAccessKey,
  });
}
