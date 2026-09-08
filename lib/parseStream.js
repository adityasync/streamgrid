/**
 * Stream-URL parser + embed-URL builders.
 * Pure functions (no window access) so they work in server and client components.
 *
 * parseStreamUrl(url) -> { stream } | { error }
 *   stream: { platform, label, title, watchUrl, audio: 'full' | 'mute-only', data }
 *
 * buildEmbedSrc(stream, muted, parents) -> string | null
 *   parents: array of parent hostnames for Twitch embeds.
 */

function clean(raw) {
  return String(raw || "").trim();
}

function normalizeHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

function err(msg, hint) {
  return { error: msg, hint };
}

export function parseStreamUrl(rawInput) {
  const input = clean(rawInput);
  if (!input) return err("EMPTY LINK — PASTE A STREAM URL FIRST.");

  let url;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : "https://" + input);
  } catch {
    return err("NOT A VALID URL.", "Copy the full link from the stream page, e.g. https://www.twitch.tv/shroud");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const href = url.href;

  // ── direct media / HLS ────────────────────────────────────────────
  if (/\.m3u8(\?|#|$)/i.test(href)) {
    const name = path.split("/").filter(Boolean).pop() || "HLS STREAM";
    return {
      stream: {
        platform: "hls", label: "HLS", title: name.replace(/\.m3u8.*$/i, "").slice(0, 48) || "HLS STREAM",
        watchUrl: href, audio: "full", data: { src: href },
      },
    };
  }
  if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(path)) {
    const name = path.split("/").filter(Boolean).pop() || "VIDEO FILE";
    return {
      stream: {
        platform: "mp4", label: "MP4", title: name.slice(0, 48),
        watchUrl: href, audio: "full", data: { src: href },
      },
    };
  }

  const seg = path.split("/").filter(Boolean);

  // ── Twitch ────────────────────────────────────────────────────────
  if (host === "twitch.tv" || host === "clips.twitch.tv") {
    // clip pages: twitch.tv/<ch>/clip/<slug> or clips.twitch.tv/<slug>
    const clipSlug =
      /\/clip\/([A-Za-z0-9_-]+)/.exec(path)?.[1] ||
      (host === "clips.twitch.tv" ? seg[0] : null);
    if (clipSlug && /^[A-Za-z0-9_-]{4,120}$/.test(clipSlug)) {
      return {
        stream: {
          platform: "twitch", label: "TWITCH", title: "CLIP " + clipSlug.slice(0, 24),
          watchUrl: href, audio: "full", data: { kind: "clip", slug: clipSlug },
        },
      };
    }
    const vid = /\/videos\/(\d+)/.exec(path)?.[1];
    if (vid) {
      return {
        stream: {
          platform: "twitch", label: "TWITCH", title: "VOD " + vid,
          watchUrl: href, audio: "full", data: { kind: "video", id: vid },
        },
      };
    }
    const ch = /^\/([A-Za-z0-9_]{2,25})(?:\/|$)/.exec(path)?.[1];
    if (ch && !["videos", "clip", "clips", "directory", "search", "settings"].includes(ch.toLowerCase())) {
      return {
        stream: {
          platform: "twitch", label: "TWITCH", title: ch,
          watchUrl: href, audio: "full", data: { kind: "channel", channel: ch },
        },
      };
    }
    return err("TWITCH LINK NOT RECOGNIZED.", "Use a channel (twitch.tv/<name>), a VOD (twitch.tv/videos/<id>) or a clip link.");
  }

  // ── YouTube ───────────────────────────────────────────────────────
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id = null;
    if (host === "youtu.be") id = seg[0];
    else {
      id =
        url.searchParams.get("v") ||
        /^\/(?:live|shorts|embed|v)\/([A-Za-z0-9_-]{6,})/.exec(path)?.[1] ||
        null;
    }
    id = (id || "").split(/[?&#/]/)[0];
    if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
      return {
        stream: {
          platform: "youtube", label: "YOUTUBE", title: "YT · " + id,
          watchUrl: href, audio: "full", data: { videoId: id },
        },
      };
    }
    if (/\/@[^/]+/.test(path) || seg.length === 1) {
      return err("YOUTUBE CHANNEL LINKS CAN'T BE EMBEDDED.", "Open the live video itself and paste its watch URL (youtube.com/watch?v=… or youtu.be/…).");
    }
    return err("YOUTUBE LINK NOT RECOGNIZED.", "Paste a watch URL: youtube.com/watch?v=… · youtu.be/… · youtube.com/live/…");
  }

  // ── Kick ──────────────────────────────────────────────────────────
  if (host === "kick.com") {
    const videoId = /^\/video\/([A-Za-z0-9-]+)/i.exec(path)?.[1];
    if (videoId) {
      return {
        stream: {
          platform: "kick", label: "KICK", title: "VOD " + videoId.slice(0, 20),
          watchUrl: href, audio: "mute-only", data: { kind: "video", id: videoId },
        },
      };
    }
    const NON = new Set(["video", "categories", "category", "search", "clips", "clip", "videos", "about", "auth", "stream", "dashboard"]);
    const ch = seg[0];
    if (ch && /^[A-Za-z0-9_]{2,30}$/.test(ch) && !NON.has(ch.toLowerCase())) {
      return {
        stream: {
          platform: "kick", label: "KICK", title: ch,
          watchUrl: href, audio: "mute-only", data: { kind: "channel", channel: ch },
        },
      };
    }
    return err("KICK LINK NOT RECOGNIZED.", "Use a channel link: kick.com/<channel>.");
  }

  // ── Rumble ────────────────────────────────────────────────────────
  if (host === "rumble.com") {
    if (path.startsWith("/embed/")) {
      const m = /\/(v[A-Za-z0-9]+)/.exec(path);
      return {
        stream: {
          platform: "rumble", label: "RUMBLE", title: m ? m[1] : "RUMBLE EMBED",
          watchUrl: href, audio: "mute-only", data: { kind: "embed", embedPath: path },
        },
      };
    }
    const m = /\/(v[A-Za-z0-9]+)(?:-|$|\/|\?)/.exec(path);
    if (m) {
      return {
        stream: {
          platform: "rumble", label: "RUMBLE", title: m[1],
          watchUrl: href, audio: "mute-only", data: { kind: "video", id: m[1] },
        },
      };
    }
    return err("RUMBLE LINK NOT RECOGNIZED.", "Open the video and paste its /v… URL.");
  }

  // ── Vimeo ─────────────────────────────────────────────────────────
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = /\/(\d{5,})/.exec(path)?.[1];
    if (id) {
      return {
        stream: {
          platform: "vimeo", label: "VIMEO", title: "VIMEO " + id,
          watchUrl: href, audio: "mute-only", data: { id },
        },
      };
    }
    return err("VIMEO LINK NOT RECOGNIZED.", "Use a video page: vimeo.com/<id>.");
  }

  // ── Dailymotion ───────────────────────────────────────────────────
  if (host === "dailymotion.com" || host === "dai.ly" || host === "geo.dailymotion.com") {
    const id = /\/video\/([^_?#/]+)/.exec(path)?.[1] || (host === "dai.ly" ? seg[0] : null);
    if (id && /^[A-Za-z0-9]+$/.test(id)) {
      return {
        stream: {
          platform: "dailymotion", label: "DAILYMOTION", title: "DM " + id.slice(0, 16),
          watchUrl: href, audio: "mute-only", data: { id },
        },
      };
    }
    return err("DAILYMOTION LINK NOT RECOGNIZED.", "Use dailymotion.com/video/<id> or dai.ly/<id>.");
  }

  // ── Facebook ──────────────────────────────────────────────────────
  if (host === "facebook.com" || host === "fb.watch" || host === "fb.com") {
    if (/\/videos?\//.test(path) || /\/watch/.test(path) || host === "fb.watch" || url.searchParams.get("v")) {
      return {
        stream: {
          platform: "facebook", label: "FACEBOOK", title: "FB VIDEO",
          watchUrl: href, audio: "mute-only", data: { href },
        },
      };
    }
    return err("FACEBOOK LINK NOT RECOGNIZED.", "Open the video/reel and paste that URL (…/videos/<id> or fb.watch/…).");
  }

  // ── TikTok (VOD only — LIVE has no embed) ──────────────────────────
  if (host === "tiktok.com" || host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const vid = /\/video\/(\d{6,})/.exec(path)?.[1];
    if (vid) {
      return {
        stream: {
          platform: "tiktok", label: "TIKTOK", title: "TT " + vid.slice(-8),
          watchUrl: href, audio: "mute-only", data: { id: vid },
        },
      };
    }
    if (/\/live\b/.test(path)) {
      return err("TIKTOK LIVE CAN'T BE EMBEDDED.", "TikTok offers no live embed — paste a TikTok video URL (@user/video/<id>) instead.");
    }
    if (host !== "tiktok.com") {
      return err("SHORT TIKTOK LINK CAN'T BE RESOLVED HERE.", "Open it once in a tab, then paste the full tiktok.com/@…/video/… URL.");
    }
    return err("TIKTOK LINK NOT RECOGNIZED.", "Paste a video URL: tiktok.com/@user/video/<id>.");
  }

  // ── Trovo ─────────────────────────────────────────────────────────
  if (host === "trovo.live") {
    const ch = /^\/(?:s\/)?([^/?#]+)/.exec(path)?.[1];
    if (ch && !["s"].includes(ch.toLowerCase())) {
      return {
        stream: {
          platform: "trovo", label: "TROVO", title: ch,
          watchUrl: href, audio: "mute-only", data: { channel: ch },
        },
      };
    }
    return err("TROVO LINK NOT RECOGNIZED.", "Use trovo.live/<channel>.");
  }

  // ── DLive ─────────────────────────────────────────────────────────
  if (host === "dlive.tv") {
    const ch = /^\/(?:p\/)?([^/?#]+)/.exec(path)?.[1];
    const NON = new Set(["p", "s", "browse", "search", "login", "register"]);
    if (ch && !NON.has(ch.toLowerCase())) {
      return {
        stream: {
          platform: "dlive", label: "DLIVE", title: ch,
          watchUrl: href, audio: "mute-only", data: { channel: ch },
        },
      };
    }
    return err("DLIVE LINK NOT RECOGNIZED.", "Use dlive.tv/<channel>.");
  }

  // ── SOOP (ex-AfreecaTV) ───────────────────────────────────────────
  if (host === "play.sooplive.co.kr" || host.endsWith("afreecatv.com") || host === "sooplive.co.kr" || host === "play.afreecatv.com") {
    const id = seg[0];
    if (id) {
      return {
        stream: {
          platform: "soop", label: "SOOP", title: id.slice(0, 28),
          watchUrl: href, audio: "mute-only", data: { station: id },
        },
      };
    }
    return err("SOOP LINK NOT RECOGNIZED.", "Use a station link: play.sooplive.co.kr/<station>.");
  }

  // ── Nimo TV ───────────────────────────────────────────────────────
  if (host === "nimo.tv" || host.endsWith(".nimo.tv")) {
    const ch = seg.filter((s) => !["live", "lives"].includes(s.toLowerCase()))[0];
    if (ch) {
      return {
        stream: {
          platform: "nimo", label: "NIMO", title: ch.slice(0, 28),
          watchUrl: href, audio: "mute-only", data: { channel: ch },
        },
      };
    }
    return err("NIMO LINK NOT RECOGNIZED.", "Use a streamer link: nimo.tv/<name>.");
  }

  // ── Odysee ────────────────────────────────────────────────────────
  if (host === "odysee.com") {
    const rest = path.replace(/^\/+/, "");
    if (rest && rest !== "/" && !rest.startsWith("$/")) {
      return {
        stream: {
          platform: "odysee", label: "ODYSEE", title: rest.split("/").pop().slice(0, 28) || "ODYSEE",
          watchUrl: href, audio: "mute-only", data: { claim: rest },
        },
      };
    }
    return err("ODYSEE LINK NOT RECOGNIZED.", "Open the video and paste its full odysee.com/… URL.");
  }

  // ── Steam broadcast ───────────────────────────────────────────────
  if (host === "steamcommunity.com" || host === "store.steampowered.com") {
    const id = /\/watch\/(\d+)/.exec(path)?.[1] || /\/broadcast\/(\d+)/.exec(path)?.[1];
    if (id) {
      return {
        stream: {
          platform: "steam", label: "STEAM", title: "BROADCAST " + id,
          watchUrl: href, audio: "mute-only", data: { id },
        },
      };
    }
    return err("STEAM LINK NOT RECOGNIZED.", "Use a broadcast link: steamcommunity.com/broadcast/watch/<id>.");
  }

  // ── X / Instagram / others with no embeddable live player ─────────
  if (host === "x.com" || host === "twitter.com") {
    return err("X (TWITTER) HAS NO EMBEDDABLE LIVE PLAYER.", "StreamGrid supports Twitch, YouTube, Kick, Rumble, Vimeo, Facebook, Trovo, DLive, SOOP, Nimo, Odysee, HLS and MP4.");
  }
  if (host === "instagram.com") {
    return err("INSTAGRAM HAS NO EMBEDDABLE LIVE PLAYER.", "Use a platform with an embeddable player (see supported list).");
  }

  return err(
    "UNSUPPORTED SOURCE — NOTHING ADDED.",
    `No embeddable player found for ${normalizeHost(href) || "this link"}. Supported: Twitch · YouTube · Kick · Rumble · Vimeo · Dailymotion · Facebook · TikTok VOD · Trovo · DLive · SOOP · Nimo · Odysee · Steam · HLS (.m3u8) · MP4.`
  );
}

/** Build an iframe src for mute-only / plain-iframe platforms. Returns null for API-driven ones. */
export function buildEmbedSrc(stream, muted, parents = []) {
  const m = muted ? 1 : 0;
  const d = stream.data || {};
  switch (stream.platform) {
    case "kick":
      return d.kind === "video"
        ? `https://player.kick.com/video/${encodeURIComponent(d.id)}?autoplay=true&muted=${m}`
        : `https://player.kick.com/${encodeURIComponent(d.channel)}?autoplay=true&muted=${m}`;
    case "rumble":
      return d.kind === "embed"
        ? `https://rumble.com${d.embedPath}?autoplay=2&mute=${m}`
        : `https://rumble.com/embed/${d.id}/?autoplay=2&mute=${m}`;
    case "vimeo":
      return `https://player.vimeo.com/video/${encodeURIComponent(d.id)}?autoplay=1&muted=${m}`;
    case "dailymotion":
      return `https://geo.dailymotion.com/player.html?video=${encodeURIComponent(d.id)}&autoplay=1&mute=${m === 1}`;
    case "facebook":
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(d.href)}&show_text=false&autoplay=true&allowFullScreen=true`;
    case "tiktok":
      return `https://www.tiktok.com/embed/v2/${encodeURIComponent(d.id)}`;
    case "trovo":
      return `https://player.trovo.live/embed/player?streamer=${encodeURIComponent(d.channel)}&autoplay=true`;
    case "dlive":
      return `https://dlive.tv/p/${encodeURIComponent(d.channel)}?autoplay=true`;
    case "soop":
      return `https://play.sooplive.co.kr/${encodeURIComponent(d.station)}/embed?autoplay=1&muted=${m === 1}`;
    case "nimo":
      return `https://www.nimo.tv/embed/${encodeURIComponent(d.channel)}`;
    case "odysee":
      return `https://odysee.com/$/embed/${d.claim}`;
    case "steam":
      return `https://steamcommunity.com/broadcast/embed/${encodeURIComponent(d.id)}`;
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(d.videoId)}?autoplay=1&mute=${m}&rel=0&enablejsapi=1&playsinline=1`;
    case "twitch": {
      const plist = (parents.length ? parents : ["localhost"]).map((p) => `&parent=${encodeURIComponent(p)}`).join("");
      if (d.kind === "clip") return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(d.slug)}${plist}&autoplay=true&muted=${m === 1}`;
      if (d.kind === "video") return `https://player.twitch.tv/?video=${encodeURIComponent(d.id)}${plist}&autoplay=true&muted=${m === 1}`;
      return `https://player.twitch.tv/?channel=${encodeURIComponent(d.channel)}${plist}&autoplay=true&muted=${m === 1}`;
    }
    default:
      return null; // hls / mp4 render <video>, never an iframe
  }
}

export const SUPPORTED_PLATFORMS = [
  "TWITCH", "YOUTUBE", "KICK", "RUMBLE", "VIMEO", "DAILYMOTION",
  "FACEBOOK", "TIKTOK-VOD", "TROVO", "DLIVE", "SOOP", "NIMO",
  "ODYSEE", "STEAM", "HLS", "MP4",
];
