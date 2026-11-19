// Content security policy sources for recorded answers and hosted video.
// Each origin is optional and off by default: with none set nothing is
// added and the policy stays exactly as it was.
//
//   MEDIA_ORIGIN         the media Worker (recorded answers, voice clips)
//   VIDEO_ORIGIN         hosted video playback and posters
//   VIDEO_UPLOAD_ORIGIN  direct video uploads
const ORIGIN_NAMES = [
  "MEDIA_ORIGIN",
  "VIDEO_ORIGIN",
  "VIDEO_UPLOAD_ORIGIN",
] as const;

export type MediaCspDirective =
  "media-src" | "connect-src" | "img-src" | "worker-src";
/**
 * Sources to add, per directive. `media-src` and `worker-src` are new
 * directives and arrive complete; `connect-src` and `img-src` already exist
 * in the policy and receive these sources after their own.
 */
export type MediaCspSources = Partial<Record<MediaCspDirective, string>>;

// A URL parser accepts "*", ";" and "," inside a host name, and each of them
// means something in a policy. Plain DNS names only.
const HOST_NAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

// A wildcard, a path or a plain-HTTP address would widen the policy to
// places nobody reviewed, so anything but an exact HTTPS origin is an error.
function exactOrigin(name: string, value: string | undefined) {
  if (!value) return null;
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    // Reported below, without echoing the value.
  }
  if (
    url?.protocol !== "https:" ||
    url.origin !== value ||
    !HOST_NAME.test(url.hostname)
  )
    throw new Error(`${name} must be an exact HTTPS origin`);
  return value;
}

const unique = (values: Array<string | null>) => [
  ...new Set(values.filter((value): value is string => !!value)),
];

export function mediaCspSources(
  env: Record<string, string | undefined> = process.env,
): MediaCspSources {
  const [media, video, upload] = ORIGIN_NAMES.map((name) =>
    exactOrigin(name, env[name]),
  ) as [string | null, string | null, string | null];
  const sources: MediaCspSources = {};
  const playback = unique([media, video]);
  if (playback.length)
    sources["media-src"] = ["'self'", "blob:", ...playback].join(" ");
  const connect = unique([media, video, upload]);
  if (connect.length) sources["connect-src"] = connect.join(" ");
  if (video) {
    // Posters, and the worker the video player starts from a blob address.
    sources["img-src"] = video;
    sources["worker-src"] = "'self' blob:";
  }
  return sources;
}

// Directives that carry no 'self' of their own here: they extend one the
// policy already has, and must never be emitted alone.
const EXTENDS_EXISTING: MediaCspDirective[] = ["connect-src", "img-src"];

/** The policy's directives with the media sources added; unchanged when none are set. */
export function withMediaCsp(
  directives: string[],
  sources: MediaCspSources = mediaCspSources(),
): string[] {
  const pending = new Map(Object.entries(sources));
  const merged = directives.map((directive) => {
    const name = directive.split(" ", 1)[0]!;
    const extra = pending.get(name);
    if (!extra) return directive;
    pending.delete(name);
    return `${directive} ${extra}`;
  });
  for (const [name, value] of pending) {
    if (EXTENDS_EXISTING.includes(name as MediaCspDirective))
      throw new Error(`Content security policy has no ${name} directive`);
    merged.push(`${name} ${value}`);
  }
  return merged;
}
