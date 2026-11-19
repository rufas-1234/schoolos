import { describe, expect, it } from "vitest";
import { matchesFileSignature } from "./file-signature";

describe("file signature validation", () => {
  it("accepts supported document and image signatures", () => {
    expect(matchesFileSignature("application/pdf", Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(matchesFileSignature("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(matchesFileSignature("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(matchesFileSignature("image/webp", Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]))).toBe(true);
  });

  it("rejects a declared type that does not match the file bytes", () => {
    expect(matchesFileSignature("application/pdf", Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(matchesFileSignature("text/plain", Uint8Array.from([0x41, 0x42, 0x43]))).toBe(false);
  });
});
