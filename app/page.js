import "./globals.css";
import StreamGrid from "../components/StreamGrid";

function AppJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "StreamGrid",
    url: "https://streamgrid.adityalabs.in/",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    isAccessibleForFree: true,
    description:
      "Watch up to 9 Twitch, YouTube, Kick and other streams together in one grid with number-key focus and a per-stream audio mixer.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
      <AppJsonLd />
      <StreamGrid />
    </>
  );
}
