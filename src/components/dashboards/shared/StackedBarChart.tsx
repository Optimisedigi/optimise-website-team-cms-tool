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
}

function formatDollarsShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

export function StackedBarChart({
  data,
  lineLabel = "Conversions",
  lineColor = "#3b82f6",
  height = 220,
}: StackedBarChartProps) {
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
                  {/* Top rounded cap on the full bar */}
                  {barH > 0 && (
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={Math.min(6, barH)}
                      fill={d.segments[d.segments.length - 1]?.color || d.segments[0]?.color}
                      rx={3}
                      ry={3}
                    />
                  )}
                  {/* Tooltip — clamped so it never escapes the top of the SVG */}
                  {hoveredBar === i && (() => {
                    const tooltipRectY = Math.max(barY - 28, 2);
                    const tooltipTextY = tooltipRectY + 13;
                    return (
                      <g>
                        <rect
                          x={i * (barSlotWidth + gap) + barSlotWidth / 2 - 40}
                          y={tooltipRectY}
                          width={80}
                          height={20}
                          rx={4}
                          fill="#1e293b"
                        />
                        <text
                          x={i * (barSlotWidth + gap) + barSlotWidth / 2}
                          y={tooltipTextY}
                          textAnchor="middle"
                          fontSize={10}
                          fill="white"
                        >
                          {formatDollarsShort(total)}
                          {d.lineValue != null ? ` / ${d.lineValue} conv` : ""}
                        </text>
                      </g>
                    );
                  })()}
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
