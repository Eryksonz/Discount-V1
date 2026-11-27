"use client";

import { formatCurrency } from "@/lib/utils";

interface PriceSparklineProps {
  points: Array<{ priceCents: number; capturedAt: string }>;
  median90dCents: number;
  low90dCents: number;
  currentPriceCents: number;
  dealLabel: string;
}

/**
 * Bloomberg-style mini 90-day step price sparkline with a dashed 90-day median benchmark line.
 */
export function PriceSparkline({
  points,
  median90dCents,
  low90dCents,
  currentPriceCents,
  dealLabel,
}: PriceSparklineProps) {
  const width = 220;
  const height = 46;
  const padX = 4;
  const padY = 6;

  const series =
    points.length > 0
      ? points
      : [{ priceCents: currentPriceCents, capturedAt: new Date().toISOString() }];

  // Append synthetic "today" endpoint so the step line extends cleanly to the right edge
  const lastPoint = series[series.length - 1];
  const nowMs = Math.max(Date.now(), new Date(lastPoint.capturedAt).getTime() + 1000);
  const extended = [
    ...series.map((p) => ({ priceCents: p.priceCents, t: new Date(p.capturedAt).getTime() })),
    { priceCents: currentPriceCents, t: nowMs },
  ];

  const minT = extended[0].t;
  const maxT = Math.max(extended[extended.length - 1].t, minT + 1);

  const allPrices = [...extended.map((p) => p.priceCents), median90dCents, low90dCents];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const spanP = Math.max(maxP - minP, 500); // at least $5 vertical range so flat lines stay centered

  const toX = (t: number) => padX + ((t - minT) / (maxT - minT)) * (width - padX * 2);
  const toY = (price: number) =>
    padY + (1 - (price - (minP - spanP * 0.12)) / (spanP * 1.24)) * (height - padY * 2);

  // Build crisp step-chart path (prices hold constant until next snapshot)
  const stepParts: string[] = [];
  for (let i = 0; i < extended.length; i++) {
    const x = toX(extended[i].t);
    const y = toY(extended[i].priceCents);
    if (i === 0) {
      stepParts.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
    } else {
      const prevY = toY(extended[i - 1].priceCents);
      stepParts.push(`L ${x.toFixed(1)} ${prevY.toFixed(1)}`);
      stepParts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  }

  const linePath = stepParts.join(" ");
  const medianY = toY(median90dCents);
  const endX = toX(extended[extended.length - 1].t);
  const endY = toY(currentPriceCents);

  const isPositiveDeal =
    dealLabel === "Lowest in 90 days" || dealLabel === "Real deal";
  const strokeColor = isPositiveDeal ? "#14532D" : "#1B365D";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between font-mono text-[10px] text-[#6B7684] mb-1">
        <span>90D PRICE TAPE</span>
        <span className="tabular-nums">
          LOW {formatCurrency(low90dCents)} · MED {formatCurrency(median90dCents)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-11 overflow-visible rounded bg-[#FAF8F3] border border-[#E8E2D6]"
        role="img"
        aria-label={`90-day price chart. Current ${formatCurrency(currentPriceCents)}, 90-day median ${formatCurrency(median90dCents)}, 90-day low ${formatCurrency(low90dCents)}`}
      >
        {/* Dashed 90-day median benchmark */}
        <line
          x1={padX}
          y1={medianY}
          x2={width - padX}
          y2={medianY}
          stroke="#B8924A"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {/* Step price trajectory */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {/* Current price terminal marker */}
        <circle
          cx={endX}
          cy={endY}
          r="3.2"
          fill={isPositiveDeal ? "#14532D" : "#0F1D32"}
          stroke="#FFFFFF"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}
