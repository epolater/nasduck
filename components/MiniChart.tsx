import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { COLORS } from '../constants';

interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function MiniChart({ data, width = 80, height = 32, color }: Props) {
  if (!data || data.length < 2) return <View style={{ width, height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const isPositive = data[data.length - 1] >= data[0];
  const lineColor = color ?? (isPositive ? COLORS.positive : COLORS.negative);

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
