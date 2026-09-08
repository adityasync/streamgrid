import { JetBrains_Mono } from "next/font/google";

const SITE_URL = "https://streamgrid.adityalabs.in";
const SITE_NAME = "StreamGrid";
const TITLE = "StreamGrid — Watch Twitch, YouTube, Kick & More Together";
const DESCRIPTION =
  "StreamGrid is a free multiview player: paste Twitch, YouTube, Kick, Rumble, Vimeo, Facebook, TikTok, Trovo, DLive, SOOP, Nimo, Odysee, HLS or MP4 links and watch up to 9 streams together in one grid. Number-key focus, auto solo audio, per-stream audio mixer. No signup.";

// Self-hosted mono font: no render-blocking Google Fonts request,
// display=swap so text never blocks on the font.
const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — StreamGrid",
  },
  description: DESCRIPTION,
  keywords: [
    "streamgrid",
    "stream grid",
    "multistream",
    "multiview",
    "watch multiple streams",
    "twitch multiview",
    "youtube multiview",
    "kick multiview",
    "co-stream viewer",
    "stream grid",
    "watch streams together",
    "multistream player",
    "rumble multiview",
    "trovo multiview",
    "dlive multiview",
  ],
  authors: [{ name: "StreamGrid" }],
  creator: "StreamGrid",
  publisher: "StreamGrid",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "StreamGrid — watch up to 9 streams together",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
  },
  category: "entertainment",
};

export const viewport = {
  themeColor: "#191b1e",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
