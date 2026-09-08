import Link from "next/link";

const SITE = "https://streamgrid.adityalabs.in";

export const metadata = {
  title: "How to Watch Multiple Streams Together — Free Multiview Guide",
  description:
    "Learn how to watch multiple Twitch, YouTube, Kick and Rumble streams at once in one free multiview grid. Supported platforms, keyboard shortcuts, audio mixer, share links, troubleshooting. No signup.",
  alternates: { canonical: "/guide" },
  openGraph: {
    title: "How to Watch Multiple Streams Together — StreamGrid Guide",
    description:
      "Free multiview guide: watch up to 9 Twitch, YouTube, Kick and more streams together. Platforms, shortcuts, mixer, share links, troubleshooting.",
    url: `${SITE}/guide`,
  },
};

const STEPS = [
  {
    title: "Paste a stream URL",
    text: "Copy any supported stream link — a Twitch channel, a YouTube live video, a Kick channel — paste it into the command bar and press Enter. Repeat up to 9 times. Every feed starts muted (browser autoplay rules) and plays simultaneously.",
  },
  {
    title: "Focus with number keys",
    text: "Press 1–9 to blow any feed up full-size. Its audio solos automatically while the rest mute; the other streams keep playing and never reload. Press 0 or Esc to return to the grid with your previous audio state restored.",
  },
  {
    title: "Mix audio per stream",
    text: "Press A for the audio mixer: YouTube, Twitch, HLS and MP4 feeds get full 0–100 volume. Other embeds expose no volume API, so they are mute-only. Press M to mute everything instantly.",
  },
  {
    title: "Share the grid",
    text: "Press SHARE to copy a link with your whole grid encoded in the URL. Anyone opening it gets your exact feeds — no account, no database, the link hash never reaches a server.",
  },
];

const PLATFORMS = [
  ["Twitch", "Channel, VOD (/videos/id) and clips", "Full volume, no reload"],
  ["YouTube", "Watch, /live/, /shorts/, youtu.be links", "Full volume, no reload"],
  ["Kick", "Channel and /video/ links", "Mute-only (embed has no volume API)"],
  ["Rumble", "/v… video links", "Mute-only"],
  ["Vimeo", "Video pages", "Mute-only"],
  ["Dailymotion", "Video and dai.ly links", "Mute-only"],
  ["Facebook", "Video and fb.watch links", "Mute-only"],
  ["TikTok", "Video links only — live can't be embedded", "Mute-only"],
  ["Trovo", "Channel links", "Mute-only"],
  ["DLive", "Channel links", "Mute-only"],
  ["SOOP", "Station links (ex-AfreecaTV)", "Mute-only"],
  ["Nimo TV", "Streamer links", "Mute-only"],
  ["Odysee", "Video links", "Mute-only"],
  ["Steam", "Broadcast watch links", "Mute-only"],
  ["HLS", "Direct .m3u8 playlists", "Full volume, no reload"],
  ["MP4 / WebM", "Direct video files", "Full volume, no reload"],
];

const FAQ = [
  {
    q: "How can I watch multiple Twitch streams at once?",
    a: "Paste each Twitch channel URL (twitch.tv/channelname) into StreamGrid and press Enter. Up to 9 streams play side by side in one grid. Press 1–9 to focus any stream full-size — its audio solos automatically — and 0 to return to the grid.",
  },
  {
    q: "Can I watch Twitch and YouTube together?",
    a: "Yes — mixing platforms is the point. Put a Twitch channel, a YouTube live video and a Kick channel side by side, focus any of them with a number key, and its audio takes over while the rest keep playing muted.",
  },
  {
    q: "Why do all streams start muted?",
    a: "Browsers block autoplay with sound, so every feed starts muted — this is a browser rule, not a StreamGrid limit. Unmute via the mixer (A), the per-tile button, or by focusing the tile (1–9), which solos its audio.",
  },
  {
    q: "Why does unmuting a Kick or Rumble stream reload it?",
    a: "Those providers expose no volume API in their embeds, so the only way to change mute state is reloading that tile's player with a different flag. YouTube, Twitch, HLS and MP4 use real player APIs with zero reload. Only the toggled tile reloads — the rest keep playing.",
  },
  {
    q: "Which stream links are rejected?",
    a: "Anything with no embeddable player: X/Twitter, Instagram, TikTok live streams, YouTube channel pages (paste the live video URL instead), and malformed links. Rejected links show an error and nothing blank is ever added.",
  },
  {
    q: "How do I share my multiview grid?",
    a: "Press SHARE to copy a link with your whole grid encoded in the URL hash. Anyone opening it gets your exact feeds. No account, no database — the hash is never sent to any server. Try /#demo=animals for a built-in animal grid.",
  },
  {
    q: "Is StreamGrid free? Do I need an account?",
    a: "Free, no account, no tracking. Your feed list lives only in your browser's localStorage, so your layout survives reloads and never leaves your machine.",
  },
  {
    q: "Twitch embed shows an error / won't load?",
    a: "Twitch embeds require an http(s) origin and a parent allowlist — they fail on file:// pages and in some sandboxed iframes. Open StreamGrid over https (or localhost) and it works. Pre-roll ads are Twitch's, identical to twitch.tv; a browser adblocker like uBlock Origin removes them.",
  },
];

function GuideJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Guide", item: `${SITE}/guide` },
        ],
      },
      {
        "@type": "HowTo",
        name: "How to watch multiple streams together",
        description:
          "Watch up to 9 Twitch, YouTube, Kick and other streams at once in one free multiview grid.",
        step: STEPS.map((s) => ({ "@type": "HowToStep", name: s.title, text: s.text })),
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function GuidePage() {
  return (
    <>
      <GuideJsonLd />
      <div className="guide">
        <div className="guide-inner">
          <p className="guide-crumb">
            <Link href="/">STREAMGRID</Link> / GUIDE
          </p>
          <h1>How to Watch Multiple Streams Together</h1>
          <p className="lede">
            <strong>StreamGrid</strong> is a free multiview player that plays up to{" "}
            <strong>9 Twitch, YouTube, Kick, Rumble and other streams at once</strong> in
            one grid — no signup, no install, everything runs in your browser. This guide
            covers setup, supported platforms, shortcuts, sharing, and troubleshooting.{" "}
            <Link href="/">Open the grid →</Link>
          </p>

          <h2>Setup in 4 steps</h2>
          <ol className="guide-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <strong>
                  {String(i + 1).padStart(2, "0")} — {s.title}
                </strong>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>

          <h2>Supported platforms</h2>
          <p>
            Paste links from any of these sources. Anything without an embeddable player
            (X, Instagram, TikTok live) is rejected with an error instead of a blank tile.
          </p>
          <table className="guide-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Accepted links</th>
                <th>Audio control</th>
              </tr>
            </thead>
            <tbody>
              {PLATFORMS.map(([p, f, a]) => (
                <tr key={p}>
                  <td>{p}</td>
                  <td>{f}</td>
                  <td>{a}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Keyboard shortcuts</h2>
          <table className="guide-table">
            <tbody>
              {[
                ["0", "Grid view (restore audio state)"],
                ["1–9", "Focus feed + solo its audio"],
                ["A", "Audio mixer"],
                ["M", "Mute all"],
                ["Esc", "Exit focus / close panels"],
                ["?", "Field manual"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Share your grid</h2>
          <p>
            Press <strong>SHARE</strong> in the grid to copy a link with all your feeds
            encoded in the URL. Send it to anyone — opening it rebuilds your exact grid
            on their machine. No account, no database: the URL hash never reaches a
            server. Try the built-in demo: <Link href="/#demo=animals">animal grid</Link>.
          </p>

          <h2>Troubleshooting</h2>
          <ul>
            <li>
              <strong>Link rejected?</strong> Check it is a stream/video URL, not a
              channel homepage (YouTube), a live page (TikTok), or a social post (X,
              Instagram).
            </li>
            <li>
              <strong>No audio?</strong> Everything starts muted (browser autoplay
              policy). Focus the tile (1–9) or use the mixer (A).
            </li>
            <li>
              <strong>Tile shows offline?</strong> The source stream ended. Remove it and
              paste the channel&apos;s new live URL — Rumble live IDs especially expire
              when a broadcast ends.
            </li>
            <li>
              <strong>Twitch won&apos;t embed?</strong> Twitch requires an http(s)
              origin — it fails on file:// pages. Use the hosted site or localhost.
            </li>
          </ul>

          <h2>Frequently asked questions</h2>
          <div className="guide-faq">
            {FAQ.map((f) => (
              <article key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </article>
            ))}
          </div>

          <p className="guide-cta">
            <Link href="/">← BACK TO THE GRID</Link>
          </p>
        </div>
      </div>
    </>
  );
}
