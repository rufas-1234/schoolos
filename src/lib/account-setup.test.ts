import { describe, expect, it } from "vitest";
import {
  createPasswordSetupChallenge,
  matchesPasswordSetupToken,
  parsePasswordSetupToken,
} from "./account-setup-policy";

describe("password setup tokens", () => {
  it("creates distinct high-entropy secrets and stores only their digest", () => {
    const userId = "2f6d2c4a-77d5-4e42-9f22-4fdc8213cc7e";
    const first = createPasswordSetupChallenge(userId);
    const second = createPasswordSetupChallenge(userId);

    expect(first.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.secret).not.toBe(second.secret);
    expect(first.value).toMatch(/^[a-f0-9]{64}$/);
    expect(first.value).not.toBe(first.secret);
    expect(first.identifier).toBe(`school-account-setup:${userId}`);
  });

  it("accepts only the expected user id and opaque token format", () => {
    const userId = "2f6d2c4a-77d5-4e42-9f22-4fdc8213cc7e";
    const tokenSecret = "A".repeat(43);
    const parsed = parsePasswordSetupToken(`${userId}.${tokenSecret}`);

    expect(parsed).toEqual({
      userId,
      identifier: `school-account-setup:${userId}`,
      value: expect.any(String),
    });
    expect(parsePasswordSetupToken(`${userId}.short`)).toBeNull();
    expect(parsePasswordSetupToken(`not-a-user.${tokenSecret}`)).toBeNull();
  });

  it("compares setup token hashes without accepting a different value", () => {
    expect(matchesPasswordSetupToken("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(matchesPasswordSetupToken("a".repeat(64), "b".repeat(64))).toBe(false);
    expect(matchesPasswordSetupToken("a".repeat(64), "short")).toBe(false);
  });
});
