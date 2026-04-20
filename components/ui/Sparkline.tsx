"use client";

interface SparklineProps {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Show a filled area under the line */
  area?: boolean;
  className?: string;
}

/**
 * Tiny inline sparkline. Use inside KPI cards / platform cards.
 * Keeps the last-point dot as a visual anchor.
 */
export function Sparkline({
  values,
  color = "currentColor",
  width = 90,
  height = 26,
  strokeWidth = 1.5,
  area = false,
  className,
}: SparklineProps) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i): [number, number] => [
    (i / (values.length - 1)) * width,
    height - ((v - min) / range) * height,
  ]);
  const linePath = "M" + pts.map((p) => p.join(",")).join(" L");
  const last = pts[pts.length - 1];
  const areaPath = area ? `${linePath} L ${width},${height} L 0,${height} Z` : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      {areaPath && <path d={areaPath} fill={color} opacity="0.12" />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
}
