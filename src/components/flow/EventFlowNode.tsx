"use client";
import React, { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

export interface EventNodeData extends Record<string, unknown> {
  id: string;
  title: string;
  watchEp: number;
  tier: number;
  lane: string | null;
  laneLabel: string;
  isFlashback: boolean;
  confidence: "shown" | "implied" | "interpretation";
  summary: string | null;
  selected: boolean;
  isFocus: boolean;
  isDimmed: boolean;
}

export type EventFlowNode = Node<EventNodeData, "event">;

export const EventFlowNodeComponent = memo(function EventFlowNodeComponent({
  data,
  selected,
}: NodeProps<EventFlowNode>) {
  const isSelected = selected || data.selected;
  const laneColor = `var(--lane-${data.lane}, var(--lane-default))`;

  return (
    <div
      className={`flow-node-event ${isSelected ? "selected" : ""} ${
        data.tier === 1 ? "tier-1" : "tier-2"
      } ${data.isDimmed ? "dimmed" : ""} ${data.isFocus ? "in-focus" : ""}`}
      style={{
        borderColor: isSelected ? "var(--signal)" : laneColor,
        boxShadow: isSelected
          ? "0 0 24px rgba(240, 194, 75, 0.45), 0 4px 16px rgba(0,0,0,0.6)"
          : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />

      {/* Header bar */}
      <div className="flow-node-header">
        <span className="flow-ep-badge" style={{ backgroundColor: laneColor }}>
          Ep {data.watchEp}
        </span>
        {data.isFlashback && (
          <span className="flow-badge-flashback" title="Flashback event">
            ↺ Flashback
          </span>
        )}
        {data.confidence === "interpretation" && (
          <span className="flow-badge-theory" title="Fan theory / interpretation">
            Theory
          </span>
        )}
        <span className="flow-lane-tag">{data.laneLabel}</span>
      </div>

      {/* Title */}
      <h4 className="flow-node-title">{data.title}</h4>

      {/* Summary preview on Tier 1 */}
      {data.tier === 1 && data.summary && (
        <p className="flow-node-summary">{data.summary}</p>
      )}

      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
});
