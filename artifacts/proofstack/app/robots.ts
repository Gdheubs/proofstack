import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private workspaces and the API are not useful in search results.
      disallow: ["/api/", "/account", "/auth", "/editor", "/notifications"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
