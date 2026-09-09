/* StreamGrid logo as inline SVG so the mark can feel alive.
 * The 3x3 cells run a slow surveillance-style scan sweep, the play
 * triangle breathes, and the // in the wordmark blinks like a cursor.
 * All motion is CSS keyframes (see globals.css), so the existing
 * prefers-reduced-motion rule disables it automatically. */

const OFFSETS = [10, 26, 42];
const CELLS = OFFSETS.flatMap((y) => OFFSETS.map((x) => ({ x, y })));

function IconCells({ step }) {
  return (
    <g>
      {CELLS.map((c, i) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width="12"
          height="12"
          rx="2"
          fill="#141619"
          className="lcell"
          style={{ animationDelay: `${(i * step).toFixed(2)}s` }}
        />
      ))}
    </g>
  );
}

function Icon({ step }) {
  return (
    <>
      <rect width="64" height="64" rx="12" fill="#FFB000" />
      <IconCells step={step} />
      <path d="M30 28.8v6.4L35 32z" fill="#FFB000" className="lplay" />
    </>
  );
}

export default function Logo({ variant = "lockup", className = "", decorative = false }) {
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "StreamGrid" };
  if (variant === "mark") {
    return (
      <svg viewBox="0 0 64 64" className={className} {...a11y}>
        <Icon step={0.3} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 400 72" className={`brand-logo${className ? ` ${className}` : ""}`} {...a11y}>
      <g className="logo-icon">
        <g transform="translate(0 4)">
          <Icon step={0.18} />
        </g>
      </g>
      <g fontFamily="'JetBrains Mono','IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace">
        <text x="76" y="33" fontSize="24" fontWeight="800" letterSpacing="1.5" fill="#D6D9DD">
          STREAMGRID<tspan fill="#FFB000">//</tspan>
        </text>
        <text x="77" y="54" fontSize="12.5" fontWeight="400" letterSpacing="3.2" fill="#8A919A">
          MULTI-SOURCE VIEW GRID
        </text>
      </g>
    </svg>
  );
}
