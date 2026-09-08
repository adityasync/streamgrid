import "./globals.css";
import StreamGrid from "../components/StreamGrid";

const FAQ = [
  {
    q: "How do I watch multiple streams at once?",
    a: "Paste any supported stream URL into the command bar and press Enter. Repeat up to 9 times. Every feed plays simultaneously in one grid — no signup, no account, everything runs in your browser.",
  },
  {
    q: "Which platforms are supported?",
    a: "Twitch, YouTube, Kick, Rumble, Vimeo, Dailymotion, Facebook videos, TikTok videos, Trovo, DLive, SOOP (AfreecaTV), Nimo TV, Odysee, Steam broadcasts, direct HLS (.m3u8) and MP4/WebM files. Unsupported links are rejected with an error instead of adding a blank tile.",
  },
  {
    q: "How do I switch between streams quickly?",
    a: "Press 1–9 to focus any feed full-size, 0 or Esc to return to the grid. Focusing a tile automatically solos its audio and never reloads the other streams.",
  },
  {
    q: "How does the audio mixer work?",
    a: "Press A to open the per-stream mixer. YouTube, Twitch, HLS and MP4 feeds get full 0–100 volume with no reload. Other embeds expose no volume API, so they are mute-only (toggling them reloads that tile alone). All feeds start muted to satisfy browser autoplay rules — unmute via focus or the mixer.",
  },
  {
    q: "Can I watch Twitch and YouTube together?",
    a: "Yes — mixing platforms is the point. Put a Twitch channel, a YouTube live video and a Kick channel side by side, focus any of them with a number key, and its audio takes over automatically.",
  },
  {
    q: "Is StreamGrid free? Do I need an account?",
    a: "Free, no account, no tracking. Your feed list is stored only in your own browser (localStorage) so your layout survives reloads.",
  },
];

function FaqJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "StreamGrid",
        url: "https://streamgrid.adityalabs.in/",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        description:
          "Watch up to 9 Twitch, YouTube, Kick and other streams together in one grid with number-key focus and a per-stream audio mixer.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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

export default function Page() {
  return (
    <>
      <FaqJsonLd />
      <StreamGrid />

      {/* ── Crawlable SEO copy (server-rendered) ─────────────────── */}
      <section className="seo" aria-label="About StreamGrid">
        <div className="seo-inner">
          <h2>Watch many streams together — free multiview for every platform</h2>
          <p>
            <strong>StreamGrid</strong> is a free multiview player that lets you{" "}
            <strong>watch multiple streams at once</strong>: paste Twitch, YouTube, Kick,
            Rumble and other stream links into one page and they all play together in a
            single grid. It is built for co-streaming — esports broadcasts with
            watch-parties, several POVs of one event, or just keeping your favourite
            creators side by side.
          </p>
          <h3>Supported sources</h3>
          <ul className="seo-plats">
            {["Twitch channels, VODs and clips","YouTube live, videos and Shorts","Kick channels and VODs","Rumble videos","Vimeo","Dailymotion","Facebook videos","TikTok videos","Trovo","DLive","SOOP (AfreecaTV)","Nimo TV","Odysee","Steam broadcasts","Direct HLS (.m3u8) playlists","Direct MP4 / WebM files"].map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <h3>How to use</h3>
          <ol>
            <li>Paste a stream URL into the command bar and press Enter (up to 9 feeds).</li>
            <li>Press 1–9 to focus any feed full-size — its audio solos automatically, nothing reloads.</li>
            <li>Press A for the per-stream audio mixer, M to mute everything, 0 to return to the grid.</li>
          </ol>
          <h3>Frequently asked questions</h3>
          <div className="seo-faq">
            {FAQ.map((f) => (
              <article key={f.q}>
                <h4>{f.q}</h4>
                <p>{f.a}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
