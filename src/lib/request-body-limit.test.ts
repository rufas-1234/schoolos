import { describe, expect, it } from "vitest";
import { contentLengthError, getBoundedRequest } from "./request-body-limit";

describe("request body limits", () => {
  it("rejects malformed or oversized Content-Length values", () => {
    expect(contentLengthError("NaN", 10)).toBe("invalid");
    expect(contentLengthError("11", 10)).toBe("too-large");
    expect(contentLengthError("10", 10)).toBeNull();
    expect(contentLengthError(null, 10)).toBeNull();
  });

  it("rejects an oversized declared body without reading it", async () => {
    const result = await getBoundedRequest(
      new Request("https://schoolos.test/upload", {
        method: "POST",
        headers: { "content-length": "11" },
        body: new Uint8Array([1]),
      }),
      10,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("bounds streamed bodies even when Content-Length is absent", async () => {
    const oversized = await getBoundedRequest(
      new Request("https://schoolos.test/upload", {
        method: "POST",
        body: new Uint8Array(11),
      }),
      10,
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.response.status).toBe(413);

    const withinLimit = await getBoundedRequest(
      new Request("https://schoolos.test/upload", {
        method: "POST",
        body: new Uint8Array([1, 2, 3]),
      }),
      10,
    );
    expect(withinLimit.ok).toBe(true);
    if (withinLimit.ok) {
      expect(new Uint8Array(await withinLimit.request.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    }
  });
});
