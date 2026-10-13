"use client";
import React, { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";

export interface CausalEdgeData extends Record<string, unknown> {
  id: string;
  edgeType: "causes" | "alliance" | "secret";
  whyText: string;
  watchEp: number;
  isWhyMode: boolean;
  isSelected: boolean;
}

export type CausalFlowEdge = Edge<CausalEdgeData, "causal">;

export const CausalFlowEdgeComponent = memo(function CausalFlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<CausalFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeType = data?.edgeType ?? "causes";
  const isSelected = selected || data?.isSelected;
  const isWhyMode = data?.isWhyMode;

  let strokeColor = "var(--ink)";
  let strokeDash = undefined;
  let strokeWidth = 2;

  if (edgeType === "alliance") {
    strokeColor = "var(--lane-marley_military)";
    strokeWidth = 3;
  } else if (edgeType === "secret") {
    strokeColor = "var(--hides)";
    strokeDash = "4 4";
    strokeWidth = 2;
  }

  if (isSelected || isWhyMode) {
    strokeColor = "var(--signal)";
    strokeWidth = 3.5;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: strokeDash,
          filter: isWhyMode || isSelected ? "drop-shadow(0 0 8px rgba(240, 194, 75, 0.7))" : undefined,
          transition: "stroke 0.2s, stroke-width 0.2s",
        }}
      />
      {isSelected && data?.whyText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="flow-edge-why-tooltip"
          >
            {data.whyText}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
