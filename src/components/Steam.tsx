const WISPS = [
  { dx: -13, delay: 0, height: 0.85 },
  { dx: 0, delay: -1.1, height: 1 },
  { dx: 13, delay: -2.1, height: 0.8 },
];

/** Three wisps rising from (x, y), in the units of the SVG they are drawn in. */
export function Steam({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="steam" aria-hidden>
      {WISPS.map((wisp) => (
        <g key={wisp.dx} transform={`translate(${wisp.dx} 0) scale(1 ${wisp.height})`}>
          <path
            className="steam-wisp"
            style={{ animationDelay: `${wisp.delay}s` }}
            d="M0 0 C-7 -8 7 -15 0 -24 C-6 -31 5 -36 1 -44"
            fill="none"
            stroke="#fff"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>
      ))}
    </g>
  );
}
