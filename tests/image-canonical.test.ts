import { createRequire } from "node:module";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  IMAGE_LIMITS,
  images,
} from "../artifacts/api-server/src/services/image-canonical";

// Fixtures are real encoder output, produced by the API's own sharp install.
const sharp = createRequire(
  new URL("../artifacts/api-server/package.json", import.meta.url),
)(
  "sharp",
) as typeof import("../artifacts/api-server/node_modules/sharp/lib/index");

const solid = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: "#3366cc" },
  });
const meta = (bytes: Buffer) => sharp(bytes).metadata();

// Rewrites a PNG's IHDR dimensions (with a valid CRC) without adding pixels.
async function claimedPng(width: number, height: number) {
  const png = Buffer.from(await solid(1, 1).png().toBuffer());
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)) >>> 0, 29);
  return png;
}

describe("canonical image re-encoding", () => {
  it.each([
    ["image/png", "png", () => solid(32, 16).png().toBuffer()],
    ["image/jpeg", "jpeg", () => solid(32, 16).jpeg().toBuffer()],
    ["image/webp", "webp", () => solid(32, 16).webp().toBuffer()],
  ] as const)(
    "re-encodes %s to a decodable image of the same format and size",
    async (type, format, make) => {
      const output = await images.canonical(await make(), type);
      expect(await meta(output)).toMatchObject({
        format,
        width: 32,
        height: 16,
      });
    },
  );

  it("strips EXIF and ICC metadata and keeps no original metadata bytes", async () => {
    const input = await solid(24, 24)
      .withMetadata({
        exif: { IFD0: { Copyright: "private-location-marker" } },
      })
      .withIccProfile("p3")
      .jpeg()
      .toBuffer();
    expect((await meta(input)).exif).toBeDefined();
    const output = await images.canonical(input, "image/jpeg");
    const result = await meta(output);
    expect(result.exif).toBeUndefined();
    expect(result.icc).toBeUndefined();
    expect(output.includes("private-location-marker")).toBe(false);
  });

  it("applies EXIF orientation before discarding it", async () => {
    const input = await solid(40, 20)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const result = await meta(await images.canonical(input, "image/jpeg"));
    expect(result).toMatchObject({ width: 20, height: 40 });
    expect(result.orientation).toBeUndefined();
  });

  it("rejects content whose real format differs from the declared type", async () => {
    await expect(
      images.canonical(await solid(8, 8).png().toBuffer(), "image/jpeg"),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_IMAGE" });
  });

  it.each([
    [
      "a truncated JPEG",
      async () => {
        const jpeg = await solid(256, 256).jpeg().toBuffer();
        return jpeg.subarray(0, Math.floor(jpeg.length / 2));
      },
      "image/jpeg",
    ],
    [
      "a PNG signature followed by garbage",
      async () =>
        Buffer.concat([
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          Buffer.alloc(64, 7),
        ]),
      "image/png",
    ],
    ["an empty body", async () => Buffer.alloc(0), "image/webp"],
  ] as const)("rejects %s", async (_label, make, type) => {
    await expect(images.canonical(await make(), type)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_IMAGE",
    });
  });

  it("rejects images wider than the per-side limit", async () => {
    const wide = await solid(IMAGE_LIMITS.dimension + 1, 1)
      .png()
      .toBuffer();
    await expect(images.canonical(wide, "image/png")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a decompression bomb from its header without decoding pixels", async () => {
    // 6000x6000 = 36 MP claimed by a 1x1 file; only the header is inspected.
    const bomb = await claimedPng(6000, 6000);
    expect(bomb.length).toBeLessThan(200);
    const started = Date.now();
    await expect(images.canonical(bomb, "image/png")).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("megapixels"),
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("rejects animated images instead of silently flattening them", async () => {
    const frame = (color: string) =>
      sharp({ create: { width: 4, height: 4, channels: 3, background: color } })
        .png()
        .toBuffer();
    const animated = await sharp([await frame("#f00"), await frame("#00f")], {
      join: { animated: true },
    })
      .webp()
      .toBuffer();
    expect((await meta(animated)).pages).toBe(2);
    await expect(
      images.canonical(animated, "image/webp"),
    ).rejects.toMatchObject({
      status: 400,
      message: "Animated images are not supported",
    });
  });

  it("runs one decode at a time and refuses work beyond the bounded queue", async () => {
    const input = await solid(64, 64).png().toBuffer();
    const calls = Array.from({ length: IMAGE_LIMITS.queue + 2 }, () =>
      images.canonical(input, "image/png"),
    );
    const results = await Promise.allSettled(calls);
    const refused = results.filter((r) => r.status === "rejected");
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({
      status: 503,
      code: "IMAGE_PROCESSING_BUSY",
    });
    // The queue drains completely afterwards.
    await expect(images.canonical(input, "image/png")).resolves.toBeInstanceOf(
      Buffer,
    );
  });
});
