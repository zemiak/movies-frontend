import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  backdropUrl,
  downloadUrl,
  episodeLabel,
  formatRuntime,
  infuseUrl,
  landscapeUrl,
  languageName,
  logoUrl,
  personImageUrl,
  playabilityWarning,
  posterUrl,
  progressOf,
  remaining,
  techBadges,
  type Item,
  type MediaSource,
} from "../api";
import { LandscapeCard } from "../components/Card";
import { Img } from "../components/Img";
import { Shelf } from "../components/Shelf";
import { ErrorState, Spinner } from "../components/States";
import { useAsync, useDocumentTitle } from "../hooks";

export function Detail() {
  const { id = "" } = useParams();
  const { data: it, error, loading, reload, setData } = useAsync(() => api.item(id), [id]);
  useDocumentTitle(it?.Name);
  useEffect(() => window.scrollTo(0, 0), [id]);

  if (error && !it) return <ErrorState error={error} retry={reload} />;
  if (loading && (!it || it.Id !== id)) return <Spinner />;
  if (!it) return null;

  const bg = backdropUrl(it);
  return (
    <div className="detail">
      <div className="detail-bg" style={bg ? { backgroundImage: `url("${bg}")` } : undefined} />
      <div className="detail-shade" />
      <div className="detail-body">
        <Header it={it} onChange={(u) => setData(u)} reload={reload} />
        {it.Type === "Series" && <SeriesSeasons series={it} />}
        <Extras it={it} />
        <Cast it={it} />
        <Info it={it} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ header

function Header({ it, onChange, reload }: { it: Item; onChange: (it: Item) => void; reload: () => void }) {
  const nav = useNavigate();
  const sources = it.MediaSources ?? [];
  const [srcIdx, setSrcIdx] = useState(0);
  const src: MediaSource | undefined = sources[srcIdx];
  const logo = logoUrl(it);
  const poster = posterUrl(it, 500);
  const isEp = it.Type === "Episode";
  const pct = progressOf(it);
  const resumable = !it.IsFolder && pct > 0 && !it.UserData?.Played;
  const warn = useMemo(() => playabilityWarning(src), [src]);

  // Series: play the next episode.
  const nextUp = useAsync(
    () => (it.Type === "Series" ? nextEpisode(it.Id) : Promise.resolve(undefined)),
    [it.Id, it.UserData?.UnplayedItemCount],
  );

  const toggle = async (what: "played" | "fav") => {
    const ud = it.UserData!;
    const res = what === "played" ? await api.setPlayed(it.Id, !ud.Played) : await api.setFavorite(it.Id, !ud.IsFavorite);
    onChange({ ...it, UserData: { ...ud, ...res } });
    if (what === "played" && it.IsFolder) reload();
  };

  const play = (resume: boolean) => {
    const q = new URLSearchParams();
    if (src && sources.length > 1) q.set("source", src.Id);
    if (!resume) q.set("start", "0");
    nav(`/play/${it.Id}${q.size ? "?" + q : ""}`);
  };

  const badges = techBadges(src);
  return (
    <header className="detail-header">
      <div className="detail-poster">
        {isEp ? (
          <div className="art landscape"><Img src={landscapeUrl(it, 800)} alt={it.Name} /></div>
        ) : (
          <div className="art poster"><Img src={poster} alt={it.Name} /></div>
        )}
      </div>
      <div className="detail-info">
        {isEp && it.SeriesId && (
          <Link to={`/item/${it.SeriesId}?season=${it.SeasonId ?? ""}`} className="series-link">
            {it.SeriesName}
          </Link>
        )}
        {logo && !isEp ? <img className="detail-logo" src={logo} alt={it.Name} /> : <h1>{it.Name}</h1>}
        {isEp && <h2 className="ep-label">{episodeLabel(it)}</h2>}
        <div className="meta-line">
          {it.ProductionYear && <span>{it.ProductionYear}</span>}
          {it.OfficialRating && <span className="cert">{it.OfficialRating}</span>}
          {it.RunTimeTicks ? <span>{formatRuntime(it.RunTimeTicks)}</span> : null}
          {it.Type === "Series" && it.ChildCount ? <span>{it.ChildCount} {it.ChildCount === 1 ? "Season" : "Seasons"}</span> : null}
          {it.Status && <span>{it.Status}</span>}
          {it.CommunityRating ? <span className="rating">★ {it.CommunityRating.toFixed(1)}</span> : null}
        </div>
        {badges.length > 0 && (
          <div className="badges">{badges.map((b) => <span key={b} className="tech">{b}</span>)}</div>
        )}
        {it.Genres && it.Genres.length > 0 && (
          <div className="genres">
            {it.Genres.map((g) => <Link key={g} to={`/genre/${encodeURIComponent(g)}`}>{g}</Link>)}
          </div>
        )}
        {it.Taglines?.[0] && <p className="tagline">{it.Taglines[0]}</p>}
        <p className="overview">{it.Overview}</p>

        <div className="actions">
          {!it.IsFolder && (
            <>
              <button className="btn btn-primary" onClick={() => play(resumable)}>
                ▶ {resumable ? "Resume" : "Play"}
              </button>
              {resumable && <button className="btn" onClick={() => play(false)}>Play from Start</button>}
            </>
          )}
          {it.Type === "Series" && nextUp.data && (
            <Link className="btn btn-primary" to={`/play/${nextUp.data.Id}`}>
              ▶ {progressOf(nextUp.data) > 0 ? "Resume" : "Play"} {episodeLabel(nextUp.data)}
            </Link>
          )}
          <button className={`btn icon ${it.UserData?.Played ? "on" : ""}`} onClick={() => toggle("played")}
            title={it.UserData?.Played ? "Mark as unwatched" : "Mark as watched"}>
            ✓
          </button>
          <button className={`btn icon ${it.UserData?.IsFavorite ? "on fav" : ""}`} onClick={() => toggle("fav")}
            title={it.UserData?.IsFavorite ? "Remove from favorites" : "Add to favorites"}>
            {it.UserData?.IsFavorite ? "♥" : "♡"}
          </button>
          {src && (
            <a className="btn icon" href={infuseUrl(it.Id, src)} title="Open in Infuse">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" /></svg>
            </a>
          )}
          {src && (
            <a className="btn icon" href={downloadUrl(it.Id, src.Id)} title="Download">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M11 3h2v10.2l3.6-3.6L18 11l-6 6-6-6 1.4-1.4 3.6 3.6V3ZM4 19h16v2H4v-2Z" /></svg>
            </a>
          )}
        </div>
        {resumable && (
          <div className="resume-bar">
            <div className="progress"><div style={{ width: `${pct}%` }} /></div>
            <span>{remaining(it)}</span>
          </div>
        )}
        {warn && <p className="warn">{warn} Use “Open in Infuse” instead.</p>}
        {sources.length > 1 && (
          <div className="versions">
            <span className="label">Version</span>
            <div className="segmented">
              {sources.map((s, i) => (
                <button key={s.Id} className={i === srcIdx ? "active" : ""} onClick={() => setSrcIdx(i)}>{s.Name}</button>
              ))}
            </div>
          </div>
        )}
        {it.PartCount && it.PartCount > 1 ? <p className="muted">{it.PartCount} parts</p> : null}
      </div>
    </header>
  );
}

async function nextEpisode(seriesId: string): Promise<Item | undefined> {
  const up = await api.nextUp(1, seriesId);
  if (up[0]) return up[0];
  // Nothing watched yet (or all watched): the first unwatched regular episode, or the first one.
  const eps = (await api.episodes(seriesId)).filter((e) => (e.ParentIndexNumber ?? 0) > 0);
  return eps.find((e) => !e.UserData?.Played) ?? eps[0];
}

// ------------------------------------------------------------------ seasons

function SeriesSeasons({ series }: { series: Item }) {
  const [sp, setSp] = useSearchParams();
  const seasons = useAsync(() => api.seasons(series.Id), [series.Id]);
  const list = seasons.data ?? [];
  // Specials last, like Infuse.
  const ordered = [...list.filter((s) => s.IndexNumber !== 0), ...list.filter((s) => s.IndexNumber === 0)];
  const fallback = ordered.find((s) => (s.UserData?.UnplayedItemCount ?? 0) > 0) ?? ordered[0];
  const seasonId = sp.get("season") || fallback?.Id;
  const episodes = useAsync(
    () => (seasonId ? api.episodes(series.Id, seasonId) : Promise.resolve([])),
    [series.Id, seasonId],
  );

  if (!ordered.length) return null;
  return (
    <section className="seasons">
      <div className="season-tabs">
        {ordered.map((s) => (
          <button key={s.Id} className={s.Id === seasonId ? "active" : ""}
            onClick={() => setSp({ season: s.Id }, { replace: true })}>
            {s.Name}
            {s.UserData?.Played && <span className="tick">✓</span>}
          </button>
        ))}
      </div>
      {episodes.loading && !episodes.data ? (
        <Spinner />
      ) : (
        <div className="episodes">
          {episodes.data?.map((ep) => (
            <EpisodeRow key={ep.Id} ep={ep} onChange={(u) => episodes.setData((xs) => (xs ?? []).map((x) => (x.Id === u.Id ? u : x)))} />
          ))}
        </div>
      )}
    </section>
  );
}

function EpisodeRow({ ep, onChange }: { ep: Item; onChange: (it: Item) => void }) {
  const pct = progressOf(ep);
  const played = ep.UserData?.Played;
  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    const res = await api.setPlayed(ep.Id, !played);
    onChange({ ...ep, UserData: { ...ep.UserData!, ...res } });
  };
  return (
    <div className={`episode ${played ? "played" : ""}`}>
      <Link to={`/play/${ep.Id}`} className="art landscape ep-still">
        <Img src={landscapeUrl(ep, 480)} alt={ep.Name} fallback={episodeLabel(ep)} />
        <span className="play-hint">▶</span>
        {pct > 0 && !played && <div className="progress"><div style={{ width: `${pct}%` }} /></div>}
      </Link>
      <div className="ep-text">
        <Link to={`/item/${ep.Id}`} className="ep-title">
          <span className="ep-num">{ep.IndexNumber ?? ""}</span> {ep.Name}
        </Link>
        <div className="ep-meta">
          {ep.PremiereDate && <span>{new Date(ep.PremiereDate).toLocaleDateString()}</span>}
          {ep.RunTimeTicks ? <span>{formatRuntime(ep.RunTimeTicks)}</span> : null}
          {pct > 0 && !played && <span>{remaining(ep)}</span>}
        </div>
        <p className="ep-overview">{ep.Overview}</p>
      </div>
      <button className={`btn icon small ${played ? "on" : ""}`} onClick={toggle}
        title={played ? "Mark as unwatched" : "Mark as watched"}>✓</button>
    </div>
  );
}

// ------------------------------------------------------------------ extras, cast, info

function Extras({ it }: { it: Item }) {
  const n = (it.SpecialFeatureCount ?? 0) + (it.LocalTrailerCount ?? 0);
  const extras = useAsync(() => (n > 0 ? api.extras(it.Id) : Promise.resolve([])), [it.Id, n]);
  if (!extras.data?.length) return null;
  return (
    <Shelf title="Extras">
      {extras.data.map((x) => (
        <LandscapeCard key={x.Id} it={{ ...x, ParentBackdropItemId: it.Id, ParentBackdropImageTags: it.BackdropImageTags }} onPlay />
      ))}
    </Shelf>
  );
}

function Cast({ it }: { it: Item }) {
  const people = (it.People ?? []).filter((p) => p.Type === "Actor" || p.Type === "GuestStar");
  if (!people.length) return null;
  return (
    <Shelf title="Cast">
      {people.slice(0, 40).map((p) => (
        <Link key={p.Id + (p.Role ?? "")} to={`/person/${p.Id}?name=${encodeURIComponent(p.Name)}`} className="card person-card">
          <div className="art person"><Img src={personImageUrl(p)} alt={p.Name} fallback={initials(p.Name)} /></div>
          <div className="card-title">{p.Name}</div>
          <div className="card-sub">{p.Role}</div>
        </Link>
      ))}
    </Shelf>
  );
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
}

function Info({ it }: { it: Item }) {
  const crew = (type: string) => (it.People ?? []).filter((p) => p.Type === type);
  const directors = crew("Director");
  const writers = crew("Writer");
  const src = it.MediaSources?.[0];
  const audio = src?.MediaStreams.filter((s) => s.Type === "Audio") ?? [];
  const subs = src?.MediaStreams.filter((s) => s.Type === "Subtitle") ?? [];
  const rows: [string, React.ReactNode][] = [];
  if (it.OriginalTitle && it.OriginalTitle !== it.Name) rows.push(["Original Title", it.OriginalTitle]);
  if (directors.length) rows.push(["Directed by", peopleLinks(directors)]);
  if (writers.length) rows.push(["Written by", peopleLinks(writers)]);
  if (it.Studios?.length) rows.push(["Studio", it.Studios.map((s) => s.Name).join(", ")]);
  if (it.ProductionLocations?.length) rows.push(["Country", it.ProductionLocations.join(", ")]);
  if (it.PremiereDate) rows.push(["Released", new Date(it.PremiereDate).toLocaleDateString()]);
  if (it.CollectionName) rows.push(["Collection", it.CollectionName]);
  if (audio.length) rows.push(["Audio", unique(audio.map((a) => `${languageName(a.Language)} (${a.Codec.toUpperCase()}${a.Channels ? " " + chan(a.Channels) : ""})`)).join(", ")]);
  if (subs.length) rows.push(["Subtitles", unique(subs.map((s) => languageName(s.Language) + (s.IsForced ? " (forced)" : ""))).join(", ")]);
  if (src) rows.push(["File", `${src.Container.toUpperCase()} · ${formatSize(src.Size)}${src.Bitrate ? ` · ${(src.Bitrate / 1e6).toFixed(1)} Mbps` : ""}`]);
  if (it.ExternalUrls?.length)
    rows.push(["Links", <span className="links">{it.ExternalUrls.map((u) => <a key={u.Url} href={u.Url} target="_blank" rel="noreferrer">{u.Name}</a>)}</span>]);
  if (!rows.length) return null;
  return (
    <section className="info">
      <h2>Information</h2>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function peopleLinks(ps: { Id: string; Name: string }[]) {
  return ps.map((p, i) => (
    <span key={p.Id}>
      {i > 0 && ", "}
      <Link to={`/person/${p.Id}?name=${encodeURIComponent(p.Name)}`}>{p.Name}</Link>
    </span>
  ));
}

const unique = (xs: string[]) => [...new Set(xs)];
const chan = (n: number) => (n === 6 ? "5.1" : n === 8 ? "7.1" : n === 2 ? "Stereo" : n === 1 ? "Mono" : `${n}ch`);

function formatSize(b: number) {
  if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  return `${Math.round(b / 1e6)} MB`;
}
