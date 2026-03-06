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

  // Calculate bar spacing to fill full width
  const gap = data.length > 12 ? 4 : 6;
  const barSlotWidth = containerWidth > 0
    ? (containerWidth - gap * (data.length - 1)) / data.length
    : 48;
  const barWidth = Math.max(barSlotWidth * 0.65, 12);

  // Build line points based on actual container width
  const linePoints = hasLine && containerWidth > 0
    ? data
        .map((d, i) => {
          const x = i * (barSlotWidth + gap) + barSlotWidth / 2;
          const y = height - ((d.lineValue ?? 0) / maxLine) * (height - 30);
          return `${x},${y}`;
        })
        .join(" ")
    : "";

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

      {/* Chart area */}
      <div ref={containerRef} className="relative w-full">
        <div
          className="flex items-end justify-between w-full"
          style={{ height, gap }}
        >
          {data.map((d, i) => {
            const total = d.segments.reduce((s, seg) => s + seg.value, 0);
            return (
              <div
                key={i}
                className="flex flex-col items-center flex-1 min-w-0"
              >
                {/* Bar */}
                <div
                  className="rounded-t relative group cursor-default"
                  style={{
                    width: barWidth,
                    height: `${(total / maxBarTotal) * (height - 40)}px`,
                    minHeight: total > 0 ? 4 : 0,
                  }}
                >
                  {/* Stacked segments */}
                  <div className="absolute inset-0 flex flex-col-reverse rounded-t overflow-hidden">
                    {d.segments.map((seg, j) => (
                      <div
                        key={j}
                        style={{
                          height: total > 0 ? `${(seg.value / total) * 100}%` : "0%",
                          backgroundColor: seg.color,
                        }}
                      />
                    ))}
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-800 rounded px-2 py-1 text-xs text-white whitespace-nowrap shadow-lg">
                      {formatDollarsShort(total)}
                      {d.lineValue != null && ` / ${d.lineValue} conv`}
                    </div>
                  </div>
                </div>
                {/* Label */}
                <span className="mt-1.5 text-[10px] text-slate-400 truncate w-full text-center">
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Line overlay */}
        {hasLine && containerWidth > 0 && (
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={containerWidth}
            height={height}
            style={{ overflow: "visible" }}
          >
            <polyline
              points={linePoints}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {data.map((d, i) => {
              const x = i * (barSlotWidth + gap) + barSlotWidth / 2;
              const y = height - ((d.lineValue ?? 0) / maxLine) * (height - 30);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={lineColor}
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}
