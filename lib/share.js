/**
 * Shareable grid links — no database, no server, no account.
 *
 * The feed list is encoded into the URL hash (e.g. #s=...), which browsers
 * never send to any server: fully static-hosting friendly, fully private.
 * Anyone opening the link gets the same grid reconstructed locally.
 *
 * Also supports the preset #demo=animals (loads the built-in animal demo).
 */

export function encodeShare(watchUrls) {
  const json = JSON.stringify(watchUrls);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeShare(code) {
  const b64 = String(code || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const json = decodeURIComponent(escape(atob(b64)));
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error("bad payload");
  return arr.filter((u) => typeof u === "string" && u.length > 0);
}

export function buildShareHash(watchUrls) {
  return "#s=" + encodeShare(watchUrls);
}

/** Parse a location.hash value. Returns {preset}|{urls}|null. */
export function parseLocationHash(hash) {
  const h = String(hash || "").replace(/^#/, "");
  if (h === "demo=animals") return { preset: "animals" };
  if (h.startsWith("s=") && h.length > 2) {
    try {
      const urls = decodeShare(h.slice(2));
      if (urls.length) return { urls };
    } catch {
      /* malformed share code — treated as no share */
    }
  }
  return null;
}
