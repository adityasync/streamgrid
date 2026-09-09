"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Logo from "./Logo";
import { buildEmbedSrc, parseStreamUrl } from "../lib/parseStream";
import { buildShareHash, parseLocationHash } from "../lib/share";

const MAX = 9;
const LS_KEY = "streamgrid.v1";
const LS_KEY_LEGACY = "multistream.v1";
const LS_LAYOUT = "streamgrid.layout.v1";
const COLS_ORDER = ["auto", "1", "2", "3"];
/* Demo: 9x 24/7 animal streams — 3 Twitch + 3 Kick + 3 YouTube.
 * All verified live at build time. Fills the whole grid. */
const DEMO = [
  "https://www.youtube.com/watch?v=T4XZmMPQ9Kw", // Kitten Academy 24/7
  "https://www.twitch.tv/alveussanctuary", // Alveus sanctuary 24/7 cams
  "https://kick.com/untamedlivefrombackyard", // 24/7 backyard wildlife
  "https://www.youtube.com/watch?v=J7ZrIDvqlic", // Brooks Falls bears 24/7
  "https://www.twitch.tv/onlycatpets", // 24/7 cat cams
  "https://kick.com/cuteavalanche", // 24/7 foster kittens
  "https://www.youtube.com/watch?v=cTsjMtjRLCo", // Katmai river bears 24/7
  "https://www.twitch.tv/gardenzoo", // Garden shelter 24/7
  "https://kick.com/furball-farm", // Cat sanctuary 24/7
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
  const [theater, setTheater] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [colsMode, setColsMode] = useState("auto");
  const [lock16, setLock16] = useState(false);
  const [fill, setFill] = useState(false);
  const [input, setInput] = useState("");
  const [log, setLog] = useState({
    text: "READY. PASTE A STREAM URL ABOVE. ALL STREAMS START MUTED (BROWSER AUTOPLAY POLICY) — FOCUS A TILE OR USE THE MIXER TO UNMUTE.",
    isErr: false,
  });
  const [toasts, setToasts] = useState([]);
  const [parents, setParents] = useState(["localhost", "127.0.0.1"]);
  const [twBlocked, setTwBlocked] = useState({}); // uid -> true while a Twitch tile needs a tap to play
  const [ready, setReady] = useState(() => new Set()); // uids whose first frame loaded (tune-in done)
  const [flash, setFlash] = useState(null); // {uid, k} — one-shot unmute ring, cleared after 700ms
  const [dragUid, setDragUid] = useState(null);
  const [dropUid, setDropUid] = useState(null);

  const streamsRef = useRef([]);
  const focusRef = useRef(null);
  const mixerRef = useRef(false);
  const theaterRef = useRef(false);
  const dragUidRef = useRef(null);
  const flashTimer = useRef(null);
  const idleTimer = useRef(null);
  const ytPlayers = useRef(new Map());
  const twPlayers = useRef(new Map());
  const videoEls = useRef(new Map());
  const bodyEls = useRef(new Map());
  const hlsObjs = useRef(new Map());
  const preFocus = useRef(new Map());
  const hlsLib = useRef(null);
  const ytReady = useRef(false);
  const loaded = useRef(false);
  const twTimers = useRef(new Map());
  const twPending = useRef(new Set()); // uids with a deferred Twitch construction queued

  streamsRef.current = streams;
  focusRef.current = focusUid;
  mixerRef.current = mixerOpen;
  theaterRef.current = theater;

  /* ── toast helper ─────────────────────────────────────────── */
  const pushToast = useCallback((title, msg, ok = false) => {
    const id = makeUid();
    setToasts((t) => [...t, { id, title, msg, ok }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const say = useCallback((text, isErr = false) => {
    setLog({ text, isErr });
  }, []);

  /* first-frame loaded → fade the TUNING overlay for that tile only */
  const markReady = useCallback((uid) => {
    setReady((prev) => {
      if (prev.has(uid)) return prev;
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
  }, []);

  const unready = useCallback((uid) => {
    setReady((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }, []);

  /* ── mount: shared link / preset / saved feeds / external scripts ─ */
  useEffect(() => {
    const host = window.location.hostname;
    if (host) setParents([host, "localhost", "127.0.0.1"]);

    // Shared grid links (#s=...) and presets (#demo=...) win over storage.
    // The hash is consumed immediately so a later reload falls back to the
    // (already saved) local grid instead of a stale link.
    let sharedLoaded = false;
    const shared = parseLocationHash(window.location.hash);
    if (shared) {
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        /* non-fatal */
      }
      if (shared.preset === "animals") {
        sharedLoaded = true;
        setTimeout(() => loadDemo(), 0);
      } else if (shared.urls) {
        let added = 0;
        let skipped = 0;
        const seen = new Set();
        for (const u of shared.urls.slice(0, MAX)) {
          const { stream, error } = parseStreamUrl(u);
          const key = stream
            ? stream.platform + JSON.stringify(stream.data)
            : "bad:" + u;
          if (!stream || error || seen.has(key)) {
            skipped += 1;
            continue;
          }
          seen.add(key);
          streamsRef.current = [
            ...streamsRef.current,
            { ...stream, uid: makeUid(), muted: true, volume: 70 },
          ];
          added += 1;
        }
        if (added) {
          sharedLoaded = true;
          setStreams([...streamsRef.current]);
          say(
            `SHARED GRID LOADED: ${added} FEED(S)` +
              (skipped ? `, ${skipped} SKIPPED` : "") +
              ". NO ACCOUNT, NO DATABASE."
          );
        } else {
          say("SHARED LINK HAD NO VALID FEEDS.", true);
        }
      }
    }

    if (!sharedLoaded) {
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
      try {
        const layout = JSON.parse(localStorage.getItem(LS_LAYOUT) || "null");
        if (layout) {
          if (COLS_ORDER.includes(layout.cols)) setColsMode(layout.cols);
          if (layout.ar === 1) setLock16(true);
          if (layout.fill === 1) setFill(true);
        }
      } catch {
        /* ignore corrupt layout */
      }
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

  /* ── persist layout override (columns + 16:9 lock) ─────────── */
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(LS_LAYOUT, JSON.stringify({ cols: colsMode, ar: lock16 ? 1 : 0, fill: fill ? 1 : 0 }));
    } catch {
      /* non-fatal */
    }
  }, [colsMode, lock16, fill]);

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
      // The div is a placeholder — the IFrame API builds the iframe itself
      // with the right host/origin. Wrapping a hand-made <iframe> instead
      // races the API's polling loop and logs postMessage target-origin
      // mismatches.
      const p = new window.YT.Player(`yt-${s.uid}`, {
        host: "https://www.youtube-nocookie.com",
        videoId: s.data.videoId,
        playerVars: {
          autoplay: 1,
          mute: 1, // embed-level mute never changes; unmute goes through the API
          rel: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            markReady(s.uid);
            const cur = currentOf(s.uid);
            try {
              if (cur?.muted) e.target.mute();
              else {
                e.target.unMute();
                e.target.setVolume(cur?.volume ?? 70);
              }
            } catch {}
            // autoplay param can stall (throttled tab, slow load) — force it
            try {
              e.target.playVideo();
            } catch {}
          },
        },
      });
      ytPlayers.current.set(s.uid, p);
    } catch {}
  }

  /* Patch the iframe that Twitch's v1.js builds: it emits both
   * allow="..." and the legacy allowfullscreen attribute, which makes
   * Chrome log "Allow attribute will take precedence over
   * 'allowfullscreen'". Fullscreen keeps working through the allow list
   * alone. (Our own iframes never set both — this is purely Twitch's SDK.) */
  function fixTwIframe(uid) {
    try {
      const f = document.getElementById(`tw-${uid}`)?.querySelector("iframe");
      if (!f) return;
      const allow = f.getAttribute("allow") || "";
      if (!/(^|;\s*)fullscreen(\s*;|$)/i.test(allow)) {
        f.setAttribute("allow", `${allow.replace(/;?\s*$/, "")}; fullscreen`);
      }
      f.removeAttribute("allowfullscreen");
      f.removeAttribute("allowFullscreen");
    } catch {}
  }

  /* True while the tile is still animating in (tile-in starts at opacity 0)
   * or laid out at 0x0 — constructing a Twitch player in either state fails
   * Twitch's visibility/size gate ("style visibility, size") for that
   * player, so the caller must defer construction instead. */
  function twNeedsDefer(el) {
    try {
      const anims = el.closest?.(".tile")?.getAnimations?.() || [];
      if (anims.some((a) => a.playState === "running")) return true;
    } catch {}
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return true;
    } catch {}
    return false;
  }

  function queueTwRetry(s) {
    if (twPending.current.has(s.uid)) return;
    twPending.current.add(s.uid);
    setTimeout(() => {
      twPending.current.delete(s.uid);
      const cur = currentOf(s.uid);
      if (cur && isTwitchApi(cur) && !twPlayers.current.has(cur.uid)) ensureTW(cur, { defer: true });
    }, 750);
  }

  function ensureTW(s, { defer = false } = {}) {
    if (!window.Twitch?.Player) return;
    if (twPlayers.current.has(s.uid)) return;
    const el = document.getElementById(`tw-${s.uid}`);
    if (!el) return;
    // Hidden tiles (focus mode sets display:none) always fail Twitch's
    // visibility check — don't burn a player on them. The sync effect
    // re-runs on focus/grid/mute changes and constructs them once visible.
    try {
      if (el.closest(".hidden-tile")) return;
    } catch {}
    if (!defer && twNeedsDefer(el)) {
      queueTwRetry(s);
      return;
    }
    try {
      const opts = {
        width: "100%",
        height: "100%",
        autoplay: true,
        muted: true,
        // Don't let v1.js emit the legacy allowfullscreen attribute next to
        // allow="..." (Chrome logs a precedence warning for that pair).
        // fixTwIframe() keeps fullscreen enabled via the allow list.
        allowfullscreen: false,
        parent: parents.length ? parents : ["localhost"],
      };
      if (s.data.kind === "video") opts.video = s.data.id;
      else opts.channel = s.data.channel;
      const p = new window.Twitch.Player(`tw-${s.uid}`, opts);
      twPlayers.current.set(s.uid, p);
      fixTwIframe(s.uid);
      // Self-healing autoplay: Twitch reports PLAYBACK_BLOCKED when the
      // browser stalls autoplay. Retry verified playback, and if it still
      // won't start, raise the tap-to-play veil (a real button = a real
      // user gesture, which always unblocks playback).
      const P = window.Twitch.Player;
      const EV = {
        ready: P.READY || "ready",
        playing: P.PLAYING || "playing",
        blocked: P.PLAYBACK_BLOCKED || "playbackBlocked",
        online: P.ONLINE || "online",
      };
      // NOTE: nothing is commanded before READY — play()/setVolume() issued
      // earlier throw "Cannot handle commands before the video player is
      // initialized" and never take effect.
      try {
        p.addEventListener(EV.ready, () => {
          fixTwIframe(s.uid);
          markReady(s.uid);
          try {
            p.setVolume((currentOf(s.uid)?.volume ?? 70) / 100);
          } catch {}
          attemptTwPlay(s.uid, 5);
        });
      } catch {}
      try {
        p.addEventListener(EV.blocked, () => {
          markTwBlocked(s.uid, true);
          attemptTwPlay(s.uid, 3);
        });
      } catch {}
      try {
        p.addEventListener(EV.playing, () => {
          clearTwTimer(s.uid);
          markTwBlocked(s.uid, false);
        });
      } catch {}
      try {
        p.addEventListener(EV.online, () => {
          markTwBlocked(s.uid, false);
          attemptTwPlay(s.uid, 3);
        });
      } catch {}
      // NOTE: PAUSE is deliberately ignored — a user pausing via Twitch's
      // own controls must never be force-resumed.
    } catch {}
  }

  function clearTwTimer(uid) {
    const t = twTimers.current.get(uid);
    if (t) {
      clearTimeout(t);
      twTimers.current.delete(uid);
    }
  }

  function markTwBlocked(uid, on) {
    setTwBlocked((prev) => {
      if (!!prev[uid] === on) return prev;
      const next = { ...prev };
      if (on) next[uid] = true;
      else delete next[uid];
      return next;
    });
  }

  /* (re)start a Twitch tile, then verify via isPaused(); retries heal
   * autoplay races, the veil covers anything retries can't fix. */
  function attemptTwPlay(uid, tries = 3) {
    clearTwTimer(uid);
    const p = twPlayers.current.get(uid);
    const s = currentOf(uid);
    if (!p || !s || !isTwitchApi(s)) return;
    try {
      p.setMuted(s.muted !== false);
    } catch {}
    try {
      p.play();
    } catch {}
    if (tries <= 0) return;
    twTimers.current.set(
      uid,
      setTimeout(() => {
        if (!currentOf(uid) || !twPlayers.current.get(uid)) return;
        let paused = true;
        try {
          paused = twPlayers.current.get(uid).isPaused();
        } catch {}
        if (paused) {
          markTwBlocked(uid, true);
          attemptTwPlay(uid, tries - 1);
        } else {
          markTwBlocked(uid, false);
        }
      }, 1500)
    );
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
      else if (isTwitchApi(s)) {
        // ensureTW itself skips hidden tiles; the guard here just avoids
        // queueing deferred retries for tiles that can't play yet.
        try {
          if (document.getElementById(`tw-${s.uid}`)?.closest(".hidden-tile")) continue;
        } catch {}
        ensureTW(s);
      }
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
    for (const [uid, p] of twPlayers.current) {
      if (!alive.has(uid)) {
        clearTwTimer(uid);
        try {
          p?.pause?.();
        } catch {}
        twPlayers.current.delete(uid);
      }
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
    setTwBlocked((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(next)) {
        if (!alive.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setReady((prev) => {
      if ([...prev].every((uid) => alive.has(uid))) return prev;
      return new Set([...prev].filter((uid) => alive.has(uid)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, parents]);

  /* ── low-level audio ops (no reload for API players) ──────── */
  function playerMute(s, muted) {
    try {
      if (isYouTube(s)) {
        const p = ytPlayers.current.get(s.uid);
        if (!p) return;
        if (muted) p.mute();
        else {
          p.unMute();
          // unmuting a stalled player doesn't resume it — force play
          try {
            p.playVideo();
          } catch {}
        }
      } else if (isTwitchApi(s)) {
        const p = twPlayers.current.get(s.uid);
        if (!p) return;
        p.setMuted(muted);
        if (!muted) {
          try {
            p.play();
          } catch {}
        }
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
    if (!muted) {
      // one-shot amber ring confirms the unmute landed (CSS animates it out)
      try {
        if (flashTimer.current) clearTimeout(flashTimer.current);
      } catch {}
      setFlash({ uid, k: Date.now() });
      flashTimer.current = setTimeout(() => setFlash(null), 700);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVolume = useCallback((uid, vol) => {
    const v = Math.max(0, Math.min(100, Math.round(vol)));
    const s = currentOf(uid);
    setStreams((prev) => prev.map((x) => (x.uid === uid ? { ...x, volume: v } : x)));
    if (s) playerVolume(s, v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* reload ONE tile only — every other player is untouched (no grid rebuild) */
  const refreshTile = useCallback(
    (uid) => {
      const s = currentOf(uid);
      if (!s) return;
      unready(uid); // replay the TUNING overlay for this tile
      const idx = streamsRef.current.findIndex((x) => x.uid === uid);
      const tag = `FEED ${String(idx + 1).padStart(2, "0")}`;
      if (isYouTube(s)) {
        try {
          const p = ytPlayers.current.get(uid);
          if (p?.loadVideoById) {
            try {
              p.loadVideoById(s.data.videoId);
            } catch {
              try { p.playVideo?.(); } catch {}
            }
            try {
              if (s.muted) p.mute?.();
              else {
                p.unMute?.();
                p.setVolume?.(s.volume ?? 70);
              }
            } catch {}
            say(`${tag} RELOADED — OTHERS UNTOUCHED.`);
            return;
          }
        } catch {}
        // fallback: destroy + rebuild that player only
        try {
          ytPlayers.current.get(uid)?.destroy?.();
        } catch {}
        ytPlayers.current.delete(uid);
        setTimeout(() => {
          const cur = currentOf(uid);
          if (cur) ensureYT(cur);
        }, 60);
        say(`${tag} PLAYER REBUILT — OTHERS UNTOUCHED.`);
        return;
      }
      if (isTwitchApi(s)) {
        clearTwTimer(uid);
        markTwBlocked(uid, false);
        try {
          twPlayers.current.get(uid)?.pause?.();
        } catch {}
        twPlayers.current.delete(uid);
        try {
          const el = document.getElementById(`tw-${uid}`);
          if (el) el.innerHTML = "";
        } catch {}
        setTimeout(() => {
          const cur = currentOf(uid);
          if (cur && isTwitchApi(cur)) ensureTW(cur, { defer: true });
        }, 80);
        say(`${tag} RELOADED — OTHERS UNTOUCHED.`);
        return;
      }
      if (isVideo(s)) {
        try {
          const h = hlsObjs.current.get(uid);
          if (h) {
            try { h.destroy(); } catch {}
            hlsObjs.current.delete(uid);
          }
        } catch {}
        try {
          const el = videoEls.current.get(uid);
          if (el) delete el.dataset.hlsBound;
        } catch {}
        setTimeout(() => {
          const cur = currentOf(uid);
          if (cur) setupVideo(cur);
        }, 60);
        say(`${tag} RELOADED — OTHERS UNTOUCHED.`);
        return;
      }
      // mute-only iframes: bump nonce → React remounts THAT iframe alone
      setStreams((prev) => prev.map((x) => (x.uid === uid ? { ...x, nonce: (x.nonce || 0) + 1 } : x)));
      say(`${tag} RELOADED — OTHERS UNTOUCHED.`);
    },
    [say, unready]
  );

  /* reorder: keys 1–9 follow the new order; focus (by uid) is preserved;
   * persist effect saves the new order automatically. Tiles stay mounted
   * (React key = uid), so players are moved, never rebuilt. */
  const moveTile = useCallback(
    (uid, dir) => {
      const list = streamsRef.current;
      const i = list.findIndex((x) => x.uid === uid);
      if (i < 0) return;
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const next = [...list];
      const [m] = next.splice(i, 1);
      next.splice(j, 0, m);
      streamsRef.current = next;
      setStreams(next);
      say(`MOVED ${m.label} → POSITION ${j + 1}. KEYS 1–9 FOLLOW NEW ORDER.`);
    },
    [say]
  );

  const dropReorder = useCallback(
    (targetUid) => {
      const fromUid = dragUidRef.current;
      if (!fromUid || fromUid === targetUid) return;
      const list = streamsRef.current;
      const from = list.findIndex((x) => x.uid === fromUid);
      let to = list.findIndex((x) => x.uid === targetUid);
      if (from < 0 || to < 0) return;
      const next = [...list];
      const [m] = next.splice(from, 1);
      to = next.findIndex((x) => x.uid === targetUid);
      next.splice(to + 1, 0, m);
      streamsRef.current = next;
      setStreams(next);
      say(`MOVED ${m.label} → POSITION ${to + 2}. KEYS 1–9 FOLLOW NEW ORDER.`);
    },
    [say]
  );

  /* pointer-based drag reorder (mouse + touch): press the ⠿ handle and
   * drop onto any tile. Deliberately NOT HTML5 DnD — that API misfires
   * around cross-origin iframes and is dead on touchscreens. */
  const dragOn = useRef(false);

  function tileFromPoint(x, y) {
    try {
      const sec = document.elementFromPoint(x, y)?.closest?.("section.tile");
      return sec?.dataset?.uid || null;
    } catch {
      return null;
    }
  }

  function onHandleDown(e, uid) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dragUidRef.current = uid;
    dragOn.current = true;
    setDropUid(null);
    setDragUid(uid);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }

  function onHandleMove(e) {
    if (!dragOn.current || !dragUidRef.current) return;
    const over = tileFromPoint(e.clientX, e.clientY);
    setDropUid(over && over !== dragUidRef.current ? over : null);
  }

  function endHandleDrag(e, commit) {
    if (!dragOn.current) return;
    dragOn.current = false;
    const from = dragUidRef.current;
    setDragUid(null);
    setDropUid(null);
    // NOTE: the ref must stay set until AFTER dropReorder runs —
    // dropReorder reads the dragged uid from dragUidRef.
    if (commit && from && e && typeof e.clientX === "number") {
      const target = tileFromPoint(e.clientX, e.clientY);
      if (target && target !== from) dropReorder(target);
    }
    dragUidRef.current = null;
  }

  /* layout override: cycle AUTO → 1 → 2 → 3 → AUTO. CSS-only, players untouched. */
  const cycleCols = useCallback(() => {
    setColsMode((prev) => {
      const next = COLS_ORDER[(COLS_ORDER.indexOf(prev) + 1) % COLS_ORDER.length];
      say(
        next === "auto"
          ? "COLUMNS: AUTO — GRID PICKS 1/2/3 BY FEED COUNT."
          : `COLUMNS: ${next} — MANUAL OVERRIDE. PRESS L TO CYCLE, SAVED.`
      );
      return next;
    });
  }, [say]);

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
      // A focused tile is full-size, so a Twitch tile that was gated on
      // size retries now with room to pass. Delay past the reflow so the
      // player measures the visible layout, not the grid one.
      try {
        if (t && isTwitchApi(t)) setTimeout(() => attemptTwPlay(t.uid, 3), 350);
      } catch {}
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
    setReady(new Set());
    setFlash(null);
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
        ? `ANIMAL DEMO: FULL GRID — ${added} LIVE 24/7 FEEDS (3 TWITCH + 3 KICK + 3 YOUTUBE). PRESS 1–${added} TO FOCUS + SOLO, A FOR MIXER.`
        : "DEMO FEEDS ALREADY ON GRID."
    );
  }, [say]);

  /* shareable link: the whole grid encoded in the URL hash — no db */
  const shareGrid = useCallback(() => {
    const list = streamsRef.current;
    if (!list.length) {
      say("NOTHING TO SHARE — ADD A FEED FIRST.", true);
      return;
    }
    const url =
      window.location.origin +
      window.location.pathname +
      buildShareHash(list.map((s) => s.watchUrl));
    try {
      window.location.hash = url.slice(url.indexOf("#"));
    } catch {
      /* non-fatal */
    }
    const done = (ok) => {
      if (ok) {
        pushToast("LINK COPIED", `${list.length} FEED(S) ENCODED IN URL — SEND IT.`, true);
        say(`SHARE LINK READY: ${list.length} FEED(S) IN URL. NO ACCOUNT, NO DATABASE.`);
      } else {
        pushToast("AUTO-COPY BLOCKED", "Copy the URL from the address bar manually.");
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
    } else {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        done(ok);
      } catch {
        done(false);
      }
    }
  }, [pushToast, say]);

  /* ── keyboard ─────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;

      if (k === "Escape") {
        if (theaterRef.current) {
          setTheater(false);
          setChromeHidden(false);
          try {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          } catch {}
        }
        else if (helpOpen) setHelpOpen(false);
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
      if (lower === "f" || lower === "t") {
        setTheater((v) => {
          if (v) {
            setChromeHidden(false);
            try {
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            } catch {}
          }
          return !v;
        });
        return;
      }
      if (lower === "r") {
        const uid = focusRef.current;
        if (uid && streamsRef.current.some((s) => s.uid === uid)) refreshTile(uid);
        return;
      }
      if (lower === "l") {
        cycleCols();
        return;
      }
      if (k === "ArrowLeft" || k === "ArrowRight") {
        // range sliders keep native ←/→ volume behavior
        if (t && t.tagName === "INPUT" && t.type === "range") return;
        const uid = focusRef.current;
        if (uid) {
          e.preventDefault();
          moveTile(uid, k === "ArrowLeft" ? -1 : 1);
        }
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
  }, [addStream, focusFeed, toGrid, muteAll, refreshTile, moveTile, cycleCols, helpOpen]);

  /* ── derived ──────────────────────────────────────────────── */
  const n = streams.length;
  const colsClass =
    colsMode !== "auto"
      ? `cols-man-${colsMode}`
      : n <= 1
        ? "cols-1"
        : n === 2
          ? "cols-2"
          : n === 3
            ? "cols-3"
            : "cols-4";
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

  /* ── theater: chromeless canvas (no header/log/statusbar/tile chrome).
   * CSS-only by default so tabs stay visible; `withBrowserFS` upgrades it
   * to true browser fullscreen for TV / couch viewing. Players are never
   * rebuilt — tiles stay mounted, so no stream reloads on toggle. */
  const setTheaterMode = useCallback((on) => {
    setTheater(on);
    setChromeHidden(false);
    try {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    } catch {}
    if (!on) {
      try {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } catch {}
    }
  }, []);

  const toggleTheater = useCallback(() => {
    setTheaterMode(!theaterRef.current);
  }, [setTheaterMode]);

  const toggleBrowserFS = useCallback(() => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.getElementById("app")?.requestFullscreen?.().catch(() => {});
    } catch {}
  }, []);

  /* auto-hide the floating HUD + cursor after 2.5s idle in theater */
  useEffect(() => {
    if (!theater) return;
    function poke() {
      setChromeHidden(false);
      try {
        if (idleTimer.current) clearTimeout(idleTimer.current);
      } catch {}
      idleTimer.current = setTimeout(() => setChromeHidden(true), 2500);
    }
    poke();
    window.addEventListener("mousemove", poke);
    window.addEventListener("touchstart", poke, { passive: true });
    window.addEventListener("keydown", poke);
    return () => {
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("touchstart", poke);
      try {
        if (idleTimer.current) clearTimeout(idleTimer.current);
      } catch {}
    };
  }, [theater]);

  /* FILL (cover-crop): scale each embed so its 16:9 picture covers the
   * tile — zero bars, at the cost of cropped edges. <video> does it via
   * CSS object-fit; iframe/slot embeds get exact object-fit:cover math
   * through a ResizeObserver with direct style writes (no re-renders).
   * Players are never rebuilt, so toggling never reloads a stream. */
  useEffect(() => {
    const bodies = [...bodyEls.current.values()];
    const kidOf = (b) => {
      try {
        return b.querySelector("iframe, video, .tw-slot, .yt-slot");
      } catch {
        return null;
      }
    };
    const reset = () => {
      for (const b of bodies) {
        const k = kidOf(b);
        if (k) {
          k.style.width = "";
          k.style.height = "";
          k.style.left = "";
          k.style.top = "";
        }
      }
    };
    if (!fill) {
      reset();
      return;
    }
    const VID = 16 / 9;
    const apply = (body) => {
      let r;
      try {
        r = body.getBoundingClientRect();
      } catch {
        return;
      }
      if (!r.width || !r.height) return;
      const k = kidOf(body);
      if (!k || k.tagName === "VIDEO") return;
      const ar = r.width / r.height;
      if (Math.abs(ar - VID) < 0.02) {
        k.style.width = "100%";
        k.style.height = "100%";
        k.style.left = "0";
        k.style.top = "0";
        return;
      }
      if (ar > VID) {
        // tile wider than video: stretch width, crop sides
        const s = ar / VID;
        k.style.width = `${s * 100}%`;
        k.style.height = "100%";
        k.style.left = `${(1 - s) * 50}%`;
        k.style.top = "0";
      } else {
        // tile taller than video: stretch height, crop top/bottom
        const s = VID / ar;
        k.style.width = "100%";
        k.style.height = `${s * 100}%`;
        k.style.left = "0";
        k.style.top = `${(1 - s) * 50}%`;
      }
    };
    let ro = null;
    try {
      ro = new ResizeObserver((entries) => {
        for (const en of entries) apply(en.target);
      });
    } catch {
      ro = null;
    }
    for (const b of bodies) {
      apply(b);
      try {
        ro?.observe(b);
      } catch {}
    }
    return () => {
      try {
        ro?.disconnect();
      } catch {}
      reset();
    };
  }, [fill, streams]);

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
          onLoadedData={() => markReady(s.uid)}
          title={`${s.label} — ${s.title}`}
        />
      );
    }
    if (isTwitchApi(s)) {
      return <div id={`tw-${s.uid}`} className="tw-slot" title={`${s.label} — ${s.title}`} />;
    }
    if (isYouTube(s)) {
      // Placeholder div — the YT IFrame API builds the iframe itself with
      // the correct host/origin (see ensureYT playerVars). Our iframes keep
      // `fullscreen` inside `allow` and never set allowFullScreen, so the
      // React "Allow attribute will take precedence" warning can't fire.
      return <div id={`yt-${s.uid}`} className="yt-slot" title={`${s.label} — ${s.title}`} />;
    }
    return (
      <iframe
        key={s.nonce || 0}
        src={buildEmbedSrc(s, s.muted, parents)}
        title={`${s.label} — ${s.title}`}
        onLoad={() => markReady(s.uid)}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      />
    );
  }

  return (
    <div id="app" className={`${theater ? "theater" : ""}${theater && chromeHidden ? " idle-hide" : ""}${lock16 ? " lock16" : ""}${fill ? " fill" : ""}`}>
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
          <Logo variant="lockup" />
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
          <button className="btn" onClick={loadDemo} title="Load 9 live 24/7 animal streams (3 Twitch + 3 Kick + 3 YouTube)">
            DEMO
          </button>
        </div>

        <div className="top-actions">
          <button className={`btn${theater ? " btn-primary" : ""}`} onClick={toggleTheater} title="Chromeless canvas — hide header/log/statusbar (F)">
            [F] THEATER
          </button>
          <button className="btn" onClick={() => setMixerOpen((v) => !v)} title="Audio mixer (A)">
            [A] MIXER <span id="mixerDot" className={`dot${mixerOpen ? "" : " hidden"}`} />
          </button>
          <button className="btn" onClick={muteAll} title="Mute all (M)">
            [M] MUTE-ALL
          </button>
          <button className="btn" onClick={() => toGrid(true)} title="Grid view (0)">
            [0] GRID
          </button>
          <button
            className={`btn${colsMode !== "auto" ? " btn-primary" : ""}`}
            onClick={cycleCols}
            title="Column override: AUTO → 1 → 2 → 3 (L). Fixes awkward auto-grid at 5–7 feeds."
          >
            [L] COLS:{colsMode === "auto" ? "AUTO" : colsMode}
          </button>
          <button
            className={`btn${lock16 ? " btn-primary" : ""}`}
            onClick={() => {
              setLock16((v) => {
                const on = !v;
                if (on) setFill(false);
                say(on ? "ASPECT: 16:9 LOCK — TILES KEEP WIDESCREEN, LETTERBOXED. SAVED." : "ASPECT: STRETCH — TILES FILL THE VIEWPORT.");
                return on;
              });
            }}
            title="Lock tiles to 16:9 instead of stretching to fill (saved)"
          >
            16:9
          </button>
          <button
            className={`btn${fill ? " btn-primary" : ""}`}
            onClick={() => {
              setFill((v) => {
                const on = !v;
                if (on) setLock16(false);
                say(on ? "FILL: COVER-CROP — PICTURE COVERS EVERY TILE, EDGES CROPPED. SAVED." : "FILL OFF — FULL PICTURE, BARS MAY SHOW. SAVED.");
                return on;
              });
            }}
            title="Cover-crop every tile: no black bars anywhere, edges cropped (saved)"
          >
            FILL
          </button>
          <button className="btn" onClick={shareGrid} title="Copy shareable link for this grid (no account, no database)">
            SHARE
          </button>
          <button className="btn" onClick={() => setHelpOpen(true)} title="Manual (?)">
            ?
          </button>
          <button className="btn btn-danger" onClick={clearAll} title="Remove all streams">
            CLR
          </button>
        </div>
      </header>

      {/* ══ GRID — tiles stay mounted, focus is CSS-only (no reload) ══ */}
      {/* when empty, the grid div is skipped entirely so the blank canvas
          takes the full area instead of splitting it with a dead grid */}
      <main id="gridWrap">
        {n ? (
        <div id="grid" className={`${colsClass}${focusUid ? " focusing" : ""}`}>
          {streams.map((s, i) => {
            const focused = s.uid === focusUid;
            const hidden = focusUid && !focused;
            return (
              <section
                key={s.uid}
                data-uid={s.uid}
                className={`tile${focused ? " focused" : ""}${hidden ? " hidden-tile" : ""}${s.muted ? "" : " audible"}${dragUid === s.uid ? " dragging" : ""}${dropUid === s.uid && dragUid !== s.uid ? " drop-target" : ""}`}
                style={{ animationDelay: `${Math.min(i, 8) * 70}ms` }}
                aria-label={`Feed ${i + 1}: ${s.label} ${s.title}`}
              >
                <div className="tile-head">
                  <span
                    className="drag-handle"
                    title="Hold + drag to reorder"
                    onPointerDown={(e) => onHandleDown(e, s.uid)}
                    onPointerMove={onHandleMove}
                    onPointerUp={(e) => endHandleDrag(e, true)}
                    onPointerCancel={() => endHandleDrag(null, false)}
                  >
                    ⠿
                  </span>
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
                    <button className="tbtn" onClick={() => refreshTile(s.uid)} title="Reload this feed only — others keep playing (R on focused)">
                      ↻
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
                  {/* tune-in: scanlines until the first frame lands, then fades.
                      stays mounted (opacity 0) so the fade is smooth, no reflow */}
                  <div className={`tune${ready.has(s.uid) ? " ready" : ""}`} aria-hidden="true">
                    <span className="tune-msg">
                      TUNING<span className="blink">_</span>
                    </span>
                  </div>
                  {twBlocked[s.uid] && isTwitchApi(s) && (
                    <div className="tw-veil">
                      <button
                        className="tplay"
                        onClick={() => attemptTwPlay(s.uid, 3)}
                        title="Start playback (counts as a click, always works)"
                      >
                        ▶ TAP TO PLAY
                      </button>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
        ) : (
          <div className="empty">
            <Logo variant="mark" className="empty-mark" decorative />
            <div className="empty-inner">
              <div className="empty-code">NO SIGNAL — 00 FEEDS</div>
              <div className="empty-title">PASTE A STREAM URL</div>
              <div className="empty-sub">
                <b>ENTER</b> TO ADD · UP TO 9 · OR HIT <b>DEMO</b>
              </div>
              <div className="empty-keys">1–9 FOCUS · A MIXER · F THEATER · ? MANUAL</div>
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
                <b>F</b> THEATER (CHROMELESS CANVAS) · <b>R</b> RELOAD FOCUSED TILE · <b>←/→</b> MOVE
                FOCUSED TILE · <b>L</b> CYCLE COLUMNS (AUTO→1→2→3) · <b>ESC</b> EXIT. FOCUS NEVER REBUILDS THE GRID — TILES STAY MOUNTED, NO REFRESH.
              </p>
              <p className="modal-note">
                LAYOUT — <b>COLS</b> FORCES 1/2/3 COLUMNS (AUTO PICKS BY FEED COUNT; 5–7 FEEDS OFTEN WANT
                MANUAL 3). <b>16:9</b> LOCKS TILES TO WIDESCREEN INSTEAD OF STRETCHING. <b>FILL</b>{" "}
                COVER-CROPS EVERY TILE SO NO BLACK BARS REMAIN — EDGES GET CUT INSTEAD. ALL SAVED
                LOCALLY, ALL CSS-ONLY — NO STREAM RELOADS.
              </p>
              <p className="modal-note">
                TWITCH PRE-ROLLS? THAT IS TWITCH, NOT US — THE OFFICIAL EMBED SERVES THE SAME ADS AS
                TWITCH.TV AND NO SITE CAN DISABLE THEM. <b>UBLOCK ORIGIN</b> IN YOUR OWN BROWSER
                REMOVES THEM INSIDE THIS GRID, OR SUB / TURBO + LOG IN.
              </p>
              <p className="modal-note">
                <b>SHARE</b> — COPIES A LINK WITH YOUR WHOLE GRID ENCODED IN THE URL (#s=…). ANYONE
                OPENING IT GETS YOUR FEEDS. NO ACCOUNT, NO DATABASE — THE HASH NEVER REACHES A SERVER.
                TRY <b>#demo=animals</b> FOR THE BUILT-IN ANIMAL GRID.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══ STATUS BAR (log merged in — one row, not two) ══ */}
      <footer id="statusbar">
        <span className={`log-tag${log.isErr ? " err" : ""}`}>{log.isErr ? "ERR" : "SYS"}</span>
        <span id="logText" className="status-log">{log.text}</span>
        <span className="sep">|</span>
        <span className="stat">FEEDS: {n}</span>
        <span className="sep">|</span>
        <span className="stat">{theater ? "MODE: THEATER" : focusUid ? `MODE: FOCUS ${streams.findIndex((s) => s.uid === focusUid) + 1}` : "MODE: GRID"}</span>
        <span className="sep hide-m">|</span>
        <span className="stat hide-m">{audioSummary}</span>
        <span className="flex" />
        <span className="dim hide-m">0 GRID · 1–9 FOCUS · A MIXER · M MUTE · F THEATER · L COLS · ESC EXIT</span>
        <span className="sep">|</span>
        <a href="/guide" title="Multiview guide: platforms, shortcuts, sharing, troubleshooting">GUIDE</a>
      </footer>

      {/* ══ THEATER HUD — floating controls, auto-hides when idle ══ */}
      {theater && (
        <div className="theater-hud" role="toolbar" aria-label="Theater controls">
          <span className="hud-mode">THEATER · {n} FEED{n === 1 ? "" : "S"} · ESC EXITS</span>
          <span className="hud-sep" />
          <button className="btn btn-sm" onClick={() => toGrid(true)} title="Grid view (0)">
            GRID
          </button>
          <button className="btn btn-sm" onClick={() => setMixerOpen((v) => !v)} title="Audio mixer (A)">
            MIXER
          </button>
          <button className="btn btn-sm" onClick={toggleBrowserFS} title="True browser fullscreen">
            ⛶ FULL
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setTheaterMode(false)} title="Exit theater (Esc)">
            EXIT ✕
          </button>
        </div>
      )}

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
