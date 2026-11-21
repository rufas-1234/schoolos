import { NextResponse, type NextRequest } from "next/server";
import { contentLengthError, maxUploadRequestBodyBytes } from "@/lib/request-body-limit";

export function proxy(request: NextRequest) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return NextResponse.next();
  }

  const error = contentLengthError(
    request.headers.get("content-length"),
    maxUploadRequestBodyBytes,
  );
  if (error === "invalid") {
    return NextResponse.json({ error: "Invalid Content-Length header." }, { status: 400 });
  }
  if (error === "too-large") {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
