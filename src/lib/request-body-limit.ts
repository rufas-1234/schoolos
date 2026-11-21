export const maxUploadRequestBodyBytes = 5 * 1024 * 1024;
export const maxApiRequestBodyBytes = 1024 * 1024;

export function contentLengthError(contentLength: string | null, maxBytes: number) {
  if (contentLength === null) return null;
  if (!/^\d+$/.test(contentLength)) return "invalid";
  const parsedLength = Number(contentLength);
  if (!Number.isSafeInteger(parsedLength)) return "invalid";
  return parsedLength > maxBytes ? "too-large" : null;
}

export async function getBoundedRequest(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; request: Request } | { ok: false; response: Response }> {
  const headerError = contentLengthError(request.headers.get("content-length"), maxBytes);
  if (headerError === "invalid") {
    return { ok: false, response: Response.json({ error: "Invalid Content-Length header." }, { status: 400 }) };
  }
  if (headerError === "too-large") {
    return { ok: false, response: Response.json({ error: "Request body is too large." }, { status: 413 }) };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return { ok: false, response: Response.json({ error: "Request body is too large." }, { status: 413 }) };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers,
    body: totalBytes ? body : null,
  });
  return { ok: true, request: boundedRequest };
}
