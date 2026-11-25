import { describe, expect, it } from "vitest";
import { parseCsvRows } from "./csv-import";

describe("parseCsvRows", () => {
  it("parses quoted commas, escaped quotes, and embedded newlines", () => {
    expect(parseCsvRows('\uFEFFname,note\r\n"Lee, Sam","Said ""hello""\nagain"\r\n')).toEqual([
      ["name", "note"],
      ["Lee, Sam", 'Said "hello"\nagain'],
    ]);
  });

  it("rejects malformed quoted fields", () => {
    expect(() => parseCsvRows('name,note\nSam,"unfinished')).toThrow(
      "A quoted CSV field is not closed.",
    );
    expect(() => parseCsvRows('name,note\nSam,"quoted"x')).toThrow(
      "Unexpected character after a quoted CSV field.",
    );
  });
});
