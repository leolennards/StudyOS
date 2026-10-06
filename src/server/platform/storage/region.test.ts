import { describe, expect, it } from "vitest";
import { signingRegion } from "./region";

describe("storage signing region", () => {
  it("keeps auto for Cloudflare R2", () => {
    expect(signingRegion("https://abc123.r2.cloudflarestorage.com", "auto")).toBe("auto");
  });

  it("reads the region from a Backblaze B2 or AWS endpoint", () => {
    expect(signingRegion("https://s3.eu-central-003.backblazeb2.com", "auto")).toBe("eu-central-003");
    expect(signingRegion("https://s3.eu-west-2.amazonaws.com", "auto")).toBe("eu-west-2");
  });

  it("uses a region that was set explicitly", () => {
    expect(signingRegion("https://s3.eu-central-003.backblazeb2.com", "us-west-004")).toBe("us-west-004");
  });
});
