import sharp from "sharp";
import { ApiError } from "../lib/errors";

// Small instances: no decoded-image cache, one libvips thread per image.
sharp.cache(false);
sharp.concurrency(1);

export const IMAGE_LIMITS = {
  pixels: 25_000_000,
  dimension: 8192,
  seconds: 20,
  // Decodes run one at a time; a few more may wait, the rest are refused.
  queue: 4,
} as const;

type ImageType = "image/png" | "image/jpeg" | "image/webp";
const formats: Record<ImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

const rejected = (message: string) =>
  new ApiError(400, "INVALID_IMAGE", message);

let active = false;
const waiting: (() => void)[] = [];
async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (active) {
    if (waiting.length >= IMAGE_LIMITS.queue)
      throw new ApiError(
        503,
        "IMAGE_PROCESSING_BUSY",
        "Image processing is busy; retry shortly",
      );
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active = true;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active = false;
  }
}

async function canonical(input: Buffer, type: ImageType): Promise<Buffer> {
  return exclusive(async () => {
    const options = {
      limitInputPixels: IMAGE_LIMITS.pixels,
      failOn: "warning",
    } as const;
    let metadata;
    try {
      // Header only: reject bombs, mismatches and animation before decoding.
      // No pixels are read here, so the explicit checks below give the reason;
      // the decode keeps sharp's own pixel limit as a backstop.
      metadata = await sharp(input, {
        ...options,
        limitInputPixels: false,
      }).metadata();
    } catch {
      throw rejected("The image could not be read");
    }
    const { format, width = 0, height = 0, pages = 1 } = metadata;
    if (format !== formats[type])
      throw rejected("Image content does not match its declared type");
    if (
      width < 1 ||
      height < 1 ||
      width > IMAGE_LIMITS.dimension ||
      height > IMAGE_LIMITS.dimension ||
      width * height > IMAGE_LIMITS.pixels
    )
      throw rejected(
        `Images may be at most ${IMAGE_LIMITS.dimension} pixels per side and ${IMAGE_LIMITS.pixels / 1_000_000} megapixels`,
      );
    if (pages > 1) throw rejected("Animated images are not supported");
    // Full decode and fresh encode: only pixels survive. sharp drops EXIF,
    // XMP, ICC and comments unless asked to keep them; orientation is applied.
    const pipeline = sharp(input, options)
      .autoOrient()
      .timeout({ seconds: IMAGE_LIMITS.seconds });
    try {
      return await (
        type === "image/png"
          ? pipeline.png()
          : type === "image/jpeg"
            ? pipeline.jpeg({ quality: 85 })
            : pipeline.webp({ quality: 85 })
      ).toBuffer();
    } catch {
      throw rejected("The image could not be decoded");
    }
  });
}

// An object so tests and callers share one replaceable boundary.
export const images = { canonical };
