# movies-frontend

A web UI for [movies](https://github.com/zemiak/movies), the small Jellyfin-compatible server, styled
after Infuse: dark, artwork-first, with shelves and a fullscreen player.

- **Home**: a rotating hero (backdrop and clear logo), then *Continue Watching*, *Up Next*, *Recently
  Added* per library, *Favorites* and a random pick of unwatched films.
- **Libraries**: poster grids with filters (all, unwatched, watched, favorites), genre, sort order and
  infinite scrolling. Genre and person pages use the same grid.
- **Detail pages**: backdrop, logo, ratings, format badges (4K, HDR, Dolby Vision, 5.1, …), genres,
  cast, extras and file info. Buttons for play or resume, watched, favorite, *Open in Infuse* and
  download. Shows have season tabs and episode lists, and play the next episode.
- **Player**: plays the file directly in the browser (the server doesn't transcode). It has custom
  controls, a scrubber with time preview, versions, audio tracks (Safari) and external `.srt`
  subtitles (converted to WebVTT; UTF-8 or Windows-1250). Picture-in-picture, fullscreen and *Up
  Next* autoplay for episodes and multi-part films. Progress is reported to the server like Infuse
  does: resume points and watched state sync both ways.
- **Search**: movies, shows, episodes and people; genres when the search box is empty.

What the browser can't decode (for example AC3/DTS audio in Chrome, HEVC outside Safari) gets a
warning on the detail page, and the player offers **Open in Infuse** (`infuse://x-callback-url/play`)
or a download instead.

Keyboard shortcuts in the player: space/k play or pause, ←/→ 10 s (with shift, 30 s), ↑/↓ volume,
f fullscreen, m mute, c subtitles, Esc back.

## Development

Tooling comes from [devbox](https://www.jetify.com/devbox) (Node 22).

```sh
devbox run -- npm install
devbox run -- npm run dev                                          # http://localhost:5173, API: http://localhost:8096
MOVIES_API=https://movies.example.com devbox run -- npm run dev    # another backend
MOVIES_READONLY=1 devbox run -- npm run dev                        # writes (progress, watched) are dropped
devbox run -- npm run build                                    # typecheck + dist/
```

`/api/*` is proxied to the backend (`vite.config.ts` in development, nginx in production), so the
app and the API share an origin.

## Deployment

`Dockerfile`: builds the app and serves it with nginx. Environment:

| Variable | Default | |
|---|---|---|
| `MOVIES_API` | `http://movies.movies.svc.cluster.local:8096` | the backend that `/api/` proxies to |
| `STREAM_BASE` | (empty: this host's `/api`) | the backend URL that *Open in Infuse* links point at, served to the app as `/config.json` |

Behind a sign-in proxy, set `STREAM_BASE` to an address Infuse can reach without signing in (the
backend itself). Infuse has no session cookie for the proxy. An expired session makes the API
calls redirect to the login page, and the app reloads to sign in again.

On k3s it is `apps/movies-web` in the media-rpi repo: a build job picks up new commits on `main`,
builds the image with kaniko and restarts the Deployment. `apps/movies-authproxy` puts Google
sign-in in front of it (oauth2-proxy).
