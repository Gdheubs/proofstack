"use client";
import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { VIDEO_PROVIDER_NAME, type VideoLink } from "./video-link";

// A video player that contacts the video site only after the member presses
// play. The player is sandboxed: it can run its own scripts, but cannot
// navigate ProofStack or reach its cookies.
export function VideoEmbed({ video }: { video: VideoLink }) {
  const [playing, setPlaying] = useState(false);
  const name = VIDEO_PROVIDER_NAME[video.provider];
  const frame = video.vertical
    ? "mx-auto aspect-[9/16] w-full max-w-xs"
    : "aspect-video w-full";
  return (
    <div className="mt-3 space-y-1.5">
      {playing ? (
        <iframe
          src={video.embedUrl}
          title={`${name} video`}
          className={`${frame} rounded-lg border bg-black`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          loading="lazy"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play the ${name} video`}
          className={`${frame} group relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border bg-gradient-to-br from-zinc-900 to-zinc-700 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:scale-110">
            <Play aria-hidden="true" className="ml-1 h-7 w-7 fill-white" />
          </span>
          <span className="text-sm font-medium">
            {video.vertical ? "Play short" : "Play video"}
          </span>
          <span className="absolute bottom-2 left-3 text-[11px] text-white/70">
            Plays from {name}. Nothing loads until you press play.
          </span>
        </button>
      )}
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        <ExternalLink aria-hidden="true" className="h-3 w-3" />
        Open on {name}
      </a>
    </div>
  );
}
