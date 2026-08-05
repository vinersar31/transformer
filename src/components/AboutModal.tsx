"use client";

import React from "react";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div className="modal" id="about">
      <div className="modal-card">
        <button
          className="modal-close"
          id="about-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <h2>What this is</h2>
        <p>
          Transformer is an interactive simulation where every district is one
          stage of a transformer language model. A convoy carries a{" "}
          <em>hidden state</em> along the roads: it is cut into tokens at the
          docks, cast into a vector at the foundry, stamped with its position,
          then driven around the layer ring (attention, residual, feed-forward,
          residual) once per layer, before the stadium turns it into a
          probability distribution and the sampler picks one token. That token
          drives back up the feedback highway and the whole simulation runs
          again.
        </p>

        <h2>How much of it is real</h2>
        <p>
          <strong>Genuinely computed, live, in your browser:</strong> the
          tokenizer split; the embedding lookup; sinusoidal positional encoding;
          LayerNorm; multi-head scaled dot-product attention with causal masking
          over a real growing KV cache; the residual adds; a GELU feed-forward; and
          temperature / top-p sampling. The bars on the truck are the actual
          vector. The beams over the warehouse are the actual softmax weights.
          Prefill really does process every prompt token at once while decode
          really does process only one.
        </p>
        <p>
          <strong>Scaled down:</strong> 12 dimensions instead of thousands, 2
          attention heads instead of dozens, 2–12 layers instead of 80, and a
          vocabulary of a few hundred words instead of 100k+.
        </p>
        <p>
          <strong>Deliberately faked:</strong> the weights are random, and nothing
          here was trained, so a random-weight model would emit noise. To keep the
          output readable, the final logits blend the real hidden-state projection
          with a bigram prior built from a small fixed corpus. The attention
          scores are also sharpened, and given a small first-token (&quot;sink&quot;)
          and recency bias, so the map looks like the patterns trained models
          actually produce. Treat the text this city writes as scenery; treat
          the mechanism as the lesson.
        </p>

        <h2>Pacing</h2>
        <p>
          The first time the convoy reaches a district it stops long enough to
          read that district&apos;s explanation, between 9 and 26 seconds depending
          on how much there is to say. A progress bar under the panel text shows how
          long the stop has left. Once every district has been explained the city
          runs at a watchable pace instead of a readable one, and the repeated
          layers fast-forward because they are the same road with different
          weights. <b>Space</b> holds any stop indefinitely, <b>S</b> steps one
          stage at a time, and the Speed slider scales everything, including the
          reading stops, from 0.4× to 8×. <b>Reset</b> (⟲) replays the slow tour
          from the beginning; <b>Run</b> keeps what you have already read.
        </p>

        <h2>Controls</h2>
        <ul>
          <li>
            <b>Space</b> play / pause · <b>S</b> advance one stage · <b>R</b>{" "}
            reset and replay the tour · <b>F</b> follow camera · <b>L</b> labels
          </li>
          <li>
            Drag to pan, scroll to zoom, click any district for its
            explanation.
          </li>
          <li>
            The view starts close on the convoy and rides along with it. The{" "}
            <b>⤢</b> button on the left (or a double-click on the map) pulls
            back to the whole city; turning off <b>Follow</b> lets you wander on
            your own.
          </li>
        </ul>
        <p className="fine">
          Inspired by the idea behind PGSimCity (a city-shaped model of
          PostgreSQL); all code, art and copy here are original.
        </p>
      </div>
    </div>
  );
};
