import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { createPasswordSetupChallenge } from "./account-setup-policy";

const setupTokenLifetimeMs = 24 * 60 * 60 * 1000;

export {
  matchesPasswordSetupToken,
  parsePasswordSetupToken,
} from "./account-setup-policy";

export type AccountSetupTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function issuePasswordSetupLink(
  tx: AccountSetupTransaction,
  userId: string,
): Promise<string> {
  const randomPassword = randomBytes(32).toString("base64url");
  const passwordHash = await hashPassword(randomPassword);
  const [credential] = await tx.select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .for("update")
    .limit(1);
  if (credential) {
    await tx.update(account).set({ password: passwordHash }).where(eq(account.id, credential.id));
  } else {
    await tx.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });
  }

  const challenge = createPasswordSetupChallenge(userId);
  const setupUrl = new URL("/account/setup", process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
  setupUrl.hash = `${userId}.${challenge.secret}`;

  await tx.update(user).set({ isActive: false }).where(eq(user.id, userId));
  await tx.delete(session).where(eq(session.userId, userId));
  await tx.delete(verification).where(eq(verification.identifier, challenge.identifier));
  await tx.insert(verification).values({
    id: randomUUID(),
    identifier: challenge.identifier,
    value: challenge.value,
    expiresAt: new Date(Date.now() + setupTokenLifetimeMs),
  });

  return setupUrl.toString();
}
