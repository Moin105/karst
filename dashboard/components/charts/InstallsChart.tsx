'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type InstallsChartProps = {
  data: { date: string; count: number }[];
};

function formatDate(d: string) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

export default function InstallsChart({ data }: InstallsChartProps) {
  const formatted = data.map((d) => ({ ...d, label: formatDate(d.date) }));

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={formatted}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="installsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
            tickLine={false}
            axisLine={{ stroke: '#1f2937' }}
            minTickGap={24}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'Inter, sans-serif' }}
            tickLine={false}
            axisLine={{ stroke: '#1f2937' }}
            allowDecimals={false}
            width={32}
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
            cursor={{ stroke: '#34d399', strokeOpacity: 0.3 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#34d399"
            strokeWidth={2}
            fill="url(#installsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
