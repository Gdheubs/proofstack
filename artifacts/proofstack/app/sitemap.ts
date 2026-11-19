import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public pages worth indexing; signed-in workspaces are left out.
const PATHS = [
  "",
  "/projects",
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
  // Shorts exist only once hosted video is configured (VIDEO_ORIGIN, read
  // when the sitemap is built); until then the address has no page worth
  // listing. Topic pages are reached through links, like profiles.
  const paths = process.env.VIDEO_ORIGIN ? [...PATHS, "/shorts"] : PATHS;
  return paths.map((path) => ({ url: `${SITE_URL}${path}` }));
}
