import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { scaleLinear } from "d3-scale";
import { line, curveMonotoneX } from "d3-shape";

type Point = { t: number; v: number };

function fmtValue(v: number) {
  return Math.round(v).toLocaleString();
}

export function PortfolioValueLineChart(props: {
  points: Point[];
  width: number;
  height: number;
}) {
  const { points, width, height } = props;
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const paddedPoints = useMemo(() => {
    const sorted = points.slice().sort((a, b) => a.t - b.t);

    if (sorted.length >= 2) return sorted;

    if (sorted.length === 1) {
      const p = sorted[0];
      const DAY = 24 * 60 * 60 * 1000;
      return [{ t: p.t - DAY, v: p.v }, p];
    }

    return [];
  }, [points]);

  const computed = useMemo(() => {
    if (paddedPoints.length < 2) return null;

    const P = 10;
    const plotW = Math.max(1, width - P * 2);
    const plotH = Math.max(1, height - P * 2);

    const xs = paddedPoints.map((p) => p.t);
    const ys = paddedPoints.map((p) => p.v);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    let minY = Math.min(...ys);
    let maxY = Math.max(...ys);

    // Prevent flat series from collapsing
    if (minY === maxY) {
      const pad = Math.max(1, Math.abs(minY) * 0.01);
      minY -= pad;
      maxY += pad;
    }

    const xScale = scaleLinear().domain([minX, maxX]).range([P, P + plotW]);
    const yScale = scaleLinear().domain([minY, maxY]).range([P + plotH, P]);

    const lineGen = line<Point>()
      .x((d: Point) => xScale(d.t))
      .y((d: Point) => yScale(d.v))
      .curve(curveMonotoneX);

    const path = lineGen(paddedPoints) ?? "";

    return { xScale, yScale, path };
  }, [paddedPoints, width, height]);

  if (!computed) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>
          Add purchases to see your value over time
        </Text>
      </View>
    );
  }

  const pickNearest = (x: number) => {
    const t = computed.xScale.invert(x);

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < paddedPoints.length; i++) {
      const d = Math.abs(paddedPoints[i].t - t);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    setActiveIdx(bestIdx);
  };

  const activePoint = activeIdx != null ? paddedPoints[activeIdx] : null;

  return (
    <View style={{ width }}>
      {activePoint && (
        <Text style={styles.tooltip}>{fmtValue(activePoint.v)}</Text>
      )}

      <Svg width={width} height={height}>
        {/* 🔥 Touch-capture layer (big hit area) */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          onPress={(e) => pickNearest(e.nativeEvent.locationX)}
          // drag scrub support
          onResponderMove={(e) => pickNearest(e.nativeEvent.locationX)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
        />

        <Path
          d={computed.path}
          stroke="#111"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {activePoint && (
          <Circle
            cx={computed.xScale(activePoint.t)}
            cy={computed.yScale(activePoint.v)}
            r={4}
            fill="#111"
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    opacity: 0.85,
  },
  empty: {
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.65,
    textAlign: "center",
  },
});
