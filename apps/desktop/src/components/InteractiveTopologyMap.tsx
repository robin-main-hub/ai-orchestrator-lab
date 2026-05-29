import React, { useState, useEffect, useRef, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDebateStore, type RoundNodeInfo } from "../store/useDebateStore";
import { cn } from "@/lib/utils";

type Node = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  info: RoundNodeInfo;
  fx?: number | null;
  fy?: number | null;
};

type Link = {
  source: string;
  target: string;
};

export type InteractiveTopologyMapProps = {
  sessionId: string;
  onSelectRound: (roundId: string) => void;
  currentRoundId?: string;
};

export function InteractiveTopologyMap({
  sessionId,
  onSelectRound,
  currentRoundId,
}: InteractiveTopologyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Subscribe to debate store nodes
  const roundNodes = useDebateStore(
    useShallow((state) => state.roundNodes[sessionId] ?? [])
  );

  const [nodes, setNodes] = useState<Node[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  const startPanOffsetRef = useRef({ x: 0, y: 0 });
  const nodesRef = useRef<Node[]>([]);

  // Links are sequential round steps (Node i-1 -> Node i)
  const links = useMemo<Link[]>(() => {
    const res: Link[] = [];
    for (let i = 1; i < roundNodes.length; i++) {
      const prev = roundNodes[i - 1];
      const curr = roundNodes[i];
      if (prev && curr) {
        res.push({ source: prev.id, target: curr.id });
      }
    }
    return res;
  }, [roundNodes]);

  // Initialize nodes in a circle or spiral layout
  useEffect(() => {
    const width = containerRef.current?.clientWidth ?? 600;
    const height = containerRef.current?.clientHeight ?? 500;
    const centerX = width / 2;
    const centerY = height / 2;

    const initialNodes = roundNodes.map((node, index) => {
      const angle = (index / (roundNodes.length || 1)) * 2 * Math.PI;
      const radius = 100 + index * 15;
      return {
        id: node.id,
        x: centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 10,
        y: centerY + Math.sin(angle) * radius + (Math.random() - 0.5) * 10,
        vx: 0,
        vy: 0,
        info: node,
      };
    });

    setNodes(initialNodes);
    nodesRef.current = initialNodes;
  }, [roundNodes]);

  // Simulation physics loop (Force-directed graph)
  useEffect(() => {
    let animId: number;
    const width = containerRef.current?.clientWidth ?? 600;
    const height = containerRef.current?.clientHeight ?? 500;
    const centerX = width / 2;
    const centerY = height / 2;

    const tick = () => {
      const currentNodes = [...nodesRef.current];
      if (currentNodes.length === 0) {
        animId = requestAnimationFrame(tick);
        return;
      }

      // Physics Constants
      const kRepulsion = 1500; // Coulomb repulsion constant
      const kAttraction = 0.04; // Hooke spring attraction
      const kGravity = 0.015; // Pull to center
      const friction = 0.85;

      // 1. Repulsion (Push nodes away from each other)
      for (let i = 0; i < currentNodes.length; i++) {
        const nodeA = currentNodes[i]!;
        for (let j = i + 1; j < currentNodes.length; j++) {
          const nodeB = currentNodes[j]!;
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const distSq = dx * dx + dy * dy + 0.1;
          const dist = Math.sqrt(distSq);

          if (dist < 300) {
            const force = kRepulsion / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            nodeA.vx -= fx;
            nodeA.vy -= fy;
            nodeB.vx += fx;
            nodeB.vy += fy;
          }
        }
      }

      // 2. Attraction (Spring forces between linked nodes)
      for (const link of links) {
        const sourceNode = currentNodes.find((n) => n.id === link.source);
        const targetNode = currentNodes.find((n) => n.id === link.target);

        if (sourceNode && targetNode) {
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const desiredDist = 90; // Natural spring length
          const force = (dist - desiredDist) * kAttraction;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          sourceNode.vx += fx;
          sourceNode.vy += fy;
          targetNode.vx -= fx;
          targetNode.vy -= fy;
        }
      }

      // 3. Gravity and Update positions
      for (const node of currentNodes) {
        if (node.fx !== undefined && node.fx !== null && node.fy !== undefined && node.fy !== null) {
          // Dragged node fixed position
          node.x = node.fx;
          node.y = node.fy;
          node.vx = 0;
          node.vy = 0;
        } else {
          // Gravity pull to center
          node.vx += (centerX - node.x) * kGravity;
          node.vy += (centerY - node.y) * kGravity;

          // Apply velocity
          node.vx *= friction;
          node.vy *= friction;
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      setNodes([...currentNodes]);
      nodesRef.current = currentNodes;
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [links]);

  // Mouse pan event handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.target === svgRef.current) {
      setIsPanning(true);
      startPanOffsetRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const width = containerRef.current?.clientWidth ?? 600;
    const height = containerRef.current?.clientHeight ?? 500;
    const centerX = width / 2;
    const centerY = height / 2;

    if (isPanning) {
      setPan({
        x: e.clientX - startPanOffsetRef.current.x,
        y: e.clientY - startPanOffsetRef.current.y,
      });
    } else if (draggedNodeId) {
      // Translate screen coordinates back into SVG canvas coordinates
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;
        const canvasX = (rawX - pan.x) / zoom;
        const canvasY = (rawY - pan.y) / zoom;

        nodesRef.current = nodesRef.current.map((n) => {
          if (n.id === draggedNodeId) {
            return { ...n, fx: canvasX, fy: canvasY, x: canvasX, y: canvasY };
          }
          return n;
        });
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    if (draggedNodeId) {
      nodesRef.current = nodesRef.current.map((n) => {
        if (n.id === draggedNodeId) {
          return { ...n, fx: null, fy: null };
        }
        return n;
      });
      setDraggedNodeId(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(0.3, Math.min(3, newZoom)));
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggedNodeId(nodeId);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[400px] border border-border/20 rounded-lg overflow-hidden bg-[#0a0f12]/80 backdrop-blur-md shadow-inner flex flex-col justify-end"
    >
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 text-[9px] text-muted-foreground bg-card/60 backdrop-blur border border-border/15 p-2 rounded shadow-sm">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_6px_var(--success)]" />합의 (Agreement)</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-warning shadow-[0_0_6px_var(--warning)]" />대립 (Conflict)</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-destructive shadow-[0_0_6px_var(--destructive)]" />보안 리스크 (Risk)</span>
        <span className="text-[8px] text-muted-foreground/60 mt-1 italic">드래그: 노드 이동 / 휠: 줌 / 배경 드래그: 팬</span>
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Glow Filters for Premium Aesthetic */}
        <defs>
          <filter id="glow-success" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-warning" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-destructive" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Link paths */}
          {links.map((link, idx) => {
            const src = nodes.find((n) => n.id === link.source);
            const tgt = nodes.find((n) => n.id === link.target);
            if (!src || !tgt) return null;

            return (
              <line
                key={`link_${idx}`}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                className="stroke-border/40 stroke-[2] stroke-dasharray-[5,5]"
                style={{
                  strokeDasharray: "5 5",
                }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const isActive = currentRoundId === node.id;
            const isAgreement = node.info.type === "agreement";
            const isConflict = node.info.type === "conflict";
            const isRisk = node.info.type === "risk";

            const fillClass = cn(
              "stroke-2 cursor-pointer transition-colors duration-200",
              isAgreement && "fill-success/20 stroke-success hover:fill-success/35",
              isConflict && "fill-warning/20 stroke-warning hover:fill-warning/35",
              isRisk && "fill-destructive/20 stroke-destructive hover:fill-destructive/35"
            );

            const glowFilter = isAgreement
              ? "url(#glow-success)"
              : isConflict
              ? "url(#glow-warning)"
              : "url(#glow-destructive)";

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => onSelectRound(node.id)}
              >
                {/* Visual Glow Layer for Active node */}
                {isActive && (
                  <circle
                    r={24}
                    className={cn(
                      "fill-none stroke-2 animate-ping",
                      isAgreement && "stroke-success/40",
                      isConflict && "stroke-warning/40",
                      isRisk && "stroke-destructive/40"
                    )}
                  />
                )}

                {/* Primary Circle */}
                <circle
                  r={isActive ? 18 : 14}
                  className={fillClass}
                  style={{
                    filter: isActive ? glowFilter : undefined,
                  }}
                />

                {/* Node Label Text */}
                <text
                  y={isActive ? 32 : 26}
                  className="fill-foreground font-semibold text-[8px] text-center"
                  textAnchor="middle"
                >
                  {node.info.title.length > 10
                    ? `${node.info.title.slice(0, 8)}...`
                    : node.info.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
