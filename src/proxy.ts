import { NextResponse, type NextRequest } from "next/server";
import { storageOrigin } from "@/server/platform/storage/origin";

/**
 * Security headers on every response (Architecture §35).
 * Next.js 16 calls this "proxy" (formerly middleware); it runs on the Node.js
 * runtime. Session checks stay in the pages and actions, not here.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  // With S3 storage the browser uploads to and reads from the bucket directly.
  const storage = storageOrigin() ?? "";

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonce cover the scripts Next.js loads itself.
    // 'wasm-unsafe-eval' lets the PDF viewer run its WebAssembly image decoders; it allows no JavaScript eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' ${isDev ? "'unsafe-eval'" : ""}`.trim(),
    // The PDF viewer's worker, served from this origin.
    `worker-src 'self' blob:`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${storage}`.trim(),
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!isDev) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export const config = {
  // The local storage route is left out so uploads stream to disk instead of
  // being buffered (and cut off at 10 MB) for the proxy; it sets its own headers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/storage/local).*)"],
};
