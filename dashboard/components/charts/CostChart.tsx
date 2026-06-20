'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

type CostChartProps = {
  data: { date: string; avg_cost: number }[];
};

function formatDate(d: string) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

function formatUsd(v: number) {
  if (v === 0) return '$0';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

export default function CostChart({ data }: CostChartProps) {
  const formatted = data.map((d) => ({ ...d, label: formatDate(d.date) }));

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
        >
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
            tickLine={false}
            axisLine={{ stroke: '#1f2937' }}
            minTickGap={24}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: 'Inter, sans-serif' }}
            tickLine={false}
            axisLine={{ stroke: '#1f2937' }}
            width={56}
            tickFormatter={formatUsd}
          />
          <Tooltip
            contentStyle={{
              background: '#13131c',
              border: '1px solid #1f2937',
              borderRadius: 8,
              color: '#f8fafc',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
            }}
            labelStyle={{ color: '#94a3b8' }}
            cursor={{ fill: '#818cf8', fillOpacity: 0.08 }}
            formatter={(value: number) => [formatUsd(value), 'Avg cost']}
          />
          <Bar dataKey="avg_cost" radius={[3, 3, 0, 0]}>
            {formatted.map((_, i) => (
              <Cell key={i} fill="#818cf8" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
