import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public pages worth indexing; signed-in workspaces are left out.
const PATHS = [
  "",
  "/projects",
  "/community",
  "/opportunities",
  "/talent",
  "/assessments",
  "/organizations",
  "/about",
  "/terms",
  "/privacy",
  "/community-guidelines",
  "/contact",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({ url: `${SITE_URL}${path}` }));
}
