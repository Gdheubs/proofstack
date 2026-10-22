import type { Response } from "express";

// Responses that are the same for every signed-out visitor. Browsers keep
// them briefly; the web tier's edge cache keeps them a little longer. Vary
// on Cookie so a browser never reuses a signed-out copy after sign-in.
export function publicForVisitors(res: Response, browserSeconds = 30) {
  res.set({
    "Cache-Control": `public, max-age=${browserSeconds}, s-maxage=${browserSeconds * 2}`,
    Vary: "Cookie",
  });
}
// Content that is identical for everyone (public images, the catalog).
export function publicContent(res: Response, seconds: number) {
  res.set("Cache-Control", `public, max-age=${seconds}, s-maxage=${seconds}`);
}
