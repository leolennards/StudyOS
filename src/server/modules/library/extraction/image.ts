import sharp from "sharp";
import { PROCESSING_LIMITS } from "../domain/limits";
import { ProcessingError } from "./types";

/**
 * Re-encodes an uploaded image (Architecture §39): applies the camera's
 * rotation, strips all metadata including GPS location, caps its size, and
 * writes WebP for the viewer. Re-encoding also neutralises malformed files.
 */
export async function normaliseImage(data: Buffer) {
  try {
    const image = sharp(data, { limitInputPixels: PROCESSING_LIMITS.maxImagePixels, failOn: "error" });
    const max = PROCESSING_LIMITS.maxImageDimension;
    const pipeline = image.rotate().resize({ width: max, height: max, fit: "inside", withoutEnlargement: true });
    const webp = await pipeline.clone().webp({ quality: 85 }).toBuffer();
    // OCR reads a greyscale PNG of the same image.
    const forOcr = await pipeline.clone().greyscale().png().toBuffer();
    return { webp, forOcr };
  } catch (error) {
    throw new ProcessingError("This image is damaged or too large to open.", { cause: error });
  }
}
