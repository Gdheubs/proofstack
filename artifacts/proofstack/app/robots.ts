import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private workspaces and the API are not useful in search results.
      disallow: [
        "/api/",
        "/account",
        "/settings",
        "/welcome",
        "/auth",
        "/editor",
        "/code",
        "/notifications",
        // A credential is checked by whoever holds its code, not found by search.
        "/verify",
        // An attempt, and each member's own skill check pages.
        "/assessments/take",
        "/assessments/device-check",
        "/assessments/assigned",
        "/assessments/join",
        "/assessments/results/",
        "/assessments/studio",
        "/assessments/review",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
