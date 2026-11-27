import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export const NEON_DEFAULT_BUCKET = "uploads";

let cachedS3: S3Client | null = null;

export function isObjectStorageConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_ENDPOINT_URL_S3
  );
}

export function getNeonStorageClient(): S3Client | null {
  if (!isObjectStorageConfigured()) return null;
  if (!cachedS3) {
    // Per neon-object-storage skill: Neon S3 requires forcePathStyle: true
    cachedS3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-2",
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return cachedS3;
}

/**
 * Stores structured crawl run diagnostic reports (JSON) in the branch-scoped Neon Object Storage bucket.
 * Never stores copyrighted brand product imagery.
 */
export async function uploadCrawlReport(
  key: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const client = getNeonStorageClient();
  if (!client) return false;
  await client.send(
    new PutObjectCommand({
      Bucket: NEON_DEFAULT_BUCKET,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: "application/json",
    })
  );
  return true;
}

/**
 * End-to-end health verification for Neon Object Storage: Put -> Get -> Delete round trip.
 */
export async function verifyObjectStorageRoundTrip(): Promise<{
  configured: boolean;
  ok: boolean;
  bucket: string;
  error?: string;
}> {
  const client = getNeonStorageClient();
  if (!client) {
    return {
      configured: false,
      ok: false,
      bucket: NEON_DEFAULT_BUCKET,
      error: "AWS_ENDPOINT_URL_S3 / AWS credentials not configured",
    };
  }

  const probeKey = `health/probe-${Date.now()}.json`;
  const expectedPayload = JSON.stringify({ ok: true, service: "tape-and-tailor", ts: Date.now() });

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: NEON_DEFAULT_BUCKET,
        Key: probeKey,
        Body: expectedPayload,
        ContentType: "application/json",
      })
    );

    const getRes = await client.send(
      new GetObjectCommand({
        Bucket: NEON_DEFAULT_BUCKET,
        Key: probeKey,
      })
    );
    const bodyText = await getRes.Body?.transformToString();
    const matched = bodyText === expectedPayload;

    await client.send(
      new DeleteObjectCommand({
        Bucket: NEON_DEFAULT_BUCKET,
        Key: probeKey,
      })
    );

    return {
      configured: true,
      ok: matched,
      bucket: NEON_DEFAULT_BUCKET,
      error: matched ? undefined : "Downloaded object payload did not match uploaded payload",
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      bucket: NEON_DEFAULT_BUCKET,
      error: (err as Error).message,
    };
  }
}
