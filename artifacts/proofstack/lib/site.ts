// The public address used in links shared outside the site (social previews,
// sitemap). Set NEXT_PUBLIC_SITE_URL at build time when a custom domain is added.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://proofstack-web.suhailalam302.workers.dev"
).replace(/\/+$/, "");
export const SITE_DESCRIPTION =
  "Show your projects, build with collaborators, and discover your next career opportunity.";
