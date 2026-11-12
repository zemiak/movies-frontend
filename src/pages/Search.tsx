import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, personImageUrl, type Item } from "../api";
import { LandscapeCard, PosterCard } from "../components/Card";
import { Img } from "../components/Img";
import { Spinner } from "../components/States";
import { useAsync, useDocumentTitle } from "../hooks";

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function Search() {
  const [sp] = useSearchParams();
  const q = useDebounced((sp.get("q") ?? "").trim(), 250);
  useDocumentTitle(q ? `Search: ${q}` : "Search");
  const res = useAsync(
    () => (q.length < 2 ? Promise.resolve(undefined) : Promise.all([api.search(q, 100), api.searchPeople(q, 24)])),
    [q],
  );
  const [items, people] = res.data ?? [[], []];
  const movies = items.filter((i) => i.Type === "Movie");
  const shows = items.filter((i) => i.Type === "Series");
  const episodes = items.filter((i) => i.Type === "Episode");

  return (
    <div className="page search">
      {q.length < 2 ? (
        <GenreCloud />
      ) : res.loading && !res.data ? (
        <Spinner />
      ) : !items.length && !people.length ? (
        <p className="muted center-state">No results for “{q}”.</p>
      ) : (
        <>
          <Group title="Movies" items={movies} />
          <Group title="TV Shows" items={shows} />
          {episodes.length > 0 && (
            <section>
              <h2>Episodes</h2>
              <div className="grid landscape-grid">
                {episodes.map((e) => <LandscapeCard key={e.Id} it={e} />)}
              </div>
            </section>
          )}
          {people.length > 0 && (
            <section>
              <h2>People</h2>
              <div className="grid people-grid">
                {people.map((p) => (
                  <Link key={p.Id} to={`/person/${p.Id}?name=${encodeURIComponent(p.Name)}`} className="card person-card">
                    <div className="art person"><Img src={personImageUrl(p)} alt={p.Name} fallback={p.Name} /></div>
                    <div className="card-title">{p.Name}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2>{title}</h2>
      <div className="grid">{items.map((it) => <PosterCard key={it.Id} it={it} />)}</div>
    </section>
  );
}

function GenreCloud() {
  const genres = useAsync(() => api.genres(), []);
  if (!genres.data) return <Spinner />;
  return (
    <section>
      <h2>Browse by Genre</h2>
      <div className="genre-cloud">
        {genres.data.map((g) => (
          <Link key={g.Id} to={`/genre/${encodeURIComponent(g.Name)}`}>{g.Name}</Link>
        ))}
      </div>
    </section>
  );
}

export function PersonPage() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const person = useAsync(() => api.item(id).catch(() => undefined), [id]);
  const name = person.data?.Name ?? sp.get("name") ?? "";
  useDocumentTitle(name);
  const items = useAsync(
    () =>
      api
        .items({ PersonIds: id, Recursive: true, IncludeItemTypes: "Movie,Series", SortBy: "ProductionYear,SortName", SortOrder: "Descending" })
        .then((r) => r.Items),
    [id],
  );
  const img = person.data ? personImageUrl(person.data, 400) : undefined;
  return (
    <div className="page person-page">
      <header className="person-header">
        <div className="art person large"><Img src={img} alt={name} fallback={name} /></div>
        <h1>{name}</h1>
      </header>
      {items.loading && !items.data ? (
        <Spinner />
      ) : (
        <div className="grid">{items.data?.map((it) => <PosterCard key={it.Id} it={it} />)}</div>
      )}
    </div>
  );
}
