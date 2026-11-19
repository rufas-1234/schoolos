import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimit } from "@/db/schema";

async function consumeRateLimit({
  key,
  maxRequests,
  windowMs,
}: {
  key: string;
  maxRequests: number;
  windowMs: number;
}) {
  const now = Date.now();
  await db.insert(rateLimit).values({
    id: randomUUID(),
    key,
    count: 1,
    lastRequest: now,
  }).onDuplicateKeyUpdate({
    set: {
      count: sql`CASE WHEN ${rateLimit.lastRequest} >= ${now - windowMs} THEN ${rateLimit.count} + 1 ELSE 1 END`,
      lastRequest: now,
    },
  });
  const [entry] = await db.select({ count: rateLimit.count }).from(rateLimit)
    .where(eq(rateLimit.key, key)).limit(1);
  return (entry?.count ?? 0) <= maxRequests;
}

export async function consumePublicAdmissionRateLimit({
  schoolId,
  operation,
  clientAddress,
  maxRequests,
  windowMs,
}: {
  schoolId: number;
  operation: "submission" | "upload" | "staff-submission" | "staff-upload";
  clientAddress: string;
  maxRequests: number;
  windowMs: number;
}) {
  if (!clientAddress) return false;
  const addressHash = createHash("sha256").update(clientAddress).digest("hex");
  const key = `public-admission:${operation}:${schoolId}:${addressHash}`;
  return consumeRateLimit({ key, maxRequests, windowMs });
}

export async function consumePublicSchoolSignupRateLimit({
  clientAddress,
  maxRequests,
  windowMs,
}: {
  clientAddress: string;
  maxRequests: number;
  windowMs: number;
}) {
  if (!clientAddress) return false;
  const addressHash = createHash("sha256").update(clientAddress).digest("hex");
  return consumeRateLimit({
    key: `public-school-signup:${addressHash}`,
    maxRequests,
    windowMs,
  });
}
