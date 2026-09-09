import Link from "next/link";

export const metadata = {
  title: "404 — Signal Lost",
  description: "This StreamGrid route does not exist. Return to the grid.",
};

const LINES = [
  { text: "REQUESTED ROUTE DOES NOT EXIST.", delay: "0.35s" },
  { text: "GRID INTACT — NOTHING ELSE DROPPED.", delay: "0.55s" },
];

export default function NotFound() {
  return (
    <div className="err-page">
      <div className="err-scan" aria-hidden="true" />
      <div className="err-inner">
        <div className="err-code">ERR/404</div>
        <div className="err-title">
          SIGNAL LOST<span className="blink">_</span>
        </div>
        <div className="err-lines">
          {LINES.map((l) => (
            <p key={l.text} className="err-line" style={{ animationDelay: l.delay }}>
              <span className="err-prompt">&gt;</span> {l.text}
            </p>
          ))}
          <p className="err-line" style={{ animationDelay: "0.75s" }}>
            <span className="err-prompt">&gt;</span>{" "}
            <Link href="/" className="err-link">
              RETURN TO GRID
            </Link>{" "}
            — NO DIAGNOSTICS NEEDED.
          </p>
        </div>
      </div>
    </div>
  );
}
