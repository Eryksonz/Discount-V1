"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface SnapshotInput {
  priceCents: number;
  originalPriceCents?: number;
  capturedAt: string;
}

interface PriceHistoryChartProps {
  snapshots: SnapshotInput[];
  currentPriceCents: number;
  median90dCents: number;
  low90dCents: number;
  historyDays: number;
}

export function PriceHistoryChart({
  snapshots,
  currentPriceCents,
  median90dCents,
  low90dCents,
  historyDays,
}: PriceHistoryChartProps) {
  const baseSeries =
    snapshots.length > 0
      ? snapshots
      : [{ priceCents: currentPriceCents, capturedAt: new Date().toISOString() }];

  // Extend step line cleanly through current moment
  const nowIso = new Date().toISOString();
  const chartData = [
    ...baseSeries.map((s) => ({
      ts: new Date(s.capturedAt).getTime(),
      label: new Date(s.capturedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      price: s.priceCents / 100,
      brandListed: s.originalPriceCents ? s.originalPriceCents / 100 : undefined,
    })),
    {
      ts: Date.now(),
      label: "Now",
      price: currentPriceCents / 100,
      brandListed: baseSeries[baseSeries.length - 1]?.originalPriceCents
        ? baseSeries[baseSeries.length - 1].originalPriceCents! / 100
        : undefined,
      capturedAt: nowIso,
    },
  ];

  const allValues = [
    ...chartData.map((d) => d.price),
    median90dCents / 100,
    low90dCents / 100,
  ];
  const minVal = Math.max(0, Math.floor(Math.min(...allValues) * 0.85));
  const maxVal = Math.ceil(Math.max(...allValues) * 1.12);

  return (
    <div className="rounded-lg border border-[#E2DCD0] bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEAE0] pb-2.5">
        <div>
          <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-[#0F1D32]">
            90-Day Price History (Step Chart)
          </h2>
          <p className="text-[11px] text-[#5C6776] mt-0.5">
            {historyDays < 21
              ? `Building price history (${historyDays}/21 days tracked). Snapshots log on every price or stock change.`
              : `Benchmarked against ${historyDays} days of stored price snapshots.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-[#0F1D32]">
            <span className="h-0.5 w-4 bg-[#0F1D32] inline-block" />
            Tracked Price
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#9A742B]">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-[#B8924A] inline-block" />
            90d Median ({formatCurrency(median90dCents)})
          </span>
          <span className="inline-flex items-center gap-1.5 text-[#14532D]">
            <span className="h-0.5 w-4 border-t-2 border-dotted border-[#14532D] inline-block" />
            90d Low ({formatCurrency(low90dCents)})
          </span>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EFEAE0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#5C6776", fontFamily: "monospace" }}
              stroke="#D8D0C0"
            />
            <YAxis
              domain={[minVal, maxVal]}
              tickFormatter={(v) => `$${v}`}
              tick={{ fontSize: 11, fill: "#5C6776", fontFamily: "monospace" }}
              stroke="#D8D0C0"
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0F1D32",
                borderColor: "#B8924A",
                borderRadius: "6px",
                color: "#FAF8F3",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
              formatter={(value: unknown, name: unknown) => [
                `$${Number(value).toFixed(2)}`,
                name === "price" ? "Tracked Price" : "Brand-listed",
              ]}
            />
            <ReferenceLine
              y={median90dCents / 100}
              stroke="#B8924A"
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <ReferenceLine
              y={low90dCents / 100}
              stroke="#14532D"
              strokeDasharray="2 3"
              strokeWidth={1.5}
            />
            <Line
              type="stepAfter"
              dataKey="price"
              stroke="#0F1D32"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: "#0F1D32", stroke: "#FFFFFF", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#14532D" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
