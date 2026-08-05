"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Header } from "@/components/Header";
import { HUD } from "@/components/HUD";
import { ZoomControls } from "@/components/ZoomControls";
import { InspectorPanel } from "@/components/InspectorPanel";
import { ControlDock } from "@/components/ControlDock";
import { AboutModal } from "@/components/AboutModal";
import { CanvasStage } from "@/components/CanvasStage";
import { Sim, state as simState } from "@/lib/transformer/sim";
import { City, District } from "@/lib/transformer/city";
import { Camera } from "@/lib/transformer/render";
import { P } from "@/lib/transformer/iso";

export default function Home() {
  const [prompt, setPrompt] = useState("the city of tokens");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [panelHidden, setPanelHidden] = useState(false);
  const [activeDistrict, setActiveDistrict] = useState<District | null>(null);
  const [follow, setFollow] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const [, setTick] = useState(0);

  const cameraRef = useRef<Camera>({
    x: 0,
    y: 0,
    zoom: 1.1,
    follow: true,
  });

  useEffect(() => {
    Sim.setPrompt("the city of tokens");
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const handleRun = () => {
    Sim.setPrompt(prompt);
  };

  const handlePlayPause = () => {
    Sim.toggle();
  };

  const handleStep = () => {
    Sim.step();
  };

  const handleReset = () => {
    Sim.replayTour();
    Sim.reset();
  };

  const handleSpeedChange = (speed: number) => {
    simState.speed = speed;
  };

  const handleLayersChange = (layers: number) => {
    simState.layers = layers;
  };

  const handleTempChange = (temp: number) => {
    simState.temperature = temp;
  };

  const handleTopPChange = (topP: number) => {
    simState.topP = topP;
  };

  const handleFollowToggle = (f: boolean) => {
    setFollow(f);
    cameraRef.current.follow = f;
  };

  const handleLabelsToggle = (l: boolean) => {
    setShowLabels(l);
  };

  const handleSelectDistrictById = (id: string) => {
    const d = City.districtById[id];
    if (d) {
      setActiveDistrict(d);
      const p = P(d.x, d.y, 0);
      cameraRef.current.x = -p.x;
      cameraRef.current.y = -p.y + 20;
      cameraRef.current.follow = false;
      setFollow(false);
    }
  };

  const handleSelectDistrict = (d: District) => {
    setActiveDistrict(d);
    const p = P(d.x, d.y, 0);
    cameraRef.current.x = -p.x;
    cameraRef.current.y = -p.y + 20;
    cameraRef.current.follow = false;
    setFollow(false);
  };

  const handleZoomIn = () => {
    cameraRef.current.zoom = Math.min(3.5, cameraRef.current.zoom * 1.2);
  };

  const handleZoomOut = () => {
    cameraRef.current.zoom = Math.max(0.2, cameraRef.current.zoom / 1.2);
  };

  const handleZoomFit = useCallback(() => {
    const pCenter = P(City.GW / 2, City.GH / 2, 0);
    cameraRef.current.x = -pCenter.x;
    cameraRef.current.y = -pCenter.y + 40;
    cameraRef.current.zoom = 0.65;
    cameraRef.current.follow = false;
    setFollow(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === " ") {
        e.preventDefault();
        Sim.toggle();
      } else if (e.key === "s" || e.key === "S") {
        Sim.step();
      } else if (e.key === "r" || e.key === "R") {
        handleReset();
      } else if (e.key === "f" || e.key === "F") {
        const next = !cameraRef.current.follow;
        cameraRef.current.follow = next;
        setFollow(next);
      } else if (e.key === "l" || e.key === "L") {
        setShowLabels((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleReset]);

  return (
    <main>
      <Header
        onOpenAbout={() => setAboutOpen(true)}
        panelHidden={panelHidden}
        onTogglePanel={() => setPanelHidden(!panelHidden)}
      />

      <HUD
        mode={simState.mode}
        layer={simState.layer}
        layers={simState.layers}
        cacheSize={simState.cacheSize}
        tripCount={simState.tripCount}
        fastForward={simState.fastForward}
        reading={simState.reading}
      />

      <ZoomControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomFit={handleZoomFit}
      />

      <CanvasStage
        follow={follow}
        showLabels={showLabels}
        onSelectDistrict={handleSelectDistrict}
        cameraRef={cameraRef}
      />

      <InspectorPanel
        state={simState}
        activeDistrict={activeDistrict}
        panelHidden={panelHidden}
        onSelectDistrict={handleSelectDistrictById}
        onTogglePanel={() => setPanelHidden(!panelHidden)}
      />

      <ControlDock
        state={simState}
        prompt={prompt}
        onPromptChange={setPrompt}
        onRun={handleRun}
        onPlayPause={handlePlayPause}
        onStep={handleStep}
        onReset={handleReset}
        onSpeedChange={handleSpeedChange}
        onLayersChange={handleLayersChange}
        onTempChange={handleTempChange}
        onTopPChange={handleTopPChange}
        onFollowToggle={handleFollowToggle}
        onLabelsToggle={handleLabelsToggle}
        follow={follow}
        labels={showLabels}
      />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </main>
  );
}
