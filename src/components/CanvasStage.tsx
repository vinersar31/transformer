"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera, renderScene, LabelInfo } from "@/lib/transformer/render";
import { Sim, leadPosition } from "@/lib/transformer/sim";
import { City, District } from "@/lib/transformer/city";
import { P, unproject } from "@/lib/transformer/iso";

interface CanvasStageProps {
  follow: boolean;
  showLabels: boolean;
  onSelectDistrict: (district: District) => void;
  cameraRef: React.MutableRefObject<Camera>;
}

export const CanvasStage: React.FC<CanvasStageProps> = ({
  follow,
  showLabels,
  onSelectDistrict,
  cameraRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [labels, setLabels] = useState<LabelInfo[]>([]);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const camStart = useRef({ x: 0, y: 0 });

  const fitCity = useCallback(() => {
    if (!canvasRef.current) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const pCenter = P(City.GW / 2, City.GH / 2, 0);
    cameraRef.current.x = -pCenter.x;
    cameraRef.current.y = -pCenter.y + 40;
    cameraRef.current.zoom = Math.min(w / 1400, h / 900) * 0.95;
    cameraRef.current.follow = false;
  }, [cameraRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    let lastT = performance.now();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;

      Sim.update(dt);

      if (cameraRef.current.follow) {
        const lead = leadPosition();
        const pLead = P(lead.x, lead.y, lead.z || 0);
        cameraRef.current.x += (-pLead.x - cameraRef.current.x) * 0.08;
        cameraRef.current.y += (-pLead.y - cameraRef.current.y) * 0.08;
      }

      const ctx = canvas.getContext("2d");
      if (ctx) {
        const newLabels = renderScene(
          ctx,
          canvas.width,
          canvas.height,
          cameraRef.current,
          showLabels,
          dt
        );
        setLabels(newLabels);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, [cameraRef, showLabels]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    camStart.current = { x: cameraRef.current.x, y: cameraRef.current.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.hypot(dx, dy) > 5) {
      cameraRef.current.follow = false;
    }
    cameraRef.current.x = camStart.current.x + dx;
    cameraRef.current.y = camStart.current.y + dy;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    cameraRef.current.zoom = Math.max(
      0.2,
      Math.min(3.5, cameraRef.current.zoom * factor)
    );
  };

  const handleDoubleClick = () => {
    fitCity();
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const cx = mx - (canvasRef.current.width / 2 + cameraRef.current.x);
    const cy = my - (canvasRef.current.height / 2 + cameraRef.current.y);

    const sx = cx / cameraRef.current.zoom;
    const sy = cy / cameraRef.current.zoom;

    const ground = unproject(sx, sy);

    for (let i = 0; i < City.districts.length; i++) {
      const d = City.districts[i];
      if (Math.hypot(ground.x - d.x, ground.y - d.y) <= d.r) {
        onSelectDistrict(d);
        return;
      }
    }
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        id="stage"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onClick={handleClick}
      />
      {showLabels && (
        <div id="labels-layer">
          {labels.map((lbl, idx) => (
            <div
              key={idx}
              className="district-label"
              style={{
                left: `${lbl.sx}px`,
                top: `${lbl.sy}px`,
                position: "fixed",
                transform: "translate(-50%, -100%)",
                pointerEvents: "none",
                fontSize: "11px",
                fontWeight: 600,
                color: lbl.color,
                background: "rgba(255,255,255,0.85)",
                padding: "2px 6px",
                borderRadius: "4px",
                whiteSpace: "nowrap",
              }}
            >
              {lbl.text}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
