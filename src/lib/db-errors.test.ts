import { describe, expect, it } from "vitest";
import { isDuplicateEntryError } from "./db-errors";

describe("isDuplicateEntryError", () => {
  it("recognizes a direct database duplicate error", () => {
    expect(isDuplicateEntryError({ code: "ER_DUP_ENTRY" })).toBe(true);
  });

  it("recognizes duplicate errors nested in causes", () => {
    expect(
      isDuplicateEntryError(
        new Error("Query failed", {
          cause: { code: "ER_DUP_ENTRY" },
        }),
      ),
    ).toBe(true);
  });

  it("safely handles unrelated and cyclic errors", () => {
    expect(isDuplicateEntryError(new Error("Connection failed"))).toBe(false);

    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isDuplicateEntryError(cyclic)).toBe(false);
  });
});
