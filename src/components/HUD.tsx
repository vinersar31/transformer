"use client";

import React from "react";

interface HUDProps {
  mode: string;
  layer: number;
  layers: number;
  cacheSize: number;
  tripCount: number;
  fastForward: boolean;
  reading: boolean;
}

export const HUD: React.FC<HUDProps> = ({
  mode,
  layer,
  layers,
  cacheSize,
  tripCount,
  fastForward,
  reading,
}) => {
  return (
    <div className="hud" id="hud">
      <div className="hud-item">
        <span className="hud-k">Pass</span>
        <span className="hud-v" id="hud-mode">
          {mode}
        </span>
      </div>
      <div className="hud-item">
        <span className="hud-k">Layer</span>
        <span className="hud-v" id="hud-layer">
          {layer} / {layers}
        </span>
      </div>
      <div className="hud-item">
        <span className="hud-k">KV cache</span>
        <span className="hud-v" id="hud-cache">
          {cacheSize} tokens
        </span>
      </div>
      <div className="hud-item">
        <span className="hud-k">Generated</span>
        <span className="hud-v" id="hud-gen">
          {tripCount}
        </span>
      </div>
      {(fastForward || reading) && (
        <div className="hud-note" id="hud-note">
          {fastForward ? "fast-forwarding repeated layers" : "reading stop"}
        </div>
      )}
    </div>
  );
};
