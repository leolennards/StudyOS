/**
 * Lets the app's web address upload to and read from the bucket, which the
 * browser needs because files go straight to storage (ADR-008). Run once
 * per bucket, and again if the app's address changes:
 *
 *   pnpm storage:cors https://your-app.vercel.app
 *
 * Reads the S3_* settings from the environment or .env. Cloudflare R2 users
 * can paste the same rules into the bucket's CORS policy in the dashboard
 * instead (docs/DEPLOYMENT.md).
 */
import "dotenv/config";
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

async function main() {
  const origins = process.argv.slice(2).map((o) => new URL(o).origin);
  if (origins.length === 0)
    throw new Error("Give the app's address, for example: pnpm storage:cors https://studyos.vercel.app");
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error("Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY first.");
  }
  const client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true" || process.env.S3_FORCE_PATH_STYLE === "1",
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  await client.send(
    new PutBucketCorsCommand({
      Bucket: S3_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedHeaders: ["content-type"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  const check = await client.send(new GetBucketCorsCommand({ Bucket: S3_BUCKET }));
  console.log(`CORS set on ${S3_BUCKET}:`, JSON.stringify(check.CORSRules, null, 2));
}

main().catch((error) => {
  console.error("Could not set CORS:", error instanceof Error ? error.message : error);
  process.exit(1);
});
