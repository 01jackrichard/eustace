"use client";

import { motion } from "motion/react";
import { radarCssVars, useRadarStable } from "./radar-context";

export interface RadarLabelsProps {
  /** Distance from the chart edge. Default: 24 */
  offset?: number;
  /** Font size for labels. Default: 11 */
  fontSize?: number;
  /** Enable interactive hover on labels. Default: false */
  interactive?: boolean;
  /** Currently active / hovered metric key */
  activeMetricKey?: string | null;
  /** Callback when a metric label is hovered */
  onHoverMetric?: (metricKey: string | null) => void;
  /** Callback when a metric label is clicked */
  onMetricClick?: (metricKey: string) => void;
  /** Additional class name */
  className?: string;
}

export function RadarLabels({
  offset = 24,
  fontSize = 11,
  interactive = false,
  activeMetricKey = null,
  onHoverMetric,
  onMetricClick,
  className = "",
}: RadarLabelsProps) {
  const { metrics, radius, levels, getAngle, animate } = useRadarStable();

  // Label animation delay (starts after grid begins)
  const gridStagger = 0.08;
  const labelDelay = levels * gridStagger * 0.5;

  const labelRadius = radius + offset;

  return (
    <g className={className}>
      {metrics.map((metric, i) => {
        const angle = getAngle(i);
        const x = labelRadius * Math.cos(angle);
        const y = labelRadius * Math.sin(angle);
        const isActive = activeMetricKey === metric.key;

        return (
          <motion.g
            animate={{ opacity: 1, x, y }}
            initial={
              animate ? { opacity: 0, x: 0, y: 0 } : { opacity: 1, x, y }
            }
            key={`label-${metric.key}`}
            onClick={
              interactive && onMetricClick
                ? () => onMetricClick(metric.key)
                : undefined
            }
            onMouseEnter={
              interactive && onHoverMetric
                ? () => onHoverMetric(metric.key)
                : undefined
            }
            onMouseLeave={
              interactive && onHoverMetric ? () => onHoverMetric(null) : undefined
            }
            transition={{
              opacity: {
                duration: 0.5,
                delay: animate ? labelDelay + i * 0.08 : 0,
              },
              x: { type: "spring", stiffness: 80, damping: 15 },
              y: { type: "spring", stiffness: 80, damping: 15 },
            }}
          >
            <text
              className={
                interactive
                  ? "cursor-pointer transition-all duration-150 select-none hover:opacity-100"
                  : "select-none"
              }
              dominantBaseline="middle"
              fontSize={fontSize}
              fontWeight={isActive ? 700 : 500}
              opacity={isActive ? 1 : interactive ? 0.8 : 0.85}
              style={{
                fill: isActive ? "#ffffff" : radarCssVars.label,
              }}
              textAnchor="middle"
              x={0}
              y={0}
            >
              {metric.label}
            </text>
          </motion.g>
        );
      })}
    </g>
  );
}

RadarLabels.displayName = "RadarLabels";

export default RadarLabels;
