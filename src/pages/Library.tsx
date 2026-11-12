import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, type Item } from "../api";
import { PosterCard } from "../components/Card";
import { ErrorState, Spinner } from "../components/States";
import { useAsync, useDocumentTitle, useInView } from "../hooks";

const SORTS: { key: string; label: string; order: "Ascending" | "Descending" }[] = [
  { key: "SortName", label: "Title", order: "Ascending" },
  { key: "DateCreated", label: "Date Added", order: "Descending" },
  { key: "ProductionYear,SortName", label: "Year", order: "Descending" },
  { key: "CommunityRating,SortName", label: "Rating", order: "Descending" },
  { key: "Runtime,SortName", label: "Duration", order: "Ascending" },
  { key: "DatePlayed", label: "Last Watched", order: "Descending" },
  { key: "Random", label: "Shuffle", order: "Ascending" },
];

const FILTERS: Record<string, { label: string; q: Record<string, boolean> }> = {
  all: { label: "All", q: {} },
  unwatched: { label: "Unwatched", q: { IsPlayed: false } },
  watched: { label: "Watched", q: { IsPlayed: true } },
  favorites: { label: "Favorites", q: { IsFavorite: true } },
};

const PAGE = 120;

interface Props {
  title?: string;
  /** Fixed query (genre / person / favorites pages). */
  base?: Record<string, string | number | boolean>;
}

/** A poster grid with sort, filter and genre controls and infinite scrolling. */
export function LibraryGrid({ title, base }: Props) {
  const { viewId } = useParams();
  const [sp, setSp] = useSearchParams();
  const sortKey = sp.get("sort") ?? (base?.SortBy as string) ?? "SortName";
  const filter = sp.get("filter") ?? "all";
  const genre = sp.get("genre") ?? "";
  const sort = SORTS.find((s) => s.key === sortKey) ?? SORTS[0];

  const view = useAsync(() => (viewId ? api.item(viewId) : Promise.resolve(undefined)), [viewId]);
  const genres = useAsync(() => (viewId ? api.genres(viewId) : Promise.resolve([])), [viewId]);
  const name = title ?? view.data?.Name;
  useDocumentTitle(name);

  const isTv = view.data?.CollectionType === "tvshows";
  const query = {
    Recursive: true,
    IncludeItemTypes: viewId ? (isTv ? "Series" : "Movie") : "Movie,Series",
    ...(viewId ? { ParentId: viewId } : {}),
    ...base,
    ...FILTERS[filter]?.q,
    ...(genre ? { Genres: genre } : {}),
    SortBy: sort.key,
    SortOrder: sort.order,
  };
  const key = JSON.stringify(query);

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState<number>();
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (viewId && !view.data) return; // wait for the view (movies or series?)
    let alive = true;
    setItems([]);
    setTotal(undefined);
    setError(undefined);
    setBusy(true);
    api
      .items({ ...query, StartIndex: 0, Limit: PAGE })
      .then((r) => {
        if (!alive) return;
        setItems(r.Items);
        setTotal(r.TotalRecordCount);
      })
      .catch((e) => alive && setError(e))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, view.data]);

  const more = useCallback(() => {
    if (busy || total === undefined || items.length >= total || sort.key === "Random") return;
    setBusy(true);
    api
      .items({ ...query, StartIndex: items.length, Limit: PAGE })
      .then((r) => setItems((xs) => [...xs, ...r.Items]))
      .catch(setError)
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, total, items.length, key]);
  const sentinel = useInView<HTMLDivElement>(more, total !== undefined && items.length < total);

  const set = (k: string, v: string, def: string) => {
    const n = new URLSearchParams(sp);
    if (v === def) n.delete(k);
    else n.set(k, v);
    setSp(n, { replace: true });
  };

  const subtitle = (it: Item) => {
    if (sort.key.startsWith("CommunityRating") && it.CommunityRating) return `★ ${it.CommunityRating.toFixed(1)}`;
    if (it.Type === "Series" && it.RecursiveItemCount) return `${it.ProductionYear ?? ""} · ${it.RecursiveItemCount} episodes`;
    return undefined;
  };

  return (
    <div className="page library">
      <header className="page-header">
        <h1>
          {name}
          {total !== undefined && <span className="count">{total}</span>}
        </h1>
        <div className="toolbar">
          <div className="segmented">
            {Object.entries(FILTERS)
              .filter(([k]) => !(base?.IsFavorite && k === "favorites"))
              .map(([k, f]) => (
                <button key={k} className={filter === k ? "active" : ""} onClick={() => set("filter", k, "all")}>
                  {f.label}
                </button>
              ))}
          </div>
          {genres.data && genres.data.length > 0 && (
            <select value={genre} onChange={(e) => set("genre", e.target.value, "")} aria-label="Genre">
              <option value="">All Genres</option>
              {genres.data.map((g) => (
                <option key={g.Id} value={g.Name}>{g.Name}</option>
              ))}
            </select>
          )}
          <select value={sort.key} onChange={(e) => set("sort", e.target.value, (base?.SortBy as string) ?? "SortName")} aria-label="Sort">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </header>
      {error && <ErrorState error={error} />}
      <div className="grid">
        {items.map((it) => <PosterCard key={it.Id} it={it} sub={subtitle(it)} />)}
      </div>
      {total === 0 && !busy && <p className="muted center-state">Nothing here.</p>}
      {busy && <Spinner />}
      <div ref={sentinel} />
    </div>
  );
}

export function Library() {
  const { viewId } = useParams();
  return <LibraryGrid key={viewId} />;
}

export function Favorites() {
  return <LibraryGrid title="Favorites" base={{ IsFavorite: true }} />;
}

export function Genre() {
  const { name = "" } = useParams();
  return <LibraryGrid key={name} title={name} base={{ Genres: name }} />;
}
