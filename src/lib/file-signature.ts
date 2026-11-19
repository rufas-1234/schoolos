export function matchesFileSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "application/pdf") {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
      bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
      bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
      bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return contentType === "image/webp" && bytes[0] === 0x52 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 &&
    bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}
