"use client";

import React from "react";

interface HeaderProps {
  onOpenAbout: () => void;
  panelHidden: boolean;
  onTogglePanel: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAbout,
  panelHidden,
  onTogglePanel,
}) => {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo" aria-hidden="true" />
        <div className="brand-text">
          <h1>Transformer</h1>
          <p>A language model laid out interactively, one token at a time</p>
        </div>
      </div>
      <div className="top-actions">
        <button id="btn-about" className="ghost" onClick={onOpenAbout}>
          About &amp; accuracy
        </button>
        <button
          id="btn-panel"
          className="ghost"
          aria-expanded={!panelHidden}
          onClick={onTogglePanel}
        >
          {panelHidden ? "Show panel" : "Hide panel"}
        </button>
      </div>
    </header>
  );
};
