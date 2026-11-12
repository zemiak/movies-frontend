import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  downloadUrl,
  episodeLabel,
  formatClock,
  infuseUrl,
  landscapeUrl,
  languageName,
  streamUrl,
  subtitleUrl,
  TICKS_PER_SECOND,
  type Item,
  type MediaSource,
  type MediaStream,
} from "../api";
import { Img } from "../components/Img";
import { ErrorState, Spinner } from "../components/States";
import { useAsync, useDocumentTitle } from "../hooks";

interface Loaded {
  item: Item;
  sources: MediaSource[];
  session: string;
  next?: Item;
}

async function load(id: string): Promise<Loaded> {
  const [item, info] = await Promise.all([api.item(id), api.playbackInfo(id)]);
  let next: Item | undefined;
  if (item.PartCount && item.PartCount > 1) {
    next = (await api.parts(id))[0];
  } else if (item.Type === "Episode" && item.SeriesId) {
    const eps = await api.episodes(item.SeriesId);
    const i = eps.findIndex((e) => e.Id === item.Id);
    next = i >= 0 ? eps.slice(i + 1).find((e) => (e.ParentIndexNumber ?? 0) > 0 || (item.ParentIndexNumber ?? 0) === 0) : undefined;
  }
  return { item, sources: info.MediaSources, session: info.PlaySessionId, next };
}

export function Player() {
  const { id = "" } = useParams();
  const { data, error, reload } = useAsync(() => load(id), [id]);
  useDocumentTitle(data?.item.Name);
  if (error) return <div className="player-page"><ErrorState error={error} retry={reload} /></div>;
  if (!data || data.item.Id !== id) return <div className="player-page"><Spinner /></div>;
  return <VideoPlayer key={id} {...data} />;
}

// ------------------------------------------------------------------ subtitles

interface SubTrack {
  key: string;
  label: string;
  stream?: MediaStream; // external file
  native?: TextTrack; // embedded track the browser exposes (Safari: mp4 mov_text)
}

/** SRT/VTT → a WebVTT blob URL. SRT files are often Windows-1250 (Czech/Slovak): try UTF-8 first. */
async function vttBlob(url: string): Promise<string> {
  const buf = await (await fetch(url)).arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1250").decode(buf);
  }
  text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("WEBVTT")) {
    text =
      "WEBVTT\n\n" +
      text
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
        .replace(/\{\\[^}]*\}/g, "") // ASS-style override tags some SRTs carry
        .replace(/<\/?font[^>]*>/gi, "");
  }
  return URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
}

// ------------------------------------------------------------------ player

interface AudioTrackLike { id: string; label: string; language: string; enabled: boolean }
type VideoWithAudio = HTMLVideoElement & { audioTracks?: { length: number; [i: number]: AudioTrackLike } };

function VideoPlayer({ item, sources, session, next }: Loaded) {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const video = useRef<VideoWithAudio>(null);
  const root = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<MediaSource>(() => sources.find((s) => s.Id === sp.get("source")) ?? sources[0]);
  const startAt = useRef(sp.get("start") !== null ? Number(sp.get("start")) : (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState((src.RunTimeTicks ?? item.RunTimeTicks ?? 0) / TICKS_PER_SECOND);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("volume") ?? 1));
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState<string>();
  const [showUi, setShowUi] = useState(true);
  const [menu, setMenu] = useState<"subs" | "audio" | "version" | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);

  // ---- subtitles
  const externalSubs = useMemo<SubTrack[]>(
    () =>
      src.MediaStreams.filter((s) => s.Type === "Subtitle" && s.IsExternal && ["srt", "subrip", "vtt", "webvtt"].includes(s.Codec)).map((s) => ({
        key: `ext-${s.Index}`,
        label: languageName(s.Language) + (s.IsForced ? " (Forced)" : ""),
        stream: s,
      })),
    [src],
  );
  const [nativeSubs, setNativeSubs] = useState<SubTrack[]>([]);
  const subs = [...externalSubs, ...nativeSubs];
  const [subKey, setSubKey] = useState<string>(() => localStorage.getItem("subLang") ?? "off");
  const [subUrl, setSubUrl] = useState<string>();
  const activeSub = subs.find((s) => s.key === subKey) ?? subs.find((s) => s.stream?.Language && `lang:${s.stream.Language}` === subKey);

  useEffect(() => {
    let url: string | undefined;
    let alive = true;
    setSubUrl(undefined);
    const u = activeSub?.stream && subtitleUrl(activeSub.stream);
    if (u) vttBlob(u).then((b) => (alive ? setSubUrl((url = b)) : URL.revokeObjectURL(b))).catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [activeSub?.stream]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    for (const t of Array.from(v.textTracks)) {
      const isOurs = t.label === "__ext__";
      t.mode = (isOurs && subUrl) || (activeSub?.native === t) ? "showing" : "disabled";
    }
  }, [subUrl, activeSub, nativeSubs]);

  const chooseSub = (s?: SubTrack) => {
    const key = s ? (s.stream?.Language ? `lang:${s.stream.Language}` : s.key) : "off";
    setSubKey(s ? s.key : "off");
    try { localStorage.setItem("subLang", key); } catch { /* ignore */ }
    setMenu(null);
  };

  // ---- audio tracks (Safari exposes them)
  const [audioTracks, setAudioTracks] = useState<AudioTrackLike[]>([]);
  const refreshAudio = () => {
    const at = video.current?.audioTracks;
    if (!at) return;
    const xs: AudioTrackLike[] = [];
    for (let i = 0; i < at.length; i++) xs.push(at[i]);
    setAudioTracks(xs);
  };
  const chooseAudio = (i: number) => {
    const at = video.current?.audioTracks;
    if (!at) return;
    for (let j = 0; j < at.length; j++) at[j].enabled = j === i;
    refreshAudio();
    setMenu(null);
  };

  // ---- progress reporting
  const state = useCallback(
    () => ({
      ItemId: item.Id,
      MediaSourceId: src.Id,
      PositionTicks: Math.round((video.current?.currentTime ?? 0) * TICKS_PER_SECOND),
      IsPaused: video.current?.paused ?? true,
      PlaySessionId: session,
    }),
    [item.Id, src.Id, session],
  );
  const started = useRef(false);
  const lastReport = useRef(0);
  useEffect(() => {
    const stop = () => {
      if (started.current) {
        started.current = false;
        api.reportStopped(state()).catch(() => {});
      }
    };
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [state]);

  // ---- video events
  const onTime = () => {
    const v = video.current!;
    setTime(v.currentTime);
    if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    const now = Date.now();
    if (started.current && now - lastReport.current > 10_000) {
      lastReport.current = now;
      api.reportProgress(state()).catch(() => {});
    }
  };
  const onLoaded = () => {
    const v = video.current!;
    if (isFinite(v.duration)) setDuration(v.duration);
    if (startAt.current > 0 && startAt.current < v.duration - 5) v.currentTime = startAt.current;
    startAt.current = 0;
    v.volume = volume;
    refreshAudio();
    const natives: SubTrack[] = [];
    for (const t of Array.from(v.textTracks)) {
      if (t.label !== "__ext__" && (t.kind === "subtitles" || t.kind === "captions"))
        natives.push({ key: `nat-${natives.length}`, label: `${languageName(t.language) || t.label} (Embedded)`, native: t });
    }
    setNativeSubs(natives);
    v.play().catch(() => setPlaying(false));
  };
  const onPlaying = () => {
    setPlaying(true);
    setWaiting(false);
    if (!started.current) {
      started.current = true;
      lastReport.current = Date.now();
      api.reportStart(state()).catch(() => {});
    }
  };
  const onPause = () => {
    setPlaying(false);
    if (started.current) api.reportProgress(state()).catch(() => {});
  };
  const onError = () => {
    const err = video.current?.error;
    setWaiting(false);
    setFailed(
      err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || err?.code === MediaError.MEDIA_ERR_DECODE
        ? "This browser can't play this file (the format or a codec isn't supported)."
        : `Playback failed${err?.message ? `: ${err.message}` : ""}.`,
    );
  };

  // ---- up next
  const [upNext, setUpNext] = useState<number | null>(null);
  const onEnded = () => {
    if (started.current) {
      started.current = false;
      api.reportStopped({ ...state(), PositionTicks: Math.round(duration * TICKS_PER_SECOND) }).catch(() => {});
    }
    if (next) setUpNext(10);
    else nav(-1);
  };
  useEffect(() => {
    if (upNext === null || !next) return;
    if (upNext <= 0) {
      nav(`/play/${next.Id}?start=0`, { replace: true });
      return;
    }
    const t = setTimeout(() => setUpNext((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [upNext, next, nav]);

  // ---- controls
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration || v.duration, t));
    setTime(v.currentTime);
  };
  const setVol = (x: number) => {
    const v = video.current;
    x = Math.max(0, Math.min(1, x));
    setVolume(x);
    setMuted(x === 0);
    if (v) {
      v.volume = x;
      v.muted = x === 0;
    }
    try { localStorage.setItem("volume", String(x)); } catch { /* ignore */ }
  };
  const toggleMute = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (root.current?.requestFullscreen) root.current.requestFullscreen().catch(() => {});
    else (video.current as unknown as { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
  };
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const pip = () => {
    const v = video.current;
    if (!v) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else v.requestPictureInPicture?.().catch(() => {});
  };

  // auto-hide
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const poke = useCallback(() => {
    setShowUi(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowUi(false), 3000);
  }, []);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  const uiVisible = showUi || !playing || menu !== null || !!failed;

  // keyboard
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const v = video.current;
      if (!v) return;
      let handled = true;
      switch (e.key) {
        case " ":
        case "k": toggle(); break;
        case "ArrowLeft": seek(v.currentTime - (e.shiftKey ? 30 : 10)); break;
        case "ArrowRight": seek(v.currentTime + (e.shiftKey ? 30 : 10)); break;
        case "j": seek(v.currentTime - 10); break;
        case "l": seek(v.currentTime + 10); break;
        case "ArrowUp": setVol(v.volume + 0.1); break;
        case "ArrowDown": setVol(v.volume - 0.1); break;
        case "f": toggleFs(); break;
        case "m": toggleMute(); break;
        case "c": chooseSub(activeSub ? undefined : subs[0]); break;
        case "Escape":
          if (menu) setMenu(null);
          else if (!document.fullscreenElement) nav(-1);
          break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        poke();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const changeSource = (s: MediaSource) => {
    startAt.current = video.current?.currentTime ?? 0;
    setMenu(null);
    if (s.Id === src.Id) return;
    setWaiting(true);
    setFailed(undefined);
    setSrc(s);
  };

  const title = item.Type === "Episode" ? item.SeriesName : item.Name;
  const subtitle = item.Type === "Episode" ? `${episodeLabel(item)} · ${item.Name}` : item.ProductionYear ? String(item.ProductionYear) : "";
  const pct = duration ? (time / duration) * 100 : 0;

  return (
    <div
      ref={root}
      className={`player-page ${uiVisible ? "" : "hide-ui"}`}
      onMouseMove={poke}
      onTouchStart={poke}
    >
      <video
        ref={video}
        src={streamUrl(item.Id, src)}
        playsInline
        autoPlay
        preload="auto"
        crossOrigin="anonymous"
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onPlaying={onPlaying}
        onPause={onPause}
        onWaiting={() => setWaiting(true)}
        onCanPlay={() => setWaiting(false)}
        onEnded={onEnded}
        onError={onError}
        onDurationChange={(e) => isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onClick={() => { toggle(); poke(); }}
        onDoubleClick={toggleFs}
      >
        {subUrl && <track kind="subtitles" label="__ext__" src={subUrl} default />}
      </video>

      {waiting && !failed && <div className="player-center"><div className="spinner" /></div>}

      {failed && (
        <div className="player-center player-error">
          <h2>Can't play here</h2>
          <p>{failed}</p>
          <div className="actions">
            <a className="btn btn-primary" href={infuseUrl(item.Id, src)}>Open in Infuse</a>
            <a className="btn" href={downloadUrl(item.Id, src.Id)}>Download</a>
            <button className="btn" onClick={() => nav(-1)}>Back</button>
          </div>
        </div>
      )}

      {upNext !== null && next && (
        <div className="up-next">
          <div className="art landscape"><Img src={landscapeUrl(next, 480)} alt={next.Name} /></div>
          <div>
            <div className="muted">Up next in {upNext}s</div>
            <div className="card-title">{next.Type === "Episode" ? `${episodeLabel(next)} · ${next.Name}` : next.Name}</div>
            <div className="actions">
              <button className="btn btn-primary" onClick={() => setUpNext(0)}>▶ Play now</button>
              <button className="btn" onClick={() => setUpNext(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="player-top">
        <button className="pbtn" onClick={() => nav(-1)} aria-label="Back">
          <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M15.4 4.6 14 3.2 5.2 12l8.8 8.8 1.4-1.4L8 12z" /></svg>
        </button>
        <div className="player-title">
          <Link to={`/item/${item.Id}`}>{title}</Link>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>

      <div className="player-bottom" onClick={(e) => e.stopPropagation()}>
        <div
          className="scrubber"
          onPointerDown={(e) => {
            const el = e.currentTarget;
            const at = (x: number) => {
              const r = el.getBoundingClientRect();
              return Math.max(0, Math.min(1, (x - r.left) / r.width)) * duration;
            };
            seek(at(e.clientX));
            el.setPointerCapture(e.pointerId);
            const move = (ev: PointerEvent) => seek(at(ev.clientX));
            const up = () => {
              el.removeEventListener("pointermove", move);
              el.removeEventListener("pointerup", up);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
          }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
            setHover({ x: f * 100, t: f * duration });
          }}
          onMouseLeave={() => setHover(null)}
        >
          <div className="track">
            <div className="buffered" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            <div className="played" style={{ width: `${pct}%` }} />
            <div className="knob" style={{ left: `${pct}%` }} />
          </div>
          {hover && <div className="hover-time" style={{ left: `${hover.x}%` }}>{formatClock(hover.t)}</div>}
        </div>
        <div className="controls">
          <span className="time">{formatClock(time)}</span>
          <div className="spacer" />
          <button className="pbtn" onClick={() => seek(time - 10)} aria-label="Back 10 seconds">
            <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z" /><text x="12" y="16.5" fontSize="6.5" textAnchor="middle" fill="currentColor" fontWeight="700">10</text></svg>
          </button>
          <button className="pbtn big" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="36" height="36"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="36" height="36"><path fill="currentColor" d="M7 4v16l13-8z" /></svg>
            )}
          </button>
          <button className="pbtn" onClick={() => seek(time + 10)} aria-label="Forward 10 seconds">
            <svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8Z" /><text x="12" y="16.5" fontSize="6.5" textAnchor="middle" fill="currentColor" fontWeight="700">10</text></svg>
          </button>
          <div className="spacer" />
          <span className="time">-{formatClock(duration - time)}</span>
        </div>
        <div className="controls secondary">
          <div className="volume">
            <button className="pbtn" onClick={toggleMute} aria-label="Mute">
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3Zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4L16.6 12Z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z" /></svg>
              )}
            </button>
            <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => setVol(Number(e.target.value))} aria-label="Volume" />
          </div>
          <div className="spacer" />
          {sources.length > 1 && (
            <button className={`pill ${menu === "version" ? "on" : ""}`} onClick={() => setMenu(menu === "version" ? null : "version")}>{src.Name}</button>
          )}
          {audioTracks.length > 1 && (
            <button className={`pill ${menu === "audio" ? "on" : ""}`} onClick={() => setMenu(menu === "audio" ? null : "audio")}>Audio</button>
          )}
          <button className={`pill ${menu === "subs" ? "on" : ""} ${activeSub ? "active" : ""}`} onClick={() => setMenu(menu === "subs" ? null : "subs")}>
            Subtitles{activeSub ? `: ${activeSub.label}` : ""}
          </button>
          {"pictureInPictureEnabled" in document && (
            <button className="pbtn" onClick={pip} aria-label="Picture in picture">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 11h-8v6h8v-6Zm4 8V5a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h18a2 2 0 0 0 2-2Zm-2 0H3V5h18v14Z" /></svg>
            </button>
          )}
          <button className="pbtn" onClick={toggleFs} aria-label="Fullscreen">
            {fullscreen ? (
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M5 16h3v3h2v-5H5v2Zm3-8H5v2h5V5H8v3Zm6 11h2v-3h3v-2h-5v5Zm2-11V5h-2v5h5V8h-3Z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3Zm-2-4h2V7h3V5H5v5Zm12 7h-3v2h5v-5h-2v3ZM14 5v2h3v3h2V5h-5Z" /></svg>
            )}
          </button>
        </div>

        {menu && (
          <div className="player-menu">
            {menu === "subs" && (
              <>
                <h3>Subtitles</h3>
                <button className={!activeSub ? "sel" : ""} onClick={() => chooseSub(undefined)}>Off</button>
                {subs.map((s) => (
                  <button key={s.key} className={activeSub?.key === s.key ? "sel" : ""} onClick={() => chooseSub(s)}>{s.label}</button>
                ))}
                {src.MediaStreams.some((s) => s.Type === "Subtitle" && !s.IsExternal) && nativeSubs.length === 0 && (
                  <p className="muted small">Embedded subtitles aren't available in the browser.</p>
                )}
              </>
            )}
            {menu === "audio" && (
              <>
                <h3>Audio</h3>
                {audioTracks.map((a, i) => (
                  <button key={a.id || i} className={a.enabled ? "sel" : ""} onClick={() => chooseAudio(i)}>
                    {a.label || languageName(a.language)}
                  </button>
                ))}
              </>
            )}
            {menu === "version" && (
              <>
                <h3>Version</h3>
                {sources.map((s) => (
                  <button key={s.Id} className={s.Id === src.Id ? "sel" : ""} onClick={() => changeSource(s)}>{s.Name}</button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
