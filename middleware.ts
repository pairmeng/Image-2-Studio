import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/\/+$/, "");
}

function getRequestProtocolCandidates(request: NextRequest) {
  const candidates = new Set([request.nextUrl.protocol]);
  const forwardedProto = request.headers.get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto === "https" || forwardedProto === "http") {
    candidates.add(`${forwardedProto}:`);
  }

  return candidates;
}

function isSameOrigin(request: NextRequest, value: string) {
  try {
    const checked = new URL(value);
    return getRequestProtocolCandidates(request).has(checked.protocol)
      && normalizeHost(checked.host) === normalizeHost(request.nextUrl.host);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || !mutatingMethods.has(request.method.toUpperCase())) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin")?.trim();
  if (origin) {
    return isSameOrigin(request, origin)
      ? NextResponse.next()
      : NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const referer = request.headers.get("referer")?.trim();
  if (referer && !isSameOrigin(request, referer)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"]
};
