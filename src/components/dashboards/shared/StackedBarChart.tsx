"use client";

import { useRef, useEffect, useState } from "react";

export interface BarSegment {
  value: number;
  color: string;
  label: string;
}

export interface BarData {
  label: string;
  segments: BarSegment[];
  lineValue?: number;
}

interface StackedBarChartProps {
  data: BarData[];
  lineLabel?: string;
  lineColor?: string;
  height?: number;
  /** How to format bar segment values in the tooltip + the optional
   *  bar-top label. Defaults to 'currency' so existing call sites keep
   *  their $-prefixed labels (the chart's original use case). Pass
   *  'number' for non-currency metrics like conversions or clicks. */
  valueFormat?: "currency" | "number";
  /** Word used as the prefix on the tooltip's first total line. Defaults
   *  to 'Total' so existing screens read 'Total: $1.2k'. Pass
   *  'Total conversions' (or similar) to override. */
  totalLabel?: string;
  /** Whether to draw a 'Diff: X' line on the tooltip when 2+ segments
   *  are present. The Progress tab uses this to surface brand-vs-generic
   *  spend gap; the simplified stakeholder view turns it off. Default true. */
  showDiff?: boolean;
  /** When true, draw the bar's total on top of each bar. Used by the
   *  simplified view's 'Conversions by Type' chart. */
  showBarTotal?: boolean;
}

function formatDollarsShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function formatNumberShort(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n).toLocaleString()}`;
}

export function StackedBarChart({
  data,
  lineLabel = "Conversions",
  lineColor = "#3b82f6",
  height = 220,
  valueFormat = "currency",
  totalLabel = "Total",
  showDiff = true,
  showBarTotal = false,
}: StackedBarChartProps) {
  const formatValue = valueFormat === "number" ? formatNumberShort : formatDollarsShort;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (data.length === 0) return null;

  const maxBarTotal = Math.max(...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)), 1);
  const maxLine = Math.max(...data.map((d) => d.lineValue ?? 0), 1);
  const hasLine = data.some((d) => d.lineValue != null && d.lineValue > 0);

  // Layout constants — everything in one coordinate system
  const labelHeight = 18; // space for month labels at bottom
  const topPad = 16;      // space above bars for conversion labels
  const baseline = height - labelHeight; // y where bars sit on
  const chartHeight = baseline - topPad; // available height for bars & line

  // Bar sizing
  const gap = data.length > 12 ? 4 : 6;
  const barSlotWidth = containerWidth > 0
    ? (containerWidth - gap * (data.length - 1)) / data.length
    : 48;
  const barWidth = Math.max(barSlotWidth * 0.65, 12);

  // Unique legend entries
  const legendItems = new Map<string, string>();
  for (const d of data) {
    for (const seg of d.segments) {
      if (!legendItems.has(seg.label)) legendItems.set(seg.label, seg.color);
    }
  }
  if (hasLine) legendItems.set(lineLabel, lineColor);

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {Array.from(legendItems).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            {label}
          </div>
        ))}
      </div>

      {/* Chart — pure SVG for consistent coordinates */}
      <div ref={containerRef} className="w-full">
        {containerWidth > 0 && (
          <svg width={containerWidth} height={height}>
            {/* Baseline */}
            <line
              x1={0}
              y1={baseline}
              x2={containerWidth}
              y2={baseline}
              stroke="#e2e8f0"
              strokeWidth={1}
            />

            {/* Bars */}
            {data.map((d, i) => {
              const total = d.segments.reduce((s, seg) => s + seg.value, 0);
              const barH = total > 0 ? Math.max((total / maxBarTotal) * chartHeight, 4) : 0;
              const barX = i * (barSlotWidth + gap) + (barSlotWidth - barWidth) / 2;
              const barY = baseline - barH;

              // Build stacked segments from bottom up
              let segY = baseline;
              const renderedSegments = [...d.segments].reverse().map((seg, j) => {
                const segH = total > 0 ? (seg.value / total) * barH : 0;
                segY -= segH;
                return (
                  <rect
                    key={j}
                    x={barX}
                    y={segY}
                    width={barWidth}
                    height={segH}
                    fill={seg.color}
                    rx={j === d.segments.length - 1 ? 3 : 0}
                    ry={j === d.segments.length - 1 ? 3 : 0}
                  />
                );
              });

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{ cursor: "default" }}
                >
                  {/* Hit area for hover */}
                  <rect
                    x={i * (barSlotWidth + gap)}
                    y={0}
                    width={barSlotWidth}
                    height={height}
                    fill="transparent"
                  />
                  {/* Stacked bar segments */}
                  {renderedSegments}
                  {/* Top rounded cap — same colour as the top-most rendered
                      segment (which is segments[0] since we reverse before
                      stacking). Previously used the wrong segment, which
                      visually placed the top-segment colour at the bottom
                      of the bar's cap and made the layered colour look
                      sandwiched. */}
                  {barH > 0 && (
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={Math.min(6, barH)}
                      fill={d.segments[0]?.color || d.segments[d.segments.length - 1]?.color}
                      rx={3}
                      ry={3}
                    />
                  )}
                  {/* Multi-line tooltip — month label, total, per-segment
                      values, optional diff line, and (when present)
                      the line-overlay value. Clamped to stay inside the
                      SVG. */}
                  {hoveredBar === i && (() => {
                    const segs = d.segments.filter((s) => s.value > 0);
                    const showSplit = segs.length >= 2;
                    const lines: Array<{ text: string; color?: string; weight?: number }> = [];
                    lines.push({ text: d.label, color: "#cbd5e1" });
                    lines.push({ text: `${totalLabel}: ${formatValue(total)}`, weight: 600 });
                    if (showSplit) {
                      for (const seg of d.segments) {
                        // Strip the legacy '(...)' currency / unit hint from
                        // segment labels in the tooltip so we don't get
                        // 'Brand spend ($): $1.2k' duplicated style markers.
                        const labelText = seg.label.replace(/\s*\([^)]*\)\s*$/, "");
                        lines.push({ text: `${labelText}: ${formatValue(seg.value)}`, color: seg.color });
                      }
                      if (showDiff) {
                        // Difference between the two largest segments. Only
                        // surfaces when the caller opted in (Progress tab uses
                        // it; the simplified stakeholder view doesn't).
                        const sorted = [...d.segments].sort((a, b) => b.value - a.value);
                        const diff = Math.abs(sorted[0].value - sorted[1].value);
                        lines.push({ text: `Diff: ${formatValue(diff)}`, color: "#94a3b8" });
                      }
                    }
                    if (d.lineValue != null) {
                      lines.push({ text: `${d.lineValue} ${lineLabel.toLowerCase()}`, color: "#94a3b8" });
                    }
                    const lineHeight = 13;
                    const padTop = 8;
                    const padBottom = 8;
                    const tooltipHeight = padTop + padBottom + lines.length * lineHeight;
                    const tooltipWidth = 140;
                    const cx = i * (barSlotWidth + gap) + barSlotWidth / 2;
                    let rectX = cx - tooltipWidth / 2;
                    if (rectX < 2) rectX = 2;
                    if (rectX + tooltipWidth > containerWidth - 2) rectX = containerWidth - tooltipWidth - 2;
                    const tooltipRectY = Math.max(barY - tooltipHeight - 6, 2);
                    return (
                      <g pointerEvents="none">
                        <rect
                          x={rectX}
                          y={tooltipRectY}
                          width={tooltipWidth}
                          height={tooltipHeight}
                          rx={5}
                          fill="#0f172a"
                          opacity={0.96}
                        />
                        {lines.map((ln, li) => (
                          <text
                            key={li}
                            x={rectX + tooltipWidth / 2}
                            y={tooltipRectY + padTop + (li + 1) * lineHeight - 3}
                            textAnchor="middle"
                            fontSize={10}
                            fill={ln.color || "white"}
                            fontWeight={ln.weight || 400}
                          >
                            {ln.text}
                          </text>
                        ))}
                      </g>
                    );
                  })()}
                  {/* Bar total label — drawn just above the bar when the
                      caller opted in. Used by the simplified stakeholder
                      view so each month's total conversions is legible
                      without hovering. */}
                  {showBarTotal && barH > 0 && total > 0 && (
                    <text
                      x={barX + barWidth / 2}
                      y={barY - 4}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill="#0f172a"
                    >
                      {formatValue(total)}
                    </text>
                  )}
                  {/* Month label */}
                  <text
                    x={i * (barSlotWidth + gap) + barSlotWidth / 2}
                    y={baseline + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#94a3b8"
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}

            {/* Conversion line + dots + labels — always above baseline */}
            {hasLine && (
              <>
                <polyline
                  points={data
                    .map((d, i) => {
                      const x = i * (barSlotWidth + gap) + barSlotWidth / 2;
                      const y = baseline - Math.max(((d.lineValue ?? 0) / maxLine) * chartHeight, 0);
                      return `${x},${y}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {data.map((d, i) => {
                  const x = i * (barSlotWidth + gap) + barSlotWidth / 2;
                  const y = baseline - Math.max(((d.lineValue ?? 0) / maxLine) * chartHeight, 0);
                  return (
                    <g key={`line-${i}`}>
                      <circle cx={x} cy={y} r={3} fill={lineColor} />
                      {d.lineValue != null && (
                        <text
                          x={x}
                          y={y - 7}
                          textAnchor="middle"
                          fontSize={9}
                          fill={lineColor}
                          fontWeight={600}
                        >
                          {d.lineValue}
                        </text>
                      )}
                    </g>
                  );
                })}
              </>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
