"use client";

import React, { useState } from "react";
import { SimState } from "@/lib/transformer/sim";

interface ControlDockProps {
  state: SimState;
  prompt: string;
  onPromptChange: (val: string) => void;
  onRun: () => void;
  onPlayPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onLayersChange: (layers: number) => void;
  onTempChange: (temp: number) => void;
  onTopPChange: (topP: number) => void;
  onFollowToggle: (follow: boolean) => void;
  onLabelsToggle: (labels: boolean) => void;
  follow: boolean;
  labels: boolean;
}

export const ControlDock: React.FC<ControlDockProps> = ({
  state,
  prompt,
  onPromptChange,
  onRun,
  onPlayPause,
  onStep,
  onReset,
  onSpeedChange,
  onLayersChange,
  onTempChange,
  onTopPChange,
  onFollowToggle,
  onLabelsToggle,
  follow,
  labels,
}) => {
  const [tuneOpen, setTuneOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRun();
  };

  return (
    <footer className="dock" id="dock">
      <form className="dock-row dock-prompt" onSubmit={handleSubmit}>
        <label className="field grow">
          <span>Prompt</span>
          <input
            id="prompt"
            type="text"
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            maxLength={120}
            spellCheck={false}
          />
        </label>
        <button id="btn-run" type="submit" className="primary">
          Run
        </button>
      </form>

      <div className="dock-row">
        <div className="group transport">
          <button
            id="btn-play"
            className="icon"
            title="Play / pause (space)"
            onClick={onPlayPause}
          >
            <span id="play-glyph">{state.paused ? "▶" : "❚❚"}</span>
          </button>
          <button
            id="btn-step"
            className="icon"
            title="Next stage (S)"
            onClick={onStep}
          >
            ⇥
          </button>
          <button
            id="btn-reset"
            className="icon"
            title="Reset and replay the slow tour (R)"
            onClick={onReset}
          >
            ⟲
          </button>
        </div>

        <button
          id="btn-tune"
          className="icon"
          title="Show settings"
          aria-expanded={tuneOpen}
          aria-controls="dock-tune"
          onClick={() => setTuneOpen(!tuneOpen)}
        >
          ⚙
        </button>

        <div className={`dock-tune ${tuneOpen ? "open" : ""}`} id="dock-tune">
          <label className="field slider">
            <span>
              Speed <b id="v-speed">{state.speed.toFixed(1)}×</b>
            </span>
            <input
              id="speed"
              type="range"
              min="0.4"
              max="8"
              step="0.05"
              value={state.speed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            />
          </label>

          <label className="field slider">
            <span>
              Layers <b id="v-layers">{state.layers}</b>
            </span>
            <input
              id="layers"
              type="range"
              min="2"
              max="12"
              step="1"
              value={state.layers}
              onChange={(e) => onLayersChange(parseInt(e.target.value, 10))}
            />
          </label>

          <label className="field slider">
            <span>
              Temperature <b id="v-temp">{state.temperature.toFixed(2)}</b>
            </span>
            <input
              id="temp"
              type="range"
              min="0.05"
              max="1.6"
              step="0.05"
              value={state.temperature}
              onChange={(e) => onTempChange(parseFloat(e.target.value))}
            />
          </label>

          <label className="field slider">
            <span>
              Top-p <b id="v-topp">{state.topP.toFixed(2)}</b>
            </span>
            <input
              id="topp"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={state.topP}
              onChange={(e) => onTopPChange(parseFloat(e.target.value))}
            />
          </label>

          <div className="group toggles">
            <label className="toggle">
              <input
                id="follow"
                type="checkbox"
                checked={follow}
                onChange={(e) => onFollowToggle(e.target.checked)}
              />
              <span>Follow</span>
            </label>
            <label className="toggle">
              <input
                id="labels"
                type="checkbox"
                checked={labels}
                onChange={(e) => onLabelsToggle(e.target.checked)}
              />
              <span>Labels</span>
            </label>
          </div>
        </div>
      </div>
    </footer>
  );
};
