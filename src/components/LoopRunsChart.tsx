"use client";

import { useState } from "react";

export interface ChartRun {
  id: number;
  label: string;
  strategy: string;
  cases: number;
  mismatched: number;
  criteria: [boolean, boolean, boolean];
  status: string;
}

// Single series (one hue, validated against the white surface); failures use
// the reserved "critical" status color and always carry an icon + count.
const SERIES = "#2a78d6";
const CRITICAL = "#d03b3b";
const H = 220;
const PAD = { top: 28, right: 12, bottom: 28, left: 48 };

/** Bars of cases passed per run, with failure markers and a hover tooltip. */
export default function LoopRunsChart({ runs }: { runs: ChartRun[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at natural size (never stretched), so text stays at its intended size.
  const W = Math.max(480, runs.length * 44 + PAD.left + PAD.right);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(1000, ...runs.map((r) => r.cases));
  const slot = plotW / runs.length;
  const barW = Math.min(28, slot - 2); // ≥2px surface gap between bars
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  const h = hover === null ? null : runs[hover];
  return (
    // Wrapper hugs the chart so the tooltip's percentage position lines up with the bars.
    <div className="relative w-fit max-w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ maxWidth: "100%", height: "auto" }}
        role="img"
        aria-label={`Cases passed per run for ${runs.length} runs; ${runs.filter((r) => r.mismatched > 0).length} runs had mismatches. The table below lists every run.`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#e7e5e4" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#52514e">
              {Math.round(t).toLocaleString()}
            </text>
          </g>
        ))}
        {runs.map((r, i) => {
          const passed = r.cases - r.mismatched;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const top = y(passed);
          const height = Math.max(0, y(0) - top);
          const rad = Math.min(4, height / 2, barW / 2);
          // Rounded data-end on top, square on the baseline.
          const d = `M${x},${y(0)} V${top + rad} Q${x},${top} ${x + rad},${top} H${x + barW - rad} Q${x + barW},${top} ${x + barW},${top + rad} V${y(0)} Z`;
          return (
            <g key={r.id}>
              <path d={d} fill={SERIES} opacity={hover === null || hover === i ? 1 : 0.55} />
              {r.mismatched > 0 && (
                <text x={x + barW / 2} y={top - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={CRITICAL}>
                  ✕ {r.mismatched}
                </text>
              )}
              {/* Hit target: the whole column, larger than the mark. */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top - 20}
                width={slot}
                height={plotH + 20}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${r.label}: ${passed} of ${r.cases} cases passed`}
              />
            </g>
          );
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#a8a29e" strokeWidth={1} />
        <text x={PAD.left} y={H - 8} fontSize={11} fill="#52514e">
          oldest
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={11} fill="#52514e">
          newest
        </text>
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
          style={(() => {
            // Beside the bar, on whichever side has room, so it never covers the hovered bar or its label.
            const pct = ((PAD.left + hover * slot + slot / 2) / W) * 100;
            const gap = barW / 2 + 8;
            return pct > 50 ? { right: `calc(${100 - pct}% + ${gap}px)` } : { left: `calc(${pct}% + ${gap}px)` };
          })()}
        >
          <div className="font-semibold text-slate-900">{h.label}</div>
          <div className="text-slate-600">
            Strategy <span className="font-mono">{h.strategy}</span>
          </div>
          <div className="tabular-nums text-slate-900">
            {(h.cases - h.mismatched).toLocaleString()} / {h.cases.toLocaleString()} cases passed
          </div>
          <div className="text-slate-600">
            Criteria a {h.criteria[0] ? "✓" : "✕"} · b {h.criteria[1] ? "✓" : "✕"} · c {h.criteria[2] ? "✓" : "✕"} ·{" "}
            {h.status}
          </div>
        </div>
      )}
    </div>
  );
}
