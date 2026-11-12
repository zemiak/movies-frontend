import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

/** A horizontally scrolling row with a title and arrow buttons (Infuse's home "shelves"). */
export function Shelf({ title, more, children }: { title: string; more?: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };
  return (
    <section className="shelf">
      <header>
        <h2>{more ? <Link to={more}>{title} <span className="chev">›</span></Link> : title}</h2>
      </header>
      <div className="shelf-wrap">
        <button className="shelf-arrow left" onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>
        <div className="shelf-row" ref={row}>
          {children}
        </div>
        <button className="shelf-arrow right" onClick={() => scroll(1)} aria-label="Scroll right">›</button>
      </div>
    </section>
  );
}
