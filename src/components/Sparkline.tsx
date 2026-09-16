"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

export function Sparkline({ values, color = "var(--series-1)" }: { values: number[]; color?: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-9 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 200, height: 36 }}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
