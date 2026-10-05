/**
 * The origin signed storage URLs point at, for the content security policy.
 * Read straight from the environment so the proxy can use it without
 * loading the storage SDK. Null for local storage, which is same-origin.
 */
export function storageOrigin(): string | null {
  if (process.env.STORAGE_DRIVER !== "s3" || !process.env.S3_ENDPOINT) return null;
  try {
    const u = new URL(process.env.S3_ENDPOINT);
    const pathStyle = process.env.S3_FORCE_PATH_STYLE === "true" || process.env.S3_FORCE_PATH_STYLE === "1";
    return pathStyle || !process.env.S3_BUCKET ? u.origin : `${u.protocol}//${process.env.S3_BUCKET}.${u.host}`;
  } catch {
    return null;
  }
}
