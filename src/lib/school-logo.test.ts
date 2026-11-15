import { describe, expect, it } from "vitest";
import { schoolLogoSource } from "./school-logo";

describe("school logo source", () => {
  it("uses the authorized school endpoint for private uploaded objects", () => {
    expect(schoolLogoSource("school-public-id/logo.png")).toBe("/api/admin/settings/logo");
  });

  it("preserves previously configured HTTPS logos", () => {
    expect(schoolLogoSource("https://cdn.example.edu/logo.png"))
      .toBe("https://cdn.example.edu/logo.png");
  });

  it("keeps an unset logo optional", () => {
    expect(schoolLogoSource(null)).toBeNull();
  });
});
