import { useState } from "react";

/** Lazy image that fades in; shows the fallback text on a gradient when missing or broken. */
export function Img({ src, alt, fallback, className }: { src?: string; alt: string; fallback?: string; className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  if (!src || state === "error") {
    return (
      <div className={`img-fallback ${className ?? ""}`}>
        <span>{fallback ?? alt}</span>
      </div>
    );
  }
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${className ?? ""} ${state === "ok" ? "loaded" : ""}`}
      onLoad={() => setState("ok")}
      onError={() => setState("error")}
    />
  );
}
