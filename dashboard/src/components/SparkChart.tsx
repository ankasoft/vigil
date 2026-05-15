/** Thin recharts wrapper for one or more line series. */

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatTime } from '../utils';

export interface Series {
  key: string;
  color: string;
  name?: string;
  dashed?: boolean;
}

interface Props<T extends { ts: number }> {
  data: T[];
  series: Series[];
  yDomain?: [number | 'auto', number | 'auto'];
  unit?: string;
  height?: number;
}

export function SparkChart<T extends { ts: number }>(
  { data, series, yDomain, unit = '', height = 180 }: Props<T>,
) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
        <XAxis
          dataKey="ts"
          tickFormatter={(v) => formatTime(v as number)}
          tick={{ fontSize: 10 }}
          minTickGap={32}
          stroke="currentColor"
          opacity={0.4}
        />
        <YAxis
          domain={yDomain ?? ['auto', 'auto']}
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => `${v}${unit}`}
          width={36}
          stroke="currentColor"
          opacity={0.4}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(15,23,42,0.92)',
            border: 0,
            borderRadius: 8,
            color: '#fff',
            fontSize: 12,
          }}
          labelFormatter={(v) => formatTime(v as number)}
          formatter={(value: number, name: string) => [`${value}${unit}`, name]}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name ?? s.key}
            stroke={s.color}
            strokeDasharray={s.dashed ? '4 3' : undefined}
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
