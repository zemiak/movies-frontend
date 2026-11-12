// A small client for the movies backend (github.com/zemiak/movies), which speaks the subset of the
// Jellyfin API that Infuse uses. Everything goes through /api (proxied by nginx / the Vite dev server).

export const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export const TICKS_PER_SECOND = 10_000_000;

const DEVICE_ID = (() => {
  try {
    let id = localStorage.getItem("deviceId");
    if (!id) {
      id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
      localStorage.setItem("deviceId", id);
    }
    return id;
  } catch {
    return "web";
  }
})();

const AUTH =
  `MediaBrowser Client="Movies Web", Device="${navigator.userAgent.includes("Mac") ? "Mac" : "Browser"}", ` +
  `DeviceId="${DEVICE_ID}", Version="1.0.0"`;

export interface UserData {
  PlaybackPositionTicks: number;
  PlayCount: number;
  IsFavorite: boolean;
  Played: boolean;
  PlayedPercentage?: number;
  UnplayedItemCount?: number;
  LastPlayedDate?: string;
}

export interface MediaStream {
  Type: "Video" | "Audio" | "Subtitle";
  Index: number;
  Codec: string;
  Language?: string;
  Title?: string;
  DisplayTitle?: string;
  IsDefault: boolean;
  IsForced: boolean;
  IsExternal: boolean;
  DeliveryUrl?: string;
  Width?: number;
  Height?: number;
  Channels?: number;
  VideoRange?: string;
  VideoRangeType?: string;
}

export interface MediaSource {
  Id: string;
  Name: string;
  Container: string;
  Size: number;
  Bitrate?: number;
  RunTimeTicks?: number;
  MediaStreams: MediaStream[];
  DefaultAudioStreamIndex?: number;
  DefaultSubtitleStreamIndex?: number;
}

export interface Person {
  Id: string;
  Name: string;
  Role?: string;
  Type: string;
  PrimaryImageTag?: string;
}

export type ItemType =
  | "Movie"
  | "Series"
  | "Season"
  | "Episode"
  | "Video"
  | "CollectionFolder"
  | "Person"
  | "Genre"
  | "Studio";

export interface Item {
  Id: string;
  Name: string;
  Type: ItemType;
  IsFolder: boolean;
  SortName?: string;
  OriginalTitle?: string;
  Overview?: string;
  Taglines?: string[];
  ProductionYear?: number;
  PremiereDate?: string;
  DateCreated?: string;
  CommunityRating?: number;
  OfficialRating?: string;
  RunTimeTicks?: number;
  Genres?: string[];
  GenreItems?: { Id: string; Name: string }[];
  Studios?: { Id: string; Name: string }[];
  ProductionLocations?: string[];
  People?: Person[];
  ExternalUrls?: { Name: string; Url: string }[];
  ImageTags: Record<string, string>;
  BackdropImageTags: string[];
  PrimaryImageTag?: string;
  UserData?: UserData;
  CollectionType?: string;
  CollectionName?: string;
  ChildCount?: number;
  RecursiveItemCount?: number;
  Status?: string;
  // movies / episodes
  Container?: string;
  Width?: number;
  Height?: number;
  MediaSources?: MediaSource[];
  MediaSourceCount?: number;
  PartCount?: number;
  SpecialFeatureCount?: number;
  LocalTrailerCount?: number;
  ExtraType?: string;
  // seasons / episodes
  IndexNumber?: number;
  ParentIndexNumber?: number;
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  SeasonName?: string;
  SeriesPrimaryImageTag?: string;
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  ParentLogoItemId?: string;
  ParentLogoImageTag?: string;
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
}

export interface ItemList {
  Items: Item[];
  TotalRecordCount: number;
  StartIndex: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(q: Query = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? "?" + s : "";
}

// Runtime settings from /config.json (written by nginx from its environment; see nginx/).
interface RuntimeConfig {
  /** Where Infuse fetches streams from: the backend itself, since Infuse has no sign-in cookie for an
   * auth proxy in front of this app. Empty: this host's /api. */
  streamBase?: string;
}
let config: RuntimeConfig = {};
export const configLoaded: Promise<void> = fetch("/config.json", { redirect: "manual" })
  .then((r) => (r.ok ? r.json() : {}))
  .then((c: RuntimeConfig) => void (config = c ?? {}))
  .catch(() => {});

let reloading = false;
/** Behind the sign-in proxy an expired session turns API calls into redirects to the login page:
 * reload the page, which goes through the login and comes back. */
function sessionExpired(): never {
  if (!reloading) {
    reloading = true;
    window.location.reload();
  }
  throw new ApiError(401, "Signed out");
}

async function request<T>(method: string, path: string, q?: Query, body?: unknown): Promise<T> {
  const res = await fetch(API + path + qs(q), {
    method,
    headers: {
      "X-Emby-Authorization": AUTH,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    keepalive: method !== "GET",
    redirect: "manual",
  });
  if (res.type === "opaqueredirect" || res.status === 401) sessionExpired();
  if (!res.ok) throw new ApiError(res.status, `${method} ${path}: ${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const get = <T>(path: string, q?: Query) => request<T>("GET", path, q);
const post = <T>(path: string, body?: unknown, q?: Query) => request<T>("POST", path, q, body ?? {});
const del = <T>(path: string) => request<T>("DELETE", path);

// The server has a single user when authentication is off; it ignores the id in the path.
const U = "/Users/me";

const LIST_FIELDS = "Overview,Genres,ProductionYear,CommunityRating,OfficialRating,RunTimeTicks";

export const api = {
  views: () => get<ItemList>("/UserViews").then((r) => r.Items),

  item: (id: string) => get<Item>(`/Items/${id}`),

  items: (q: Query) => get<ItemList>("/Items", { Fields: LIST_FIELDS, ...q }),

  resume: (limit = 20) =>
    get<ItemList>(`${U}/Items/Resume`, { Limit: limit, Fields: LIST_FIELDS }).then((r) => r.Items),

  nextUp: (limit = 20, seriesId?: string) =>
    get<ItemList>("/Shows/NextUp", { Limit: limit, SeriesId: seriesId, Fields: LIST_FIELDS }).then(
      (r) => r.Items,
    ),

  latest: (parentId: string, limit = 24) =>
    get<Item[]>(`${U}/Items/Latest`, { ParentId: parentId, Limit: limit, Fields: LIST_FIELDS }),

  seasons: (seriesId: string) => get<ItemList>(`/Shows/${seriesId}/Seasons`).then((r) => r.Items),

  episodes: (seriesId: string, seasonId?: string) =>
    get<ItemList>(`/Shows/${seriesId}/Episodes`, { SeasonId: seasonId, Fields: LIST_FIELDS }).then(
      (r) => r.Items,
    ),

  extras: (id: string) =>
    Promise.all([
      get<Item[]>(`${U}/Items/${id}/LocalTrailers`),
      get<Item[]>(`${U}/Items/${id}/SpecialFeatures`),
    ]).then(([t, s]) => [...t, ...s]),

  parts: (id: string) => get<ItemList>(`/Videos/${id}/AdditionalParts`).then((r) => r.Items),

  genres: (parentId?: string) =>
    get<ItemList>("/Genres", { ParentId: parentId, SortBy: "SortName" }).then((r) => r.Items),

  search: (term: string, limit = 60) =>
    get<ItemList>("/Items", {
      SearchTerm: term,
      Recursive: true,
      IncludeItemTypes: "Movie,Series,Episode",
      Limit: limit,
      Fields: LIST_FIELDS,
    }).then((r) => r.Items),

  searchPeople: (term: string, limit = 24) =>
    get<ItemList>("/Persons", { SearchTerm: term, Limit: limit }).then((r) => r.Items),

  playbackInfo: (id: string) => get<{ MediaSources: MediaSource[]; PlaySessionId: string }>(`/Items/${id}/PlaybackInfo`),

  setPlayed: (id: string, played: boolean) =>
    played ? post<UserData>(`${U}/PlayedItems/${id}`) : del<UserData>(`${U}/PlayedItems/${id}`),

  setFavorite: (id: string, fav: boolean) =>
    fav ? post<UserData>(`${U}/FavoriteItems/${id}`) : del<UserData>(`${U}/FavoriteItems/${id}`),

  reportStart: (s: PlayState) => post("/Sessions/Playing", s),
  reportProgress: (s: PlayState) => post("/Sessions/Playing/Progress", s),
  reportStopped: (s: PlayState) => post("/Sessions/Playing/Stopped", s),
};

export interface PlayState {
  ItemId: string;
  MediaSourceId: string;
  PositionTicks: number;
  IsPaused?: boolean;
  PlaySessionId?: string;
}

// ------------------------------------------------------------------ URLs

export interface ImageOpts {
  maxWidth?: number;
  maxHeight?: number;
  fillWidth?: number;
  fillHeight?: number;
  tag?: string;
  quality?: number;
  index?: number;
}

export function imageUrl(id: string, type: string, o: ImageOpts = {}): string {
  const path = `/Items/${id}/Images/${type}` + (o.index !== undefined ? `/${o.index}` : "");
  return (
    API +
    path +
    qs({
      maxWidth: o.maxWidth,
      maxHeight: o.maxHeight,
      fillWidth: o.fillWidth,
      fillHeight: o.fillHeight,
      tag: o.tag,
      quality: o.quality ?? 90,
    })
  );
}

/** Portrait poster: the item's own, else (seasons, episodes) the series'. */
export function posterUrl(it: Item, width = 360): string | undefined {
  if (it.ImageTags?.Primary && it.Type !== "Episode")
    return imageUrl(it.Id, "Primary", { maxWidth: width, tag: it.ImageTags.Primary });
  if (it.SeriesId && it.SeriesPrimaryImageTag)
    return imageUrl(it.SeriesId, "Primary", { maxWidth: width, tag: it.SeriesPrimaryImageTag });
  if (it.ImageTags?.Primary) return imageUrl(it.Id, "Primary", { maxWidth: width, tag: it.ImageTags.Primary });
  return undefined;
}

/** Landscape artwork: episode stills, thumbs (landscape), backdrops; falls back to the series'. */
export function landscapeUrl(it: Item, width = 640): string | undefined {
  if (it.Type === "Episode" && it.ImageTags?.Primary)
    return imageUrl(it.Id, "Primary", { maxWidth: width, tag: it.ImageTags.Primary });
  if (it.ImageTags?.Thumb) return imageUrl(it.Id, "Thumb", { maxWidth: width, tag: it.ImageTags.Thumb });
  if (it.BackdropImageTags?.length)
    return imageUrl(it.Id, "Backdrop", { maxWidth: width, tag: it.BackdropImageTags[0], index: 0 });
  if (it.ParentThumbItemId && it.ParentThumbImageTag)
    return imageUrl(it.ParentThumbItemId, "Thumb", { maxWidth: width, tag: it.ParentThumbImageTag });
  if (it.ParentBackdropItemId && it.ParentBackdropImageTags?.length)
    return imageUrl(it.ParentBackdropItemId, "Backdrop", {
      maxWidth: width,
      tag: it.ParentBackdropImageTags[0],
      index: 0,
    });
  // Last resort: the (portrait) series poster, cropped by the card.
  if (it.SeriesId && it.SeriesPrimaryImageTag)
    return imageUrl(it.SeriesId, "Primary", { maxWidth: width, tag: it.SeriesPrimaryImageTag });
  if (it.ImageTags?.Primary) return imageUrl(it.Id, "Primary", { maxWidth: width, tag: it.ImageTags.Primary });
  return undefined;
}

export function backdropUrl(it: Item, width = 1920): string | undefined {
  if (it.BackdropImageTags?.length)
    return imageUrl(it.Id, "Backdrop", { maxWidth: width, tag: it.BackdropImageTags[0], index: 0, quality: 85 });
  if (it.ParentBackdropItemId && it.ParentBackdropImageTags?.length)
    return imageUrl(it.ParentBackdropItemId, "Backdrop", {
      maxWidth: width,
      tag: it.ParentBackdropImageTags[0],
      index: 0,
      quality: 85,
    });
  return undefined;
}

export function logoUrl(it: Item, width = 600): string | undefined {
  if (it.ImageTags?.Logo) return imageUrl(it.Id, "Logo", { maxWidth: width, tag: it.ImageTags.Logo });
  if (it.ParentLogoItemId && it.ParentLogoImageTag)
    return imageUrl(it.ParentLogoItemId, "Logo", { maxWidth: width, tag: it.ParentLogoImageTag });
  return undefined;
}

export function personImageUrl(p: Person | Item, width = 240): string | undefined {
  const tag = "PrimaryImageTag" in p ? p.PrimaryImageTag : undefined;
  const t = tag ?? (p as Item).ImageTags?.Primary;
  return t ? imageUrl(p.Id, "Primary", { maxWidth: width, tag: t }) : undefined;
}

export function streamUrl(itemId: string, src: MediaSource, absolute = false): string {
  const path = `${API}/Videos/${itemId}/stream.${src.Container}?Static=true&MediaSourceId=${src.Id}`;
  return absolute ? new URL(path, window.location.href).href : path;
}

export function downloadUrl(itemId: string, sourceId?: string): string {
  return `${API}/Items/${itemId}/Download` + qs({ MediaSourceId: sourceId });
}

/** Infuse's URL scheme: hands the stream to Infuse (iOS, tvOS, macOS). */
export function infuseUrl(itemId: string, src: MediaSource): string {
  const base = config.streamBase?.replace(/\/+$/, "");
  const url = base
    ? `${base}/Videos/${itemId}/stream.${src.Container}?Static=true&MediaSourceId=${src.Id}`
    : streamUrl(itemId, src, true);
  return "infuse://x-callback-url/play?url=" + encodeURIComponent(url);
}

export function subtitleUrl(st: MediaStream): string | undefined {
  return st.DeliveryUrl ? API + st.DeliveryUrl.replace(/api_key=[^&]*&?/, "").replace(/[?&]$/, "") : undefined;
}

// ------------------------------------------------------------------ formatting

export function formatRuntime(ticks?: number): string {
  if (!ticks) return "";
  const min = Math.round(ticks / TICKS_PER_SECOND / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function formatClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function remaining(it: Item): string {
  const rt = it.RunTimeTicks ?? 0;
  const pos = it.UserData?.PlaybackPositionTicks ?? 0;
  if (!rt || !pos) return "";
  const min = Math.max(1, Math.round((rt - pos) / TICKS_PER_SECOND / 60));
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min left` : `${min} min left`;
}

export function episodeLabel(it: Item): string {
  if (it.Type !== "Episode") return "";
  const s = it.ParentIndexNumber ?? 0;
  const e = it.IndexNumber;
  return s === 0 ? `Special${e ? ` ${e}` : ""}` : `S${s}${e !== undefined ? ` E${e}` : ""}`;
}

export function progressOf(it: Item): number {
  const ud = it.UserData;
  if (!ud) return 0;
  if (ud.PlayedPercentage !== undefined && !it.IsFolder) return ud.PlayedPercentage;
  if (it.RunTimeTicks && ud.PlaybackPositionTicks) return (ud.PlaybackPositionTicks * 100) / it.RunTimeTicks;
  return 0;
}

/** Badges such as 4K, HDR, Dolby Vision, 5.1, from the first media source. */
export function techBadges(src?: MediaSource): string[] {
  if (!src) return [];
  const out: string[] = [];
  const v = src.MediaStreams.find((s) => s.Type === "Video");
  if (v?.Width && v.Height) {
    if (v.Width >= 3800 || v.Height >= 2100) out.push("4K");
    else if (v.Width >= 1900 || v.Height >= 1000) out.push("1080p");
    else if (v.Width >= 1260 || v.Height >= 700) out.push("720p");
    else out.push("SD");
  }
  if (v?.VideoRangeType === "DOVI") out.push("Dolby Vision");
  else if (v?.VideoRangeType === "HDR10") out.push("HDR10");
  else if (v?.VideoRangeType === "HLG") out.push("HLG");
  if (v?.Codec) out.push(v.Codec === "hevc" ? "HEVC" : v.Codec.toUpperCase());
  const a = src.MediaStreams.find((s) => s.Type === "Audio" && s.IsDefault) ?? src.MediaStreams.find((s) => s.Type === "Audio");
  if (a) {
    const codec: Record<string, string> = { ac3: "Dolby Digital", eac3: "Dolby Digital+", truehd: "TrueHD", dts: "DTS", aac: "AAC", flac: "FLAC", mp3: "MP3", opus: "Opus" };
    out.push(codec[a.Codec] ?? a.Codec.toUpperCase());
    if (a.Channels === 6) out.push("5.1");
    else if (a.Channels === 8) out.push("7.1");
  }
  if (src.MediaStreams.some((s) => s.Type === "Subtitle")) out.push("CC");
  return out;
}

const LANGS: Record<string, string> = {
  eng: "English", cze: "Czech", ces: "Czech", slo: "Slovak", slk: "Slovak", ger: "German", deu: "German",
  fre: "French", fra: "French", spa: "Spanish", ita: "Italian", rus: "Russian", pol: "Polish", hun: "Hungarian",
  jpn: "Japanese", por: "Portuguese", dut: "Dutch", nld: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish",
  fin: "Finnish", ukr: "Ukrainian", hrv: "Croatian", chi: "Chinese", zho: "Chinese", kor: "Korean", tur: "Turkish",
};

export function languageName(code?: string): string {
  if (!code) return "Unknown";
  return LANGS[code.toLowerCase()] ?? code;
}

/** Whether this browser is likely to play the source directly (a hint, not a guarantee). */
export function playabilityWarning(src?: MediaSource): string | undefined {
  if (!src) return undefined;
  const v = document.createElement("video");
  const vs = src.MediaStreams.find((s) => s.Type === "Video");
  const as = src.MediaStreams.find((s) => s.Type === "Audio" && s.IsDefault) ?? src.MediaStreams.find((s) => s.Type === "Audio");
  const problems: string[] = [];
  if (vs?.Codec === "hevc" && !v.canPlayType('video/mp4; codecs="hvc1"')) problems.push("HEVC video");
  if (vs && ["mpeg2video", "mpeg4", "msmpeg4v3", "vc1", "wmv3"].includes(vs.Codec)) problems.push(`${vs.Codec.toUpperCase()} video`);
  if (as) {
    const ok: Record<string, string> = { ac3: 'audio/mp4; codecs="ac-3"', eac3: 'audio/mp4; codecs="ec-3"' };
    if (["dts", "truehd", "pcm_s16le", "pcm_s24le"].includes(as.Codec)) problems.push(`${as.Codec.toUpperCase()} audio`);
    else if (ok[as.Codec] && !v.canPlayType(ok[as.Codec])) problems.push(`${as.Codec === "ac3" ? "Dolby Digital" : "Dolby Digital+"} audio`);
  }
  if (["avi", "wmv", "mpg", "mpeg", "ts", "m2ts"].includes(src.Container)) problems.push(`.${src.Container} files`);
  if (!problems.length) return undefined;
  return `This browser probably can't play ${problems.join(" and ")}.`;
}
