"use client";
import React, { useMemo, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useTimelineStore } from "@/store/timelineStore";
import { EventFlowNodeComponent } from "./EventFlowNode";
import { CharacterFlowNodeComponent } from "./CharacterFlowNode";
import { CausalFlowEdgeComponent } from "./CausalFlowEdge";
import { laneOfCharacter, stateAt, whyTrace, connected } from "@/lib/lenses";
import { playEtherealPulse } from "@/lib/sound";

const nodeTypes = {
  event: EventFlowNodeComponent,
  character: CharacterFlowNodeComponent,
};

const edgeTypes = {
  causal: CausalFlowEdgeComponent,
};

function FlowCanvasInternal() {
  const { setCenter, fitView } = useReactFlow();

  const graph = useTimelineStore((state) => state.graph);
  const cursor = useTimelineStore((state) => state.cursor);
  const progress = useTimelineStore((state) => state.progress);
  const lens = useTimelineStore((state) => state.lens);
  const selectedNodeId = useTimelineStore((state) => state.selectedNodeId);
  const selectedCharId = useTimelineStore((state) => state.selectedCharId);
  const fact = useTimelineStore((state) => state.fact);
  const edgeLayers = useTimelineStore((state) => state.edgeLayers);
  const selectNode = useTimelineStore((state) => state.selectNode);
  const selectChar = useTimelineStore((state) => state.selectChar);

  // Layout calculations
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph) return { flowNodes: [], flowEdges: [] };

    const laneIndexMap = new Map<string, number>();
    graph.lanes.forEach((l, i) => laneIndexMap.set(l.id, i));

    // Why Mode and Focus sets
    let focusNodes: Set<string> | null = null;
    let whyEdges: Set<string> = new Set();

    if (lens === "why" && selectedNodeId) {
      const trace = whyTrace(graph, selectedNodeId, graph.theories);
      focusNodes = new Set([selectedNodeId, ...trace.causes, ...trace.effects]);
      trace.edges.forEach((e) => whyEdges.add(e.id));
    } else if (selectedNodeId) {
      focusNodes = connected(graph, selectedNodeId);
    }

    const visibleEvents = graph.nodes.filter(
      (n) => n.type === "event" && n.watchEp <= cursor
    );

    // Group by (lane, watchEp) to avoid perfect overlaps
    const laneEpCounts = new Map<string, number>();
    const nodesList: Node[] = [];

    for (const evt of visibleEvents) {
      const laneId = evt.lane ?? "default";
      const laneIdx = laneIndexMap.get(laneId) ?? 0;
      const countKey = `${laneId}-${evt.watchEp}`;
      const duplicateCount = laneEpCounts.get(countKey) ?? 0;
      laneEpCounts.set(countKey, duplicateCount + 1);

      const x = (evt.watchEp - 1) * 280 + 60;
      const y = laneIdx * 160 + 60 + duplicateCount * 36;
      const isSelected = selectedNodeId === evt.id;
      const isFocus = focusNodes ? focusNodes.has(evt.id) : true;

      nodesList.push({
        id: evt.id,
        type: "event",
        position: { x, y },
        data: {
          id: evt.id,
          title: evt.title,
          watchEp: evt.watchEp,
          tier: evt.tier,
          lane: evt.lane,
          laneLabel: graph.lanes.find((l) => l.id === evt.lane)?.label ?? laneId,
          isFlashback: evt.isFlashback,
          confidence: evt.confidence,
          summary: evt.summary,
          selected: isSelected,
          isFocus,
          isDimmed: focusNodes ? !isFocus : false,
        },
      });
    }

    // Add Characters visible up to cursor
    if (lens === "character" || lens === "who_knows") {
      const visibleChars = graph.nodes.filter(
        (n) => n.type === "character" && n.watchEp <= cursor
      );

      visibleChars.forEach((ch, i) => {
        const currentLane = laneOfCharacter(graph, ch.id, cursor);
        const laneIdx = laneIndexMap.get(currentLane ?? "") ?? 0;
        const ring =
          lens === "who_knows" && fact
            ? stateAt(graph, ch.id, fact, cursor)
            : null;

        const x = (cursor - 1) * 280 + 80 + (i % 4) * 55;
        const y = laneIdx * 160 + 115;
        const isSelected = selectedCharId === ch.id;

        nodesList.push({
          id: ch.id,
          type: "character",
          position: { x, y },
          data: {
            id: ch.id,
            title: ch.title,
            watchEp: ch.watchEp,
            lane: currentLane,
            laneLabel: graph.lanes.find((l) => l.id === currentLane)?.label ?? "",
            stateRing: ring,
            selected: isSelected,
            isFocus: true,
            isDimmed: false,
          },
        });
      });
    }

    // Calculate Edges
    const visibleNodeIds = new Set(nodesList.map((n) => n.id));
    const edgesList: Edge[] = [];

    const visibleEdges = graph.edges.filter(
      (e) =>
        e.watchEp <= cursor &&
        edgeLayers.includes(e.type) &&
        visibleNodeIds.has(e.from) &&
        visibleNodeIds.has(e.to)
    );

    for (const e of visibleEdges) {
      const isWhyEdge = whyEdges.has(e.id);
      const isSelected =
        selectedNodeId === e.from || selectedNodeId === e.to || isWhyEdge;

      edgesList.push({
        id: e.id,
        source: e.from,
        target: e.to,
        type: "causal",
        data: {
          id: e.id,
          edgeType: e.type,
          whyText: e.whyText,
          watchEp: e.watchEp,
          isWhyMode: isWhyEdge,
          isSelected,
        },
      });
    }

    return { flowNodes: nodesList, flowEdges: edgesList };
  }, [graph, cursor, lens, selectedNodeId, selectedCharId, fact, edgeLayers]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
  }, [flowNodes, setNodes]);

  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  // Center camera on active node or cursor position smoothly
  const prevCenterEp = useRef<number | null>(null);
  useEffect(() => {
    if (selectedNodeId) {
      const activeNode = flowNodes.find((n) => n.id === selectedNodeId);
      if (activeNode) {
        setCenter(activeNode.position.x + 120, activeNode.position.y + 40, {
          duration: 600,
          zoom: 1.1,
        });
        return;
      }
    }

    if (prevCenterEp.current !== cursor) {
      prevCenterEp.current = cursor;
      const targetX = (cursor - 1) * 280 + 140;
      setCenter(targetX, 350, { duration: 500 });
    }
  }, [cursor, selectedNodeId, flowNodes, setCenter]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      playEtherealPulse();
      if (node.type === "character") {
        selectChar(node.id === selectedCharId ? null : node.id);
      } else {
        selectNode(node.id === selectedNodeId ? null : node.id);
      }
    },
    [selectedNodeId, selectedCharId, selectNode, selectChar]
  );

  return (
    <div className="flow-canvas-wrapper" style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        minZoom={0.2}
        maxZoom={2.5}
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="rgba(147, 169, 177, 0.22)"
        />
        <Controls showInteractive={false} className="flow-controls-custom" />
        <MiniMap
          nodeColor={(n) => (n.type === "character" ? "var(--signal)" : "var(--dim)")}
          maskColor="rgba(13, 27, 36, 0.75)"
          className="flow-minimap-custom"
        />
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInternal />
    </ReactFlowProvider>
  );
}
