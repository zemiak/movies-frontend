import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, type Item } from "../api";
import { useAsync } from "../hooks";

export function NavBar() {
  const { data: views } = useAsync<Item[]>(() => api.views(), []);
  const [scrolled, setScrolled] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState(() => new URLSearchParams(loc.search).get("q") ?? "");

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 10);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (!loc.pathname.startsWith("/search")) setQ("");
  }, [loc.pathname]);

  const onSearch = (v: string) => {
    setQ(v);
    const to = v.trim() ? `/search?q=${encodeURIComponent(v)}` : "/search";
    nav(to, { replace: loc.pathname.startsWith("/search") });
  };

  return (
    <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
      <NavLink to="/" className="brand" aria-label="Home">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm6 4.5v7l6-3.5-6-3.5Z" />
        </svg>
        <span>Movies</span>
      </NavLink>
      <div className="nav-links">
        <NavLink to="/" end>Home</NavLink>
        {views?.map((v) => (
          <NavLink key={v.Id} to={`/library/${v.Id}`}>{v.Name}</NavLink>
        ))}
        <NavLink to="/favorites">Favorites</NavLink>
      </div>
      <label className="search-box">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.39A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z" />
        </svg>
        <input
          type="search"
          placeholder="Search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          onFocus={() => !loc.pathname.startsWith("/search") && q === "" && nav("/search")}
        />
      </label>
    </nav>
  );
}
