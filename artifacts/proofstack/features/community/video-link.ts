// Video links in posts: the first YouTube, Vimeo or Loom link in a post is
// shown as a player. Nothing is loaded from the video site until the member
// presses play; YouTube plays from its privacy-enhanced domain.
export type VideoProvider = "youtube" | "vimeo" | "loom";
export type VideoLink = {
  provider: VideoProvider;
  id: string;
  url: string;
  embedUrl: string;
  vertical: boolean;
};

// Every origin a player may load from; the site's frame-src allows these.
export const VIDEO_FRAME_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://www.loom.com",
] as const;

export const VIDEO_PROVIDER_NAME: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  loom: "Loom",
};

const seconds = (value: string | null) => {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match || !value) return 0;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
};

function fromUrl(raw: string): VideoLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtube.com" || host === "youtu.be") {
    let id = "";
    let vertical = false;
    if (host === "youtu.be") id = parts[0] ?? "";
    else if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
    else if (["shorts", "embed", "live"].includes(parts[0] ?? "")) {
      id = parts[1] ?? "";
      vertical = parts[0] === "shorts";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const start = seconds(
      url.searchParams.get("t") ?? url.searchParams.get("start"),
    );
    return {
      provider: "youtube",
      id,
      url: raw,
      vertical,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ""}`,
    };
  }
  if (host === "vimeo.com") {
    const id = parts[0] ?? "";
    if (!/^\d{1,12}$/.test(id)) return null;
    // Unlisted videos carry a privacy hash after the id.
    const hash = /^[a-f0-9]{6,20}$/.test(parts[1] ?? "") ? parts[1] : null;
    return {
      provider: "vimeo",
      id,
      url: raw,
      vertical: false,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1${hash ? `&h=${hash}` : ""}`,
    };
  }
  if (host === "loom.com") {
    const id =
      parts[0] === "share" || parts[0] === "embed" ? (parts[1] ?? "") : "";
    if (!/^[a-f0-9]{32}$/.test(id)) return null;
    return {
      provider: "loom",
      id,
      url: raw,
      vertical: false,
      embedUrl: `https://www.loom.com/embed/${id}?autoplay=1`,
    };
  }
  return null;
}

// The first supported video link in a post's text, or null.
export function findVideoLink(text: string): VideoLink | null {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/gi)) {
    const link = fromUrl(match[0].replace(/[.,;:!?]+$/, ""));
    if (link) return link;
  }
  return null;
}
