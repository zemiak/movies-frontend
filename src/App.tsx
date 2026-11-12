import { Route, Routes, useLocation } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { Detail } from "./pages/Detail";
import { Home } from "./pages/Home";
import { Favorites, Genre, Library } from "./pages/Library";
import { Player } from "./pages/Player";
import { PersonPage, Search } from "./pages/Search";

export function App() {
  const loc = useLocation();
  const playing = loc.pathname.startsWith("/play/");
  return (
    <>
      {!playing && <NavBar />}
      <main className={playing ? "" : "with-nav"}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/library/:viewId" element={<Library />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/genre/:name" element={<Genre />} />
          <Route path="/item/:id" element={<Detail />} />
          <Route path="/person/:id" element={<PersonPage />} />
          <Route path="/search" element={<Search />} />
          <Route path="/play/:id" element={<Player />} />
          <Route path="*" element={<p className="center-state muted">Not found.</p>} />
        </Routes>
      </main>
    </>
  );
}
