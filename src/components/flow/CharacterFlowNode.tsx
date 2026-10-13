"use client";
import React, { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";

export interface CharacterNodeData extends Record<string, unknown> {
  id: string;
  title: string;
  watchEp: number;
  lane: string | null;
  laneLabel: string;
  stateRing: string | null;
  selected: boolean;
  isFocus: boolean;
  isDimmed: boolean;
}

export type CharacterFlowNode = Node<CharacterNodeData, "character">;

export const CharacterFlowNodeComponent = memo(function CharacterFlowNodeComponent({
  data,
  selected,
}: NodeProps<CharacterFlowNode>) {
  const isSelected = selected || data.selected;
  const laneColor = `var(--lane-${data.lane}, var(--lane-default))`;

  return (
    <div
      className={`flow-node-character ${isSelected ? "selected" : ""} ${
        data.isDimmed ? "dimmed" : ""
      } ${data.isFocus ? "in-focus" : ""}`}
      style={{
        borderColor: isSelected ? "var(--signal)" : laneColor,
      }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />

      <div
        className="flow-char-avatar"
        style={{ backgroundColor: laneColor }}
      >
        <span className="flow-char-initial">{data.title[0]}</span>
      </div>

      <div className="flow-char-meta">
        <span className="flow-char-name">{data.title}</span>
        <span className="flow-char-lane">{data.laneLabel}</span>
      </div>

      {data.stateRing && (
        <span className={`flow-state-indicator st-${data.stateRing}`} title={data.stateRing}>
          ●
        </span>
      )}

      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
});
