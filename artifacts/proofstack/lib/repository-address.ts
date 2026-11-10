// The in-site path of a repository hosted on ProofStack, or null when the
// link points elsewhere (for example GitHub). Hosted repositories live at
// <site>/<handle>/<name>, where the site is the address the page is open on.
export function hostedRepositoryPath(
  url: string,
  origin = (globalThis as { location?: { origin?: string } }).location
    ?.origin ?? "",
): string | null {
  if (!url || !origin) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  return /^\/[^/]+\/[^/]+$/.test(parsed.pathname) ? parsed.pathname : null;
}
