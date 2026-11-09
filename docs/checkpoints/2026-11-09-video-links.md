# Video links in posts — November 9, 2026

Parent: `ba849ad`. Owner-approved option A of the video plan. Option B (own uploads: Shorts up to 60 s / 50 MB and Long videos up to 10 min / 300 MB on R2, with Report, likes, comments and repost) is approved to start once the R2 keys are set on Render.

## Changes

- The first YouTube, Vimeo or Loom link in a post shows as a player under the text. YouTube Shorts play in a vertical frame; `t=`/`start=` times are kept.
- Click to play: nothing is loaded from the video site until the member presses play (the card says so). YouTube plays from `youtube-nocookie.com`; Vimeo with `dnt=1`.
- The player frame is sandboxed (scripts and its own origin, no top navigation) and sends only the site's origin as referrer. An "Open on …" link sits under every player.
- The site's `frame-src` allows exactly the three player origins.
- The composer explains: paste a YouTube, Vimeo or Loom link to show the video as a player.
- No API or database change: links are read from the post text.

## Validation

- Unit: `tests/video-link.test.ts` (link formats, unlisted Vimeo, Loom, Shorts, start times, look-alike hosts and markup rejected, exact frame-src, sandbox) and the updated `tests/security.test.ts`. Full unit suite, typecheck, lint and format check pass.
