"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildEmbedSrc, parseStreamUrl } from "../lib/parseStream";

const MAX = 9;
const LS_KEY = "streamgrid.v1";
const LS_KEY_LEGACY = "multistream.v1";
/* Demo: 24/7 animal streams, one per platform (verified at build time;
 * TikTok is a cat VOD — TikTok offers no live embed). */
const DEMO = [
  "https://www.youtube.com/watch?v=T4XZmMPQ9Kw", // Kitten Academy 24/7
  "https://www.twitch.tv/alveussanctuary", // Alveus sanctuary 24/7 cams
  "https://kick.com/untamedlivefrombackyard", // 24/7 backyard wildlife
  "https://rumble.com/v78sqdq-mavis-farmacy-247-holler-radio-live-appalachian-farm-cam-chickens-ducks-and.html", // 24/7 farm cam
  "https://www.tiktok.com/@funnycats0ftiktok/video/7345101300750748970", // cat VOD
];

let uidCounter = 0;
function makeUid() {
  uidCounter += 1;
  return `${Date.now().toString(36)}-${uidCounter}-${Math.floor(Math.random() * 1e4)}`;
}

function isTwitchApi(s) {
  return s.platform === "twitch" && s.data?.kind !== "clip";
}
function isYouTube(s) {
  return s.platform === "youtube";
}
function isVideo(s) {
  return s.platform === "hls" || s.platform === "mp4";
}
function isFullAudio(s) {
  return s.audio === "full" && !(s.platform === "twitch" && s.data?.kind === "clip");
}

export default function StreamGrid() {
  const [streams, setStreams] = useState([]);
  const [focusUid, setFocusUid] = useState(null);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [input, setInput] = useState("");
  const [log, setLog] = useState({
    text: "READY. PASTE A STREAM URL ABOVE. ALL STREAMS START MUTED (BROWSER AUTOPLAY POLICY) — FOCUS A TILE OR USE THE MIXER TO UNMUTE.",
    isErr: false,
  });
  const [toasts, setToasts] = useState([]);
  const [parents, setParents] = useState(["localhost", "127.0.0.1"]);

  const streamsRef = useRef([]);
  const focusRef = useRef(null);
  const mixerRef = useRef(false);
  const ytPlayers = useRef(new Map());
  const twPlayers = useRef(new Map());
  const videoEls = useRef(new Map());
  const bodyEls = useRef(new Map());
  const hlsObjs = useRef(new Map());
  const preFocus = useRef(new Map());
  const hlsLib = useRef(null);
  const ytReady = useRef(false);
  const loaded = useRef(false);

  streamsRef.current = streams;
  focusRef.current = focusUid;
  mixerRef.current = mixerOpen;

  /* ── toast helper ─────────────────────────────────────────── */
  const pushToast = useCallback((title, msg, ok = false) => {
    const id = makeUid();
    setToasts((t) => [...t, { id, title, msg, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const say = useCallback((text, isErr = false) => {
    setLog({ text, isErr });
  }, []);

  /* ── mount: parents, saved feeds, external scripts ────────── */
  useEffect(() => {
    const host = window.location.hostname;
    if (host) setParents([host, "localhost", "127.0.0.1"]);

    try {
      const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LS_KEY_LEGACY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) {
          setStreams(
            saved.slice(0, MAX).map((s) => ({
              ...s,
              uid: typeof s.uid === "string" ? s.uid : makeUid(),
              muted: true, // autoplay policy: always restore muted
              volume: typeof s.volume === "number" ? s.volume : 70,
            }))
          );
          say(`RESTORED ${Math.min(saved.length, MAX)} SAVED FEED(S) — ALL MUTED. PRESS 1–9 TO FOCUS + SOLO.`);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }

    // hls.js (lazy, client-only)
    import("hls.js")
      .then((m) => {
        hlsLib.current = m.default || m;
      })
      .catch(() => {});

    // YouTube IFrame API
    const onYT = () => {
      ytReady.current = true;
      for (const s of streamsRef.current) if (isYouTube(s)) ensureYT(s);
    };
    if (window.YT && window.YT.Player) {
      ytReady.current = true;
    } else {
      window.onYouTubeIframeAPIReady = onYT;
      const sc = document.createElement("script");
      sc.src = "https://www.youtube.com/iframe_api";
      sc.async = true;
      sc.id = "yt-iframe-api";
      if (!document.getElementById("yt-iframe-api")) document.head.appendChild(sc);
    }

    // Twitch Embed API
    if (!window.Twitch) {
      const sc = document.createElement("script");
      sc.src = "https://player.twitch.tv/js/embed/v1.js";
      sc.async = true;
      sc.id = "twitch-embed-api";
      sc.onload = () => {
        for (const s of streamsRef.current) if (isTwitchApi(s)) ensureTW(s);
      };
      if (!document.getElementById("twitch-embed-api")) document.head.appendChild(sc);
    }

    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── persist feeds ────────────────────────────────────────── */
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify(
          streams.map((s) => ({
            uid: s.uid,
            platform: s.platform,
            label: s.label,
            title: s.title,
            watchUrl: s.watchUrl,
            audio: s.audio,
            data: s.data,
            volume: s.volume,
          }))
        )
      );
    } catch {
      /* storage full / blocked — non-fatal */
    }
  }, [streams]);

  /* ── player constructors ──────────────────────────────────── */
  function currentOf(uid) {
    return streamsRef.current.find((s) => s.uid === uid);
  }

  function ensureYT(s) {
    if (!ytReady.current || !window.YT?.Player) return;
    if (ytPlayers.current.has(s.uid)) return;
    const el = document.getElementById(`yt-${s.uid}`);
    if (!el) return;
    try {
      const p = new window.YT.Player(`yt-${s.uid}`, {
        events: {
          onReady: (e) => {
            const cur = currentOf(s.uid);
            try {
              if (cur?.muted) e.target.mute();
              else {
                e.target.unMute();
                e.target.setVolume(cur?.volume ?? 70);
              }
            } catch {}
          },
        },
      });
      ytPlayers.current.set(s.uid, p);
    } catch {}
  }

  function ensureTW(s) {
    if (!window.Twitch?.Player) return;
    if (twPlayers.current.has(s.uid)) return;
    const el = document.getElementById(`tw-${s.uid}`);
    if (!el) return;
    try {
      const opts = {
        width: "100%",
        height: "100%",
        autoplay: true,
        muted: true,
        parent: parents.length ? parents : ["localhost"],
      };
      if (s.data.kind === "video") opts.video = s.data.id;
      else opts.channel = s.data.channel;
      const p = new window.Twitch.Player(`tw-${s.uid}`, opts);
      try {
        p.setVolume((currentOf(s.uid)?.volume ?? 70) / 100);
      } catch {}
      twPlayers.current.set(s.uid, p);
    } catch {}
  }

  function setupVideo(s) {
    const el = videoEls.current.get(s.uid);
    if (!el) return;
    try {
      el.muted = s.muted;
      el.volume = (s.volume ?? 70) / 100;
      if (s.platform === "mp4" && el.getAttribute("src") !== s.data.src) {
        el.src = s.data.src;
      }
      if (s.platform === "hls" && !el.dataset.hlsBound) {
        el.dataset.hlsBound = "1";
        if (el.canPlayType("application/vnd.apple.mpegurl")) {
          el.src = s.data.src;
        } else if (hlsLib.current?.isSupported?.()) {
          const h = new hlsLib.current();
          h.loadSource(s.data.src);
          h.attachMedia(el);
          hlsObjs.current.set(s.uid, h);
        } else {
          // hls.js still loading — retry shortly
          setTimeout(() => {
            delete el.dataset.hlsBound;
            const cur = currentOf(s.uid);
            if (cur) setupVideo(cur);
          }, 1200);
          return;
        }
      }
      el.play().catch(() => {});
    } catch {}
  }

  /* keep players in sync with stream list (never rebuilds tiles) */
  useEffect(() => {
    for (const s of streams) {
      if (isYouTube(s)) ensureYT(s);
      else if (isTwitchApi(s)) ensureTW(s);
      else if (isVideo(s)) setupVideo(s);
    }
    // cleanup players of removed tiles
    const alive = new Set(streams.map((s) => s.uid));
    for (const [uid, p] of ytPlayers.current) {
      if (!alive.has(uid)) {
        try {
          p.destroy?.();
        } catch {}
        ytPlayers.current.delete(uid);
      }
    }
    for (const [uid] of twPlayers.current) {
      if (!alive.has(uid)) twPlayers.current.delete(uid);
    }
    for (const [uid, h] of hlsObjs.current) {
      if (!alive.has(uid)) {
        try {
          h.destroy();
        } catch {}
        hlsObjs.current.delete(uid);
      }
    }
    for (const [uid] of videoEls.current) {
      if (!alive.has(uid)) videoEls.current.delete(uid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, parents]);

  /* ── low-level audio ops (no reload for API players) ──────── */
  function playerMute(s, muted) {
    try {
      if (isYouTube(s)) {
        const p = ytPlayers.current.get(s.uid);
        if (p?.mute) (muted ? p.mute() : p.unMute());
      } else if (isTwitchApi(s)) {
        twPlayers.current.get(s.uid)?.setMuted(muted);
      } else if (isVideo(s)) {
        const el = videoEls.current.get(s.uid);
        if (el) {
          el.muted = muted;
          if (!muted) el.play().catch(() => {});
        }
      }
      // mute-only platforms: iframe src is derived from s.muted → React
      // updates that tile's src alone (targeted reload, others untouched)
    } catch {}
  }

  function playerVolume(s, vol) {
    try {
      if (isYouTube(s)) ytPlayers.current.get(s.uid)?.setVolume?.(vol);
      else if (isTwitchApi(s)) twPlayers.current.get(s.uid)?.setVolume(vol / 100);
      else if (isVideo(s)) {
        const el = videoEls.current.get(s.uid);
        if (el) el.volume = vol / 100;
      }
    } catch {}
  }

  /* ── actions ──────────────────────────────────────────────── */
  const addStream = useCallback(
    (raw) => {
      const value = String(raw ?? "").trim();
      if (!value) {
        say("EMPTY LINK — PASTE A STREAM URL FIRST.", true);
        return;
      }
      const list = streamsRef.current;
      if (list.length >= MAX) {
        say(`GRID FULL — ${MAX} FEEDS MAX. REMOVE ONE FIRST.`, true);
        pushToast("GRID FULL", `Maximum ${MAX} feeds. Remove a tile first.`);
        return;
      }
      const { stream, error, hint } = parseStreamUrl(value);
      if (error || !stream) {
        say(`${error} ${hint || ""}`.trim(), true);
        pushToast("LINK REJECTED — NOT ADDED", hint ? `${error} ${hint}` : error);
        return;
      }
      const dupe = list.some(
        (s) =>
          s.watchUrl === stream.watchUrl ||
          (s.platform === stream.platform && JSON.stringify(s.data) === JSON.stringify(stream.data))
      );
      if (dupe) {
        say("DUPLICATE FEED — ALREADY ON THE GRID.", true);
        return;
      }
      const entry = { ...stream, uid: makeUid(), muted: true, volume: 70 };
      setStreams((prev) => [...prev, entry]);
      setInput("");
      const n = list.length + 1;
      say(`FEED ${String(n).padStart(2, "0")} LOCKED: ${stream.label} — ${stream.title}. MUTED BY DEFAULT. PRESS ${n} TO FOCUS + SOLO.`);
    },
    [pushToast, say]
  );

  const removeStream = useCallback(
    (uid) => {
      const s = currentOf(uid);
      try {
        videoEls.current.get(uid)?.pause?.();
      } catch {}
      setStreams((prev) => prev.filter((x) => x.uid !== uid));
      if (focusRef.current === uid) {
        setFocusUid(null);
        say("FOCUSED FEED REMOVED — BACK TO GRID.");
      } else if (s) {
        say(`FEED REMOVED: ${s.label} — ${s.title}.`);
      }
    },
    [say]
  );

  const setMuted = useCallback((uid, muted) => {
    const s = currentOf(uid);
    setStreams((prev) => prev.map((x) => (x.uid === uid ? { ...x, muted } : x)));
    if (s) playerMute({ ...s, muted }, muted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVolume = useCallback((uid, vol) => {
    const v = Math.max(0, Math.min(100, Math.round(vol)));
    const s = currentOf(uid);
    setStreams((prev) => prev.map((x) => (x.uid === uid ? { ...x, volume: v } : x)));
    if (s) playerVolume(s, v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusFeed = useCallback(
    (uid) => {
      const list = streamsRef.current;
      if (!list.some((s) => s.uid === uid)) return;
      preFocus.current = new Map(list.map((s) => [s.uid, s.muted]));
      setFocusUid(uid);
      setStreams((prev) =>
        prev.map((x) => {
          const muted = x.uid !== uid;
          playerMute(x, muted);
          if (!muted) {
            try {
              if (isYouTube(x)) ytPlayers.current.get(x.uid)?.setVolume?.(x.volume ?? 70);
              else if (isTwitchApi(x)) twPlayers.current.get(x.uid)?.setVolume((x.volume ?? 70) / 100);
            } catch {}
          }
          return { ...x, muted };
        })
      );
      const idx = list.findIndex((s) => s.uid === uid);
      const t = list[idx];
      say(`FOCUSED ${String(idx + 1).padStart(2, "0")}: ${t.label} — ${t.title}. AUDIO SOLOED. PRESS 0 FOR GRID.`);
    },
    [say]
  );

  const toGrid = useCallback(
    (restore = true) => {
      if (focusRef.current === null) return;
      setFocusUid(null);
      if (restore && preFocus.current.size) {
        const snap = preFocus.current;
        setStreams((prev) =>
          prev.map((x) => {
            const muted = snap.has(x.uid) ? snap.get(x.uid) : true;
            playerMute(x, muted);
            return { ...x, muted };
          })
        );
        say("GRID MODE — PREVIOUS AUDIO STATE RESTORED.");
      } else {
        say("GRID MODE.");
      }
      preFocus.current = new Map();
    },
    [say]
  );

  const muteAll = useCallback(() => {
    setStreams((prev) =>
      prev.map((x) => {
        playerMute(x, true);
        return { ...x, muted: true };
      })
    );
    say("ALL FEEDS MUTED. [M]");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say]);

  const unmuteAll = useCallback(() => {
    setStreams((prev) =>
      prev.map((x) => {
        playerMute({ ...x, muted: false }, false);
        return { ...x, muted: false };
      })
    );
    say("ALL FEEDS UNMUTED AT SAVED LEVELS.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say]);

  const clearAll = useCallback(() => {
    if (!streamsRef.current.length) return;
    if (!window.confirm("REMOVE ALL FEEDS?")) return;
    setStreams([]);
    setFocusUid(null);
    preFocus.current = new Map();
    say("GRID CLEARED. PASTE A URL TO START AGAIN.");
  }, [say]);

  const loadDemo = useCallback(() => {
    let added = 0;
    for (const u of DEMO) {
      if (streamsRef.current.length >= MAX) break;
      const { stream, error } = parseStreamUrl(u);
      if (!stream || error) continue;
      const dupe = streamsRef.current.some(
        (s) => s.watchUrl === stream.watchUrl || (s.platform === stream.platform && JSON.stringify(s.data) === JSON.stringify(stream.data))
      );
      if (dupe) continue;
      const entry = { ...stream, uid: makeUid(), muted: true, volume: 70 };
      streamsRef.current = [...streamsRef.current, entry];
      added += 1;
    }
    setStreams([...streamsRef.current]);
    say(
      added
        ? `ANIMAL DEMO: ${added} FEED(S) — KITTENS, SANCTUARY, BACKYARD WILDLIFE, FARM CAM + CAT VOD. PRESS 1–${added} TO FOCUS + SOLO, A FOR MIXER.`
        : "DEMO FEEDS ALREADY ON GRID."
    );
  }, [say]);

  /* ── keyboard ─────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;

      if (k === "Escape") {
        if (helpOpen) setHelpOpen(false);
        else if (mixerRef.current) setMixerOpen(false);
        else if (focusRef.current !== null) toGrid(true);
        return;
      }
      if (typing) {
        if (k === "Enter" && t.id === "urlInput") addStream(t.value);
        return;
      }
      if (k === "?" ) {
        setHelpOpen((v) => !v);
        return;
      }
      const lower = k.toLowerCase();
      if (lower === "a") {
        setMixerOpen((v) => !v);
        return;
      }
      if (lower === "m") {
        muteAll();
        return;
      }
      if (k >= "0" && k <= "9") {
        const list = streamsRef.current;
        if (!list.length) return;
        if (k === "0") {
          toGrid(true);
          return;
        }
        const idx = parseInt(k, 10) - 1;
        if (idx < list.length) {
          if (focusRef.current === list[idx].uid) toGrid(true);
          else focusFeed(list[idx].uid);
        }
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addStream, focusFeed, toGrid, muteAll, helpOpen]);

  /* ── derived ──────────────────────────────────────────────── */
  const n = streams.length;
  const colsClass = n <= 1 ? "cols-1" : n === 2 ? "cols-2" : n === 3 ? "cols-3" : "cols-4";
  const liveCount = streams.filter((s) => !s.muted).length;
  const audioSummary =
    n === 0 ? "AUDIO: —" : liveCount === 0 ? "AUDIO: ALL MUTED" : focusUid ? "AUDIO: SOLO" : `AUDIO: ${liveCount}/${n} LIVE`;

  function fullscreenTile(uid) {
    const el = bodyEls.current.get(uid);
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else el?.requestFullscreen?.();
    } catch {}
  }

  function renderBody(s) {
    if (isVideo(s)) {
      return (
        <video
          ref={(el) => {
            if (el) videoEls.current.set(s.uid, el);
            else videoEls.current.delete(s.uid);
          }}
          controls
          playsInline
          autoPlay
          muted
          preload="auto"
          title={`${s.label} — ${s.title}`}
        />
      );
    }
    if (isTwitchApi(s)) {
      return <div id={`tw-${s.uid}`} className="tw-slot" title={`${s.label} — ${s.title}`} />;
    }
    if (isYouTube(s)) {
      // src stays mute=1 forever — unmute happens through the YT API, so no reload
      return (
        <iframe
          id={`yt-${s.uid}`}
          src={buildEmbedSrc(s, true, parents)}
          title={`${s.label} — ${s.title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      );
    }
    return (
      <iframe
        src={buildEmbedSrc(s, s.muted, parents)}
        title={`${s.label} — ${s.title}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    );
  }

  return (
    <div id="app">
      <h1
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        StreamGrid — watch Twitch, YouTube, Kick and more streams together
      </h1>

      {/* ══ TOP COMMAND BAR ══ */}
      <header id="topbar">
        <div className="brand">
          <img src="/logo.svg" alt="StreamGrid" height="40" width="212" />
          <div className="brand-text" style={{ display: "none" }}>
            <div className="brand-title">
              STREAMGRID<span className="dim">//UNIT-01</span>
            </div>
            <div className="brand-sub">MULTI-SOURCE SURVEILLANCE GRID</div>
          </div>
        </div>

        <div className="add-cluster">
          <div className="input-wrap">
            <span className="input-prefix">&gt;</span>
            <input
              id="urlInput"
              type="url"
              spellCheck={false}
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="PASTE STREAM URL — twitch / youtube / kick / rumble / vimeo / fb / tiktok / trovo / dlive / soop / nimo / hls / mp4 … + ENTER"
              aria-label="Paste a stream URL"
            />
            <span className="input-count">{n}/{MAX}</span>
          </div>
          <button className="btn btn-primary" onClick={() => addStream(input)} title="Add stream (Enter)">
            [+] ADD
          </button>
          <button className="btn" onClick={loadDemo} title="Load 5 live animal demo streams (one per platform)">
            DEMO
          </button>
        </div>

        <div className="top-actions">
          <button className="btn" onClick={() => setMixerOpen((v) => !v)} title="Audio mixer (A)">
            [A] MIXER <span id="mixerDot" className={`dot${mixerOpen ? "" : " hidden"}`} />
          </button>
          <button className="btn" onClick={muteAll} title="Mute all (M)">
            [M] MUTE-ALL
          </button>
          <button className="btn" onClick={() => toGrid(true)} title="Grid view (0)">
            [0] GRID
          </button>
          <button className="btn" onClick={() => setHelpOpen(true)} title="Manual (?)">
            ?
          </button>
          <button className="btn btn-danger" onClick={clearAll} title="Remove all streams">
            CLR
          </button>
        </div>
      </header>

      {/* ══ STRIP ══ */}
      <div id="strip">
        <div className="strip-group">
          <span className="strip-label">SIGNAL SOURCES:</span>
          {["TWITCH", "YOUTUBE", "KICK", "RUMBLE", "VIMEO", "DAILYMOTION", "FACEBOOK", "TIKTOK-VOD", "TROVO", "DLIVE", "SOOP", "NIMO", "ODYSEE", "STEAM", "HLS", "MP4"].map(
            (p) => (
              <span key={p} className={`plat${["TWITCH", "YOUTUBE", "HLS", "MP4"].includes(p) ? " full" : ""}`}>
                {p}
              </span>
            )
          )}
        </div>
        <div className="strip-group keys">
          <span className="strip-label">KEYS:</span>
          <span className="key"><b>0</b>GRID</span>
          <span className="key"><b>1–9</b>FOCUS+SOLO</span>
          <span className="key"><b>A</b>MIXER</span>
          <span className="key"><b>M</b>MUTE-ALL</span>
          <span className="key"><b>ESC</b>EXIT</span>
        </div>
      </div>

      {/* ══ LOG ══ */}
      <div className="logline">
        <span className={`log-tag${log.isErr ? " err" : ""}`}>{log.isErr ? "ERR" : "SYS"}</span>
        <span id="logText">{log.text}</span>
      </div>

      {/* ══ GRID — tiles stay mounted, focus is CSS-only (no reload) ══ */}
      <main id="gridWrap" className={n ? "has-feeds" : ""}>
        <div id="grid" className={`${colsClass}${focusUid ? " focusing" : ""}`}>
          {streams.map((s, i) => {
            const focused = s.uid === focusUid;
            const hidden = focusUid && !focused;
            return (
              <section
                key={s.uid}
                className={`tile${focused ? " focused" : ""}${hidden ? " hidden-tile" : ""}`}
                aria-label={`Feed ${i + 1}: ${s.label} ${s.title}`}
              >
                <div className="tile-head">
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="tplat">{s.label}</span>
                  <span className="tname">{s.title}</span>
                  <span className={`tsig${s.muted ? "" : " live"}`}>{s.muted ? "MUTED" : "● AUDIO"}</span>
                  <div className="tile-btns">
                    <button
                      className={`tbtn${s.muted ? "" : " on"}`}
                      onClick={() => setMuted(s.uid, !s.muted)}
                      title={s.muted ? "Unmute" : "Mute"}
                    >
                      {s.muted ? "MUTE" : "LIVE"}
                    </button>
                    <button
                      className={`tbtn${focused ? " on" : ""}`}
                      onClick={() => (focused ? toGrid(true) : focusFeed(s.uid))}
                      title={focused ? "Back to grid (0)" : `Focus (key ${i + 1})`}
                    >
                      {focused ? "GRID" : "FOCUS"}
                    </button>
                    <button className="tbtn" onClick={() => fullscreenTile(s.uid)} title="Fullscreen tile">
                      ⛶
                    </button>
                    <button className="tbtn danger" onClick={() => removeStream(s.uid)} title="Remove feed">
                      X
                    </button>
                  </div>
                </div>
                <div
                  className="tile-body"
                  ref={(el) => {
                    if (el) bodyEls.current.set(s.uid, el);
                    else bodyEls.current.delete(s.uid);
                  }}
                >
                  {renderBody(s)}
                </div>
                <div className="tile-foot">
                  <span className={s.muted ? "aud-muted" : "aud-unmuted"}>
                    {s.muted ? "MUTED" : `VOL ${s.volume}`}
                  </span>
                  <span>{isFullAudio(s) ? "API: FULL" : "API: MUTE-ONLY*"}</span>
                  <span className="push">KEY [{i + 1}] · {s.platform.toUpperCase()}</span>
                </div>
              </section>
            );
          })}
        </div>

        {!n && (
          <div className="empty">
            <div className="empty-inner">
              <div className="empty-code">NO SIGNAL — 00 FEEDS</div>
              <h2 style={{ fontSize: "clamp(22px, 4vw, 40px)", margin: "10px 0" }}>
                STREAMGRID EMPTY
              </h2>
              <p className="empty-desc">
                PASTE UP TO <b>9</b> LIVE / VOD LINKS. UNSUPPORTED LINKS ARE REJECTED — NOTHING BLANK GETS
                ADDED.
              </p>
              <div className="empty-steps">
                <div className="step"><span>01</span>PASTE URL → <b>ENTER</b> / ADD</div>
                <div className="step"><span>02</span>PRESS <b>1–9</b> TO FOCUS (AUTO-SOLOS AUDIO, NO RELOAD)</div>
                <div className="step"><span>03</span>PRESS <b>A</b> FOR PER-FEED AUDIO MIXER</div>
              </div>
              <div className="empty-samples">
                <div className="sample-label">FIELD EXAMPLES — 24/7 ANIMAL STREAMS (OR HIT DEMO):</div>
                <code>https://www.youtube.com/watch?v=T4XZmMPQ9Kw</code>
                <code>https://www.twitch.tv/alveussanctuary</code>
                <code>https://kick.com/untamedlivefrombackyard</code>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══ MIXER DRAWER ══ */}
      <aside id="mixer" className={mixerOpen ? "" : "closed"} aria-label="Audio mixer" aria-hidden={!mixerOpen}>
        <div className="mixer-head">
          <div>
            <span className="mixer-title">AUDIO MIXER</span> <span className="dim">[A] TO CLOSE</span>
          </div>
          <div className="mixer-head-btns">
            <button className="btn btn-sm" onClick={unmuteAll} title="Unmute all at saved levels">
              UNMUTE-ALL
            </button>
            <button className="btn btn-sm" onClick={() => setMixerOpen(false)}>
              X
            </button>
          </div>
        </div>
        <div className="mixer-sub">
          YT / TWITCH / HLS / MP4 = FULL 0–100, NO RELOAD. OTHERS = MUTE-ONLY (NO VOLUME API — TOGGLE
          RELOADS THAT TILE ONLY).
        </div>
        <div id="mixerRows">
          {!n && <div className="mixer-empty">NO FEEDS. ADD A STREAM FIRST.</div>}
          {streams.map((s, i) => {
            const full = isFullAudio(s);
            return (
              <div className="mrow" key={s.uid}>
                <div className="mrow-top">
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="t">{s.label} — {s.title}</span>
                  <button
                    className={`mute-btn${s.muted ? " muted" : " live"}`}
                    onClick={() => setMuted(s.uid, !s.muted)}
                  >
                    {s.muted ? "MUTED" : "LIVE"}
                  </button>
                </div>
                <div className="mrow-ctrl">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={s.volume}
                    disabled={!full}
                    onChange={(e) => setVolume(s.uid, Number(e.target.value))}
                    aria-label={`Volume for feed ${i + 1}`}
                  />
                  <span className="mvol">{full ? s.volume : "—"}</span>
                </div>
                {!full && <div className="mnote">* MUTE-ONLY: PROVIDER EXPOSES NO VOLUME API.</div>}
              </div>
            );
          })}
        </div>
        <div className="mixer-foot">
          TIP: FOCUSING A TILE (1–9) SOLOS ITS AUDIO. PRESS 0 TO RETURN + RESTORE.
        </div>
      </aside>

      {/* ══ HELP MODAL ══ */}
      {helpOpen && (
        <div className="modal" onClick={() => setHelpOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>FIELD MANUAL — SUPPORTED SIGNALS</span>
              <button className="btn btn-sm" onClick={() => setHelpOpen(false)}>
                X
              </button>
            </div>
            <div className="modal-body">
              <table className="manual-table">
                <tbody>
                  {[
                    ["TWITCH", "twitch.tv/<channel> · /videos/<id> · clips", "FULL"],
                    ["YOUTUBE", "watch?v= · youtu.be/ · /live/ · /shorts/ · /embed/", "FULL"],
                    ["KICK", "kick.com/<channel> · /video/<id>", "MUTE-ONLY*"],
                    ["RUMBLE", "rumble.com/v… · /embed/…", "MUTE-ONLY*"],
                    ["VIMEO", "vimeo.com/<id>", "MUTE-ONLY*"],
                    ["DAILYMOTION", "dailymotion.com/video/… · dai.ly/…", "MUTE-ONLY*"],
                    ["FACEBOOK", "…/videos/… · fb.watch/…", "MUTE-ONLY*"],
                    ["TIKTOK", "@user/video/<id> (VOD only, LIVE not embeddable)", "MUTE-ONLY*"],
                    ["TROVO", "trovo.live/<channel>", "MUTE-ONLY*"],
                    ["DLIVE", "dlive.tv/<channel>", "MUTE-ONLY*"],
                    ["SOOP", "play.sooplive.co.kr/<station>", "MUTE-ONLY*"],
                    ["NIMO", "nimo.tv/<name>", "MUTE-ONLY*"],
                    ["ODYSEE", "odysee.com/…", "MUTE-ONLY*"],
                    ["STEAM", "steamcommunity.com/broadcast/watch/<id>", "MUTE-ONLY*"],
                    ["HLS", "…/stream.m3u8", "FULL"],
                    ["MP4", "….mp4 / .webm", "FULL"],
                  ].map(([p, f, a]) => (
                    <tr key={p}>
                      <td>{p}</td>
                      <td>{f}</td>
                      <td>{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="modal-note">
                * MUTE-ONLY = PROVIDER GIVES NO VOLUME API — UNMUTE RELOADS THAT TILE ONLY (OTHERS KEEP
                PLAYING). ANYTHING ELSE → <b>REJECTED WITH AN ERROR, NEVER ADDED BLANK.</b>
              </p>
              <p className="modal-note">
                KEYS — <b>0</b> GRID · <b>1–9</b> FOCUS + SOLO · <b>A</b> MIXER · <b>M</b> MUTE-ALL ·{" "}
                <b>ESC</b> EXIT. FOCUS NEVER REBUILDS THE GRID — TILES STAY MOUNTED, NO REFRESH.
              </p>
              <p className="modal-note">
                TWITCH PRE-ROLLS? THAT IS TWITCH, NOT US — THE OFFICIAL EMBED SERVES THE SAME ADS AS
                TWITCH.TV AND NO SITE CAN DISABLE THEM. <b>UBLOCK ORIGIN</b> IN YOUR OWN BROWSER
                REMOVES THEM INSIDE THIS GRID, OR SUB / TURBO + LOG IN.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══ STATUS BAR ══ */}
      <footer id="statusbar">
        <span>FEEDS: {n}</span>
        <span className="sep">|</span>
        <span>{focusUid ? `MODE: FOCUS ${streams.findIndex((s) => s.uid === focusUid) + 1}` : "MODE: GRID"}</span>
        <span className="sep">|</span>
        <span>{audioSummary}</span>
        <span className="flex" />
        <span className="dim hide-m">TILES PERSIST IN DOM — FOCUS = CSS ONLY, NO RELOAD</span>
      </footer>

      <div id="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.ok ? " ok" : ""}`}>
            <b>{t.title}</b>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
