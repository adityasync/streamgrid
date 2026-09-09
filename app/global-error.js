"use client";

import "./globals.css";

/* Root-level fault: replaces layout entirely, so it ships its own
 * <html>/<body> and its own globals.css import. Same voice as 404. */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body>
        <div className="err-page">
          <div className="err-scan" aria-hidden="true" />
          <div className="err-inner">
            <div className="err-code">ERR/500</div>
            <div className="err-title">
              SYSTEM FAULT<span className="blink">_</span>
            </div>
            <div className="err-lines">
              <p className="err-line" style={{ animationDelay: "0.35s" }}>
                <span className="err-prompt">&gt;</span> CORE SHELL FAILED — FEEDS PRESERVED IN LOCAL STORAGE.
              </p>
              {error?.message && (
                <p className="err-line err-detail" style={{ animationDelay: "0.55s" }}>
                  <span className="err-prompt">&gt;</span> {String(error.message).slice(0, 160)}
                </p>
              )}
              <p className="err-line" style={{ animationDelay: "0.75s" }}>
                <span className="err-prompt">&gt;</span>{" "}
                <button className="btn btn-sm btn-primary" onClick={() => reset()}>
                  REBOOT SHELL
                </button>{" "}
                <a className="btn btn-sm" href="/">
                  GRID
                </a>
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
