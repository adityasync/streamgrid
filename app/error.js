"use client";

/* Segment-level fault: the grid shell (layout) survives, only this
 * segment failed. Offers a retry (re-render the segment) + a way home. */
export default function Error({ error, reset }) {
  return (
    <div className="err-page">
      <div className="err-scan" aria-hidden="true" />
      <div className="err-inner">
        <div className="err-code">ERR/500</div>
        <div className="err-title">
          SEGMENT FAULT<span className="blink">_</span>
        </div>
        <div className="err-lines">
          <p className="err-line" style={{ animationDelay: "0.35s" }}>
            <span className="err-prompt">&gt;</span> THIS PANEL CRASHED — SHELL STILL STANDING.
          </p>
          {error?.message && (
            <p className="err-line err-detail" style={{ animationDelay: "0.55s" }}>
              <span className="err-prompt">&gt;</span> {String(error.message).slice(0, 160)}
            </p>
          )}
          <p className="err-line" style={{ animationDelay: "0.75s" }}>
            <span className="err-prompt">&gt;</span>{" "}
            <button className="btn btn-sm btn-primary" onClick={() => reset()}>
              RETRY PANEL
            </button>{" "}
            <a className="btn btn-sm" href="/">
              GRID
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
