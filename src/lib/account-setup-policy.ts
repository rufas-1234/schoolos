import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const setupIdentifierPrefix = "school-account-setup:";
const tokenPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/i;

export function getPasswordSetupIdentifier(userId: string) {
  return `${setupIdentifierPrefix}${userId}`;
}

export function createPasswordSetupChallenge(userId: string) {
  const secret = randomBytes(32).toString("base64url");
  return {
    secret,
    identifier: getPasswordSetupIdentifier(userId),
    value: createHash("sha256").update(secret).digest("hex"),
  };
}

export function parsePasswordSetupToken(token: string) {
  const parsed = tokenPattern.exec(token);
  if (!parsed) return null;
  return {
    userId: parsed[1],
    identifier: getPasswordSetupIdentifier(parsed[1]),
    value: createHash("sha256").update(parsed[2]).digest("hex"),
  };
}

export function matchesPasswordSetupToken(storedValue: string, submittedValue: string) {
  const expected = Buffer.from(storedValue, "utf8");
  const actual = Buffer.from(submittedValue, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
