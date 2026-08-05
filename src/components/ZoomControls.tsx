"use client";

import React from "react";

interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onZoomFit,
}) => {
  return (
    <div className="zoomer" id="zoomer">
      <button
        id="zoom-in"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={onZoomIn}
      >
        +
      </button>
      <button
        id="zoom-out"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={onZoomOut}
      >
        −
      </button>
      <button
        id="zoom-fit"
        title="Show the whole city (or double-click the map)"
        aria-label="Fit whole city"
        onClick={onZoomFit}
      >
        ⤢
      </button>
    </div>
  );
};
