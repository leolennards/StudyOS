/**
 * The region requests are signed for. R2 accepts "auto", the default.
 * Backblaze B2 and AWS put the region in the endpoint's hostname and reject
 * any other, so with "auto" it is read from there and nobody has to set it.
 */
export function signingRegion(endpoint: string, configured: string): string {
  if (configured !== "auto") return configured;
  const host = new URL(endpoint).hostname;
  const match = /^s3\.([a-z0-9-]+)\.(?:backblazeb2\.com|amazonaws\.com)$/.exec(host);
  return match ? match[1]! : configured;
}
