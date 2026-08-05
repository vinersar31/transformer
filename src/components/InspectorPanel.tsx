"use client";

import React from "react";
import { City, District } from "@/lib/transformer/city";
import { SimState, TokenItem } from "@/lib/transformer/sim";
import { RankedCandidate, ToyModel as M } from "@/lib/transformer/toy-model";

interface InspectorPanelProps {
  state: SimState;
  activeDistrict: District | null;
  panelHidden: boolean;
  onSelectDistrict: (id: string) => void;
  onTogglePanel: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  state,
  activeDistrict,
  panelHidden,
  onSelectDistrict,
  onTogglePanel,
}) => {
  const currentDistrict = activeDistrict ||
    (state.stage ? City.districtById[City.stageToDistrict[state.stage] || state.stage] : null);

  const title = currentDistrict ? currentDistrict.name : "Press Run to start";
  const shortText = currentDistrict
    ? currentDistrict.short
    : "The simulation is idle. Type a prompt below and watch a single token make the round trip.";
  const bodyText = currentDistrict ? currentDistrict.body : "";

  const dwellPct =
    state.dwellTotal > 0
      ? Math.max(0, Math.min(100, (state.dwellLeft / state.dwellTotal) * 100))
      : 0;

  return (
    <aside
      className={`inspector ${panelHidden ? "hidden" : ""}`}
      id="inspector"
    >
      <button
        className="sheet-handle"
        id="sheet-handle"
        aria-expanded={!panelHidden}
        aria-controls="inspector"
        onClick={onTogglePanel}
      >
        <span className="grip" aria-hidden="true" />
        <span className="sheet-label">Details</span>
      </button>

      <div className="stage-card">
        <div className="eyebrow">
          <span className="chip" id="stage-chip">
            {state.stage || "idle"}
          </span>
          <span className="tag" id="stage-tag">
            {currentDistrict?.tag || ""}
          </span>
        </div>
        <h2 id="stage-name">{title}</h2>
        <p className="lede" id="stage-short">
          {shortText}
        </p>
        {bodyText && (
          <p className="muted" id="stage-body">
            {bodyText}
          </p>
        )}

        {state.dwellLeft > 0 && (
          <div className="dwell" id="dwell">
            <i id="dwell-bar" style={{ width: `${dwellPct}%` }} />
            <span id="dwell-hint">
              reading stop: press <kbd>Space</kbd> to hold it here
            </span>
          </div>
        )}
      </div>

      <section className="sec">
        <h3>
          Residual stream <span className="hint">{state.hLabel}</span>
        </h3>
        <div className="vec" id="vec">
          {state.h
            ? Array.from(state.h).map((v, i) => {
                const height = Math.min(36, Math.max(4, Math.abs(v) * 18));
                const isNeg = v < 0;
                return (
                  <div
                    key={i}
                    className={`bar ${isNeg ? "neg" : "pos"}`}
                    style={{ height: `${height}px` }}
                    title={`dim ${i}: ${v.toFixed(3)}`}
                  />
                );
              })
            : Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="bar idle" style={{ height: "12px" }} />
              ))}
        </div>
        <p className="fine">
          12 numbers standing in for the 4,096+ a real model carries. Blue is
          negative, warm is positive.
        </p>
      </section>

      {state.attn && (
        <section className="sec" id="sec-attn">
          <h3>
            Attention <span className="hint">softmax over the KV cache</span>
          </h3>
          <div className="bars" id="attn-list">
            {state.attn.map((w, i) => {
              const tok = state.tokens[i];
              return (
                <div key={i} className="bar-row">
                  <span className="bar-tok">
                    {tok ? M.display(tok.text) : i}
                  </span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(w * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="bar-val">{(w * 100).toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {state.candidates && (
        <section className="sec" id="sec-cands">
          <h3>
            Next token <span className="hint">logits → softmax</span>
          </h3>
          <div className="bars" id="cand-list">
            {state.candidates.slice(0, 8).map((c, i) => {
              const cand = c as RankedCandidate;
              const isChosen = state.chosen?.token === cand.token;
              return (
                <div
                  key={i}
                  className={`bar-row ${isChosen ? "chosen" : ""}`}
                >
                  <span className="bar-tok">{M.display(cand.token)}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${((cand.p || 0) * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="bar-val">
                    {((cand.p || 0) * 100).toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="sec">
        <h3>
          Context <span className="hint">{state.tokens.length} tokens</span>
        </h3>
        <div className="tokens" id="tokens">
          {state.tokens.map((t: TokenItem, i: number) => (
            <span
              key={i}
              className={`tok-chip ${t.kind} ${
                i === state.focusIdx ? "focus" : ""
              }`}
            >
              {M.display(t.text)}
            </span>
          ))}
        </div>
      </section>

      <section className="sec">
        <h3>Output</h3>
        <div className="output" id="output">
          {state.outputText ? (
            <span>{state.outputText}</span>
          ) : (
            <span className="fine">nothing yet</span>
          )}
        </div>
      </section>

      <section className="sec">
        <h3>
          Districts <span className="hint">click to fly there</span>
        </h3>
        <div className="chips" id="district-chips">
          {City.districts.slice(0, 13).map((d) => (
            <button
              key={d.id}
              className={`chip ${currentDistrict?.id === d.id ? "active" : ""}`}
              onClick={() => onSelectDistrict(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
};
