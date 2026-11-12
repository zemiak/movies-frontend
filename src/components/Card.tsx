import { Link } from "react-router-dom";
import { episodeLabel, landscapeUrl, posterUrl, progressOf, remaining, type Item } from "../api";
import { Img } from "./Img";

export function itemLink(it: Item): string {
  if (it.Type === "Season" && it.SeriesId) return `/item/${it.SeriesId}?season=${it.Id}`;
  return `/item/${it.Id}`;
}

function Overlay({ it }: { it: Item }) {
  const ud = it.UserData;
  const pct = progressOf(it);
  return (
    <>
      {ud?.Played && !it.IsFolder && <span className="badge-watched" title="Watched">✓</span>}
      {it.IsFolder && ud?.UnplayedItemCount ? (
        <span className="badge-count" title={`${ud.UnplayedItemCount} unwatched`}>
          {ud.UnplayedItemCount}
        </span>
      ) : it.IsFolder && ud?.Played ? (
        <span className="badge-watched" title="Watched">✓</span>
      ) : null}
      {pct > 0 && pct < 100 && !ud?.Played && !it.IsFolder && (
        <div className="progress">
          <div style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
  );
}

export function PosterCard({ it, sub }: { it: Item; sub?: string }) {
  const url = posterUrl(it);
  return (
    <Link to={itemLink(it)} className="card poster-card">
      <div className="art poster">
        <Img src={url} alt={it.Name} fallback={it.Name} />
        <Overlay it={it} />
      </div>
      <div className="card-title">{it.Name}</div>
      <div className="card-sub">{sub ?? it.ProductionYear ?? ""}</div>
    </Link>
  );
}

/** Landscape card for episodes and "continue watching": still + title + remaining time. */
export function LandscapeCard({ it, to, onPlay }: { it: Item; to?: string; onPlay?: boolean }) {
  const url = landscapeUrl(it);
  const isEp = it.Type === "Episode";
  const title = isEp ? it.SeriesName : it.Name;
  const sub = isEp ? `${episodeLabel(it)} · ${it.Name}` : remaining(it) || String(it.ProductionYear ?? "");
  const href = to ?? (onPlay ? `/play/${it.Id}` : `/item/${it.Id}`);
  return (
    <Link to={href} className="card landscape-card">
      <div className="art landscape">
        <Img src={url} alt={it.Name} fallback={title} />
        {onPlay && <span className="play-hint">▶</span>}
        <Overlay it={it} />
      </div>
      <div className="card-title">{title}</div>
      <div className="card-sub">{sub}</div>
    </Link>
  );
}
