import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, backdropUrl, formatRuntime, logoUrl, type Item } from "../api";
import { LandscapeCard, PosterCard } from "../components/Card";
import { Shelf } from "../components/Shelf";
import { ErrorState, Spinner } from "../components/States";
import { useAsync, useDocumentTitle } from "../hooks";

interface HomeData {
  views: Item[];
  resume: Item[];
  nextUp: Item[];
  latest: { view: Item; items: Item[] }[];
  featured: Item[];
  favorites: Item[];
  unwatched: Item[];
}

async function loadHome(): Promise<HomeData> {
  const views = await api.views();
  const movieView = views.find((v) => v.CollectionType === "movies");
  const [resume, nextUp, latest, featured, favorites, unwatched] = await Promise.all([
    api.resume(20),
    api.nextUp(20),
    Promise.all(views.map(async (view) => ({ view, items: await api.latest(view.Id, 24) }))),
    // The hero: random, well-rated films with artwork.
    api
      .items({
        Recursive: true,
        IncludeItemTypes: "Movie,Series",
        SortBy: "Random",
        Limit: 40,
        MinCommunityRating: 6.5,
      })
      .then((r) => r.Items.filter((i) => i.BackdropImageTags.length && i.ImageTags.Logo).slice(0, 6)),
    api
      .items({ Recursive: true, IncludeItemTypes: "Movie,Series", IsFavorite: true, SortBy: "SortName", Limit: 40 })
      .then((r) => r.Items),
    movieView
      ? api
          .items({ ParentId: movieView.Id, Recursive: true, IncludeItemTypes: "Movie", IsPlayed: false, SortBy: "Random", Limit: 24 })
          .then((r) => r.Items)
      : Promise.resolve([]),
  ]);
  return { views, resume, nextUp, latest, featured, favorites, unwatched };
}

function Hero({ items }: { items: Item[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 9000);
    return () => clearInterval(t);
  }, [items.length]);
  if (!items.length) return <div className="hero hero-empty" />;
  const it = items[i];
  const logo = logoUrl(it, 700);
  return (
    <section className="hero">
      {items.map((x, n) => (
        <div
          key={x.Id}
          className={`hero-bg ${n === i ? "active" : ""}`}
          style={{ backgroundImage: `url("${backdropUrl(x)}")` }}
        />
      ))}
      <div className="hero-shade" />
      <div className="hero-content" key={it.Id}>
        {logo ? <img className="hero-logo" src={logo} alt={it.Name} /> : <h1>{it.Name}</h1>}
        <div className="meta-line">
          {it.ProductionYear && <span>{it.ProductionYear}</span>}
          {it.Genres?.slice(0, 3).map((g) => <span key={g}>{g}</span>)}
          {it.RunTimeTicks ? <span>{formatRuntime(it.RunTimeTicks)}</span> : null}
          {it.CommunityRating ? <span className="rating">★ {it.CommunityRating.toFixed(1)}</span> : null}
        </div>
        <p className="hero-overview">{it.Overview}</p>
        <div className="actions">
          {it.Type === "Movie" && (
            <Link className="btn btn-primary" to={`/play/${it.Id}`}>▶ Play</Link>
          )}
          <Link className="btn" to={`/item/${it.Id}`}>More info</Link>
        </div>
      </div>
      <div className="hero-dots">
        {items.map((x, n) => (
          <button key={x.Id} className={n === i ? "active" : ""} onClick={() => setI(n)} aria-label={x.Name} />
        ))}
      </div>
    </section>
  );
}

export function Home() {
  useDocumentTitle();
  const { data, error, loading, reload } = useAsync(loadHome, []);
  if (error && !data) return <ErrorState error={error} retry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  return (
    <div className="home">
      <Hero items={data.featured} />
      <div className="shelves">
        {data.resume.length > 0 && (
          <Shelf title="Continue Watching">
            {data.resume.map((it) => <LandscapeCard key={it.Id} it={it} onPlay />)}
          </Shelf>
        )}
        {data.nextUp.length > 0 && (
          <Shelf title="Up Next">
            {data.nextUp.map((it) => <LandscapeCard key={it.Id} it={it} onPlay />)}
          </Shelf>
        )}
        {data.latest.map(({ view, items }) =>
          items.length ? (
            <Shelf key={view.Id} title={`Recently Added ${view.Name}`} more={`/library/${view.Id}?sort=DateCreated`}>
              {items.map((it) => <PosterCard key={it.Id} it={it} />)}
            </Shelf>
          ) : null,
        )}
        {data.favorites.length > 0 && (
          <Shelf title="Favorites" more="/favorites">
            {data.favorites.map((it) => <PosterCard key={it.Id} it={it} />)}
          </Shelf>
        )}
        {data.unwatched.length > 0 && (
          <Shelf title="Something You Haven't Seen">
            {data.unwatched.map((it) => <PosterCard key={it.Id} it={it} />)}
          </Shelf>
        )}
      </div>
    </div>
  );
}
