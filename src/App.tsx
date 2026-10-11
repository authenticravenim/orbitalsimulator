import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ControlMode,
  CameraViewMode,
  PresetKey,
  SimulationParameters,
  DisplayOptions,
  CelestialBody,
  MoonBody,
  ImpactEvent,
} from './types';
import {
  createInitialSimulationState,
  integrateStep,
  computeSpecificOrbitalEnergy,
} from './utils/physics';
import { Orbital3DCanvas } from './components/Orbital3DCanvas';
import { Sparkline } from './components/Sparkline';
import {
  RotateCcw,
  Play,
  Pause,
  FastForward,
  Compass,
  Globe2,
  Maximize2,
  Layers,
  Info,
  Activity,
  Sliders,
  Crosshair,
  Flame,
  Volume2,
  VolumeX,
  Smartphone,
  Download,
  ExternalLink,
  ChevronUp,
  X,
} from 'lucide-react';

const PRESETS: Record<
  Exclude<PresetKey, 'custom'>,
  {
    name: string;
    description: string;
    gravity: number;
    velocity: number;
    offset: number;
    separation: number;
  }
> = {
  capture: {
    name: 'Capture Attempt',
    description: 'Close pass with gravitational energy braking',
    gravity: 1.0,
    velocity: 7.0,
    offset: -145,
    separation: 34,
  },
  flyby: {
    name: 'Fast Flyby',
    description: 'High-velocity hyperbolic deflection around Earth',
    gravity: 1.0,
    velocity: 9.2,
    offset: -100,
    separation: 34,
  },
  impact: {
    name: 'Direct Collision',
    description: 'Direct head-on trajectory detonating on Earth',
    gravity: 1.0,
    velocity: 6.8,
    offset: -25,
    separation: 32,
  },
  wide: {
    name: 'Wide Miss',
    description: 'Weak perturbation outside lunar orbit',
    gravity: 0.8,
    velocity: 7.5,
    offset: -205,
    separation: 40,
  },
  pair: {
    name: 'Close Pair',
    description: 'Strong tidal exchange between incoming pair',
    gravity: 1.35,
    velocity: 6.0,
    offset: -120,
    separation: 18,
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'sim' | 'globe' | 'guide'>('sim');

  // Simulation Parameters
  const [params, setParams] = useState<SimulationParameters>({
    gravity: 1.0,
    velocity: 7.0,
    offset: -145,
    separation: 34,
    zoom: 100,
    collisionMode: 'explode',
  });

  const [activePreset, setActivePreset] = useState<PresetKey>('capture');
  const [controlMode, setControlMode] = useState<ControlMode>('hold');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('perspective');
  const [mobileSheetOpen, setMobileSheetOpen] = useState<boolean>(false);

  // Display Overlays
  const [displayOptions, setDisplayOptions] = useState<DisplayOptions>({
    trails: true,
    referenceOrbits: true,
    bodyLabels: true,
    starField: true,
    potentialWell: true,
    latLongGrid: true,
    atmosphereGlow: true,
    cloudLayer: true,
    explosionEffects: true,
    audioEffects: true,
  });

  // Simulation Runtime State
  const [bodies, setBodies] = useState<CelestialBody[]>([]);
  const [moon, setMoon] = useState<MoonBody>({
    x: 175,
    y: -5,
    z: 0,
    m: 4,
    vx: 0,
    vy: 7.55,
    radius: 175,
    angle: 0,
  });
  const [simTime, setSimTime] = useState<number>(0);
  const [closestApproach, setClosestApproach] = useState<number>(Infinity);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [energyHistory, setEnergyHistory] = useState<number[]>([]);
  const [impacts, setImpacts] = useState<ImpactEvent[]>([]);

  // Animation Loop Refs
  const bodiesRef = useRef<CelestialBody[]>([]);
  const moonRef = useRef<MoonBody>(moon);
  const isHoldingRef = useRef<boolean>(false);
  const isAutoRunningRef = useRef<boolean>(false);
  const isCompleteRef = useRef<boolean>(false);
  const paramsRef = useRef<SimulationParameters>(params);
  const speedRef = useRef<number>(1.0);
  const timeRef = useRef<number>(0);
  const closestRef = useRef<number>(Infinity);
  const stepKeyRef = useRef<boolean>(false);
  const earthRotRef = useRef<number>(0);

  useEffect(() => {
    isHoldingRef.current = isHolding;
  }, [isHolding]);

  useEffect(() => {
    isAutoRunningRef.current = isAutoRunning;
  }, [isAutoRunning]);

  useEffect(() => {
    isCompleteRef.current = isComplete;
  }, [isComplete]);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Reset Simulation
  const resetSimulation = useCallback(() => {
    const { moon: initMoon, bodies: initBodies } = createInitialSimulationState(paramsRef.current);
    moonRef.current = initMoon;
    bodiesRef.current = initBodies;
    setMoon(initMoon);
    setBodies(initBodies);

    timeRef.current = 0;
    closestRef.current = Infinity;
    isCompleteRef.current = false;
    earthRotRef.current = 0;
    setIsHolding(false);
    setIsAutoRunning(false);
    setIsComplete(false);
    setSimTime(0);
    setClosestApproach(Infinity);
    setImpacts([]);

    const initE = computeSpecificOrbitalEnergy(initBodies[0], paramsRef.current.gravity);
    setEnergyHistory([initE]);
  }, []);

  useEffect(() => {
    resetSimulation();
  }, [resetSimulation]);

  const applyPreset = (key: PresetKey) => {
    if (key === 'custom') return;
    const p = PRESETS[key];
    setActivePreset(key);
    const newParams: SimulationParameters = {
      ...params,
      gravity: p.gravity,
      velocity: p.velocity,
      offset: p.offset,
      separation: p.separation,
    };
    setParams(newParams);
    paramsRef.current = newParams;
    resetSimulation();
  };

  // Main Simulation Physics Loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let accumulator = 0;
    let stepCount = 0;

    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      earthRotRef.current += 0.002;

      const shouldAdvance =
        !isCompleteRef.current &&
        (controlMode === 'hold' ? isHoldingRef.current : isAutoRunningRef.current);

      if (shouldAdvance) {
        accumulator += dt * speedRef.current;
        let stepsRun = 0;

        while (accumulator >= 0.016 && stepsRun < 120 && !isCompleteRef.current) {
          const simDt = 0.16;
          timeRef.current += simDt;
          stepCount++;

          const result = integrateStep(
            bodiesRef.current,
            moonRef.current,
            simDt,
            paramsRef.current.gravity,
            timeRef.current,
            paramsRef.current.collisionMode,
            earthRotRef.current
          );

          if (result.impacts.length > 0) {
            setImpacts((prev) => [...prev, ...result.impacts]);
          }

          const primary = bodiesRef.current[0];
          if (primary && !primary.isDestroyed) {
            const dist = Math.hypot(primary.x, primary.y, primary.z || 0);
            if (dist < closestRef.current) {
              closestRef.current = dist;
            }
          }

          if (stepCount % 4 === 0 && primary) {
            const e = computeSpecificOrbitalEnergy(primary, paramsRef.current.gravity);
            setEnergyHistory((prev) => {
              const next = [...prev, e];
              return next.length > 500 ? next.slice(-500) : next;
            });
          }

          if (result.done) {
            isCompleteRef.current = true;
            setIsComplete(true);
            setIsHolding(false);
            setIsAutoRunning(false);
            break;
          }

          accumulator -= 0.016;
          stepsRun++;
        }

        setSimTime(timeRef.current);
        setClosestApproach(closestRef.current);
        setMoon({ ...moonRef.current });
        setBodies([...bodiesRef.current.map((b) => ({ ...b }))]);
      } else if (stepKeyRef.current && !isCompleteRef.current) {
        accumulator += dt;
        if (accumulator >= 0.05) {
          const res = integrateStep(
            bodiesRef.current,
            moonRef.current,
            0.16,
            paramsRef.current.gravity,
            timeRef.current,
            paramsRef.current.collisionMode,
            earthRotRef.current
          );
          if (res.impacts.length > 0) {
            setImpacts((prev) => [...prev, ...res.impacts]);
          }
          timeRef.current += 0.16;
          setSimTime(timeRef.current);
          setMoon({ ...moonRef.current });
          setBodies([...bodiesRef.current.map((b) => ({ ...b }))]);
          accumulator = 0;
        }
      } else {
        accumulator = 0;
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [controlMode]);

  const handleSingleStep = () => {
    if (isCompleteRef.current) return;
    setIsAutoRunning(false);
    for (let i = 0; i < 8; i++) {
      timeRef.current += 0.16;
      const res = integrateStep(
        bodiesRef.current,
        moonRef.current,
        0.16,
        paramsRef.current.gravity,
        timeRef.current,
        paramsRef.current.collisionMode,
        earthRotRef.current
      );
      if (res.impacts.length > 0) {
        setImpacts((prev) => [...prev, ...res.impacts]);
      }
    }
    const primary = bodiesRef.current[0];
    if (primary && !primary.isDestroyed) {
      const dist = Math.hypot(primary.x, primary.y, primary.z || 0);
      if (dist < closestRef.current) closestRef.current = dist;
      const e = computeSpecificOrbitalEnergy(primary, paramsRef.current.gravity);
      setEnergyHistory((prev) => [...prev.slice(-499), e]);
    }
    setSimTime(timeRef.current);
    setClosestApproach(closestRef.current);
    setMoon({ ...moonRef.current });
    setBodies([...bodiesRef.current.map((b) => ({ ...b }))]);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (controlMode === 'hold') {
          if (!isCompleteRef.current) setIsHolding(true);
        } else {
          if (!isCompleteRef.current) setIsAutoRunning((prev) => !prev);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepKeyRef.current = true;
        handleSingleStep();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetSimulation();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setControlMode((prev) => (prev === 'hold' ? 'auto' : 'hold'));
      } else if (['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const keys: PresetKey[] = ['capture', 'flyby', 'impact', 'wide', 'pair'];
        applyPreset(keys[Number(e.key) - 1]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && controlMode === 'hold') {
        setIsHolding(false);
      } else if (e.code === 'ArrowRight') {
        stepKeyRef.current = false;
      }
    };

    const handleBlur = () => {
      setIsHolding(false);
      stepKeyRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [controlMode, resetSimulation]);

  const handleDownloadStandalone = async () => {
    try {
      const res = await fetch('/orbital-mobile.html');
      const htmlText = await res.text();
      const blob = new Blob([htmlText], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'orbital-encounter-lab.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open('/orbital-mobile.html', '_blank');
    }
  };

  const primaryBody = bodies[0];
  const companionBody = bodies[1];
  const currentDistToEarth = primaryBody ? Math.hypot(primaryBody.x, primaryBody.y, primaryBody.z || 0) : 0;
  const primaryEnergy = primaryBody ? computeSpecificOrbitalEnergy(primaryBody, params.gravity) : 0;
  const companionEnergy = companionBody ? computeSpecificOrbitalEnergy(companionBody, params.gravity) : 0;
  const isBoundEstimate = primaryEnergy < 0;

  const isAdvancing =
    !isComplete && (controlMode === 'hold' ? isHolding : isAutoRunning);

  const latestImpact = impacts[impacts.length - 1];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans select-none">
      {/* 1. TOP BAR CONTRACT */}
      <header className="h-14 sm:h-16 px-4 md:px-8 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between gap-4">
        {/* Brand Zone */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-sky-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Globe2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
            Orbital Encounter Lab
          </span>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <button
            onClick={() => {
              setActiveTab('sim');
              setCameraMode('perspective');
            }}
            className={`whitespace-nowrap transition-colors py-1 border-b-2 ${
              activeTab === 'sim' && cameraMode !== 'globe'
                ? 'border-amber-400 text-slate-100'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Orbital Simulation
          </button>
          <button
            onClick={() => {
              setActiveTab('globe');
              setCameraMode('globe');
            }}
            className={`whitespace-nowrap transition-colors py-1 border-b-2 ${
              activeTab === 'globe' || cameraMode === 'globe'
                ? 'border-sky-400 text-slate-100'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Google Earth Globe View
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`whitespace-nowrap transition-colors py-1 border-b-2 ${
              activeTab === 'guide'
                ? 'border-amber-400 text-slate-100'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Physics & Collisions Guide
          </button>
        </nav>

        {/* Standalone HTML & Reset Action */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <a
            href="/orbital-mobile.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 transition-colors whitespace-nowrap"
            title="Open standalone mobile HTML file"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Phone Standalone</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
          </a>

          <button
            onClick={handleDownloadStandalone}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors whitespace-nowrap"
            title="Download fully self-contained HTML file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .html</span>
          </button>

          <button
            onClick={resetSimulation}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors whitespace-nowrap"
            title="Reset system (R)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </header>

      {/* Subtitle & Telemetry Ribbon */}
      <div className="px-4 md:px-8 py-2 sm:py-2.5 border-b border-slate-800/40 bg-slate-900/30 flex items-center justify-between gap-3 text-xs text-slate-400 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-semibold text-amber-400 uppercase tracking-wider text-[10px] sm:text-[11px]">
            Simulated 3D Gravity Lab
          </span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Phone Standalone Ready</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-slate-300 text-[11px]">
            {activePreset !== 'custom' ? PRESETS[activePreset].name : 'Custom'}
          </span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2 sm:gap-3 font-mono">
          {impacts.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] sm:text-[11px]">
              <Flame className="w-3 h-3 text-rose-400 animate-pulse" />
              <span>{impacts.length} HIT{impacts.length > 1 ? 'S' : ''}</span>
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isComplete
                  ? 'bg-slate-400'
                  : isAdvancing
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300 font-medium text-[11px]">
              {isComplete
                ? 'Finished'
                : isAdvancing
                ? 'Running'
                : controlMode === 'hold'
                ? 'Hold to Run'
                : 'Paused'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Responsive Multi-Column / Phone Stack */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px] gap-3 sm:gap-5 items-start">
        {/* Left Column: 3D Viewport & Mobile Controls */}
        <div className="flex flex-col gap-2.5 sm:gap-3 min-w-0">
          {/* 3D Viewport Container */}
          <div
            className={`relative rounded-xl border overflow-hidden bg-slate-950 shadow-2xl transition-all duration-200 ${
              latestImpact
                ? 'border-rose-500/50 shadow-[0_0_40px_rgba(244,63,94,0.18)]'
                : isAdvancing
                ? 'border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.12)]'
                : 'border-slate-800'
            }`}
            style={{ height: 'max(52vh, min(68vh, 740px))' }}
          >
            {/* Viewport Floating Top HUD */}
            <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-4 right-2.5 sm:right-4 z-10 flex items-center justify-between gap-2 pointer-events-none flex-wrap">
              {/* Perspective Mode Switcher */}
              <div className="pointer-events-auto flex items-center bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-lg p-0.5 sm:p-1 gap-0.5 sm:gap-1 text-xs font-medium">
                <button
                  onClick={() => {
                    setCameraMode('perspective');
                    setActiveTab('sim');
                  }}
                  className={`px-2 sm:px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                    cameraMode === 'perspective'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Compass className="w-3 h-3" />
                  <span className="text-[11px] sm:text-xs">3D Orbit</span>
                </button>
                <button
                  onClick={() => {
                    setCameraMode('globe');
                    setActiveTab('globe');
                  }}
                  className={`px-2 sm:px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                    cameraMode === 'globe'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe2 className="w-3 h-3" />
                  <span className="text-[11px] sm:text-xs">Globe</span>
                </button>
                <button
                  onClick={() => {
                    setCameraMode('topdown');
                    setActiveTab('sim');
                  }}
                  className={`px-2 sm:px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                    cameraMode === 'topdown'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Maximize2 className="w-3 h-3" />
                  <span className="text-[11px] sm:text-xs">Top</span>
                </button>
                <button
                  onClick={() => {
                    setCameraMode('follow');
                    setActiveTab('sim');
                  }}
                  className={`px-2 sm:px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1 ${
                    cameraMode === 'follow'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Crosshair className="w-3 h-3" />
                  <span className="text-[11px] sm:text-xs">Chase</span>
                </button>
              </div>

              {/* Model Time Readout */}
              <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-lg px-2.5 py-1 font-mono text-[11px] sm:text-xs text-slate-300 flex items-center gap-1.5">
                <span className="text-slate-500">T+</span>
                <span className="text-amber-400 font-bold tabular-nums">
                  {simTime.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* The 3D Three.js Canvas */}
            <Orbital3DCanvas
              bodies={bodies}
              moon={moon}
              viewMode={cameraMode}
              displayOptions={displayOptions}
              zoom={params.zoom}
              time={simTime}
              closestApproach={closestApproach}
              impacts={impacts}
            />

            {/* Hold Space Prompt */}
            {controlMode === 'hold' && !isHolding && !isComplete && simTime === 0 && (
              <div className="absolute left-1/2 bottom-14 sm:bottom-16 -translate-x-1/2 pointer-events-none z-20 flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-slate-950/90 border border-amber-500/40 text-amber-200 text-[11px] sm:text-xs backdrop-blur-md shadow-xl animate-pulse">
                <kbd className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 font-mono font-bold text-amber-300 text-[10px]">
                  HOLD
                </kbd>
                <span>Hold button to run encounter</span>
              </div>
            )}

            {/* Impact Flash Alert */}
            {latestImpact && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[90%] max-w-sm">
                <div className="px-3 py-1.5 rounded-lg bg-rose-950/90 border border-rose-500/60 backdrop-blur-md text-[11px] font-mono text-rose-200 shadow-2xl flex items-center justify-center gap-2 text-center">
                  <Flame className="w-3.5 h-3.5 text-amber-400 animate-bounce shrink-0" />
                  <span>
                    <strong>SURFACE EXPLOSION:</strong> {latestImpact.target.toUpperCase()} struck at v={latestImpact.speed.toFixed(1)}!
                  </span>
                </div>
              </div>
            )}

            {/* Horizontal Scenario Carousel Overlay for Phone Orientation */}
            <div className="absolute bottom-2.5 left-2 right-2 z-10 flex gap-1.5 overflow-x-auto no-scrollbar pointer-events-auto">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => {
                const preset = PRESETS[key];
                const isActive = activePreset === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className={`flex-none px-2.5 py-1 rounded-full text-[11px] font-semibold border backdrop-blur-md transition-all whitespace-nowrap ${
                      isActive
                        ? key === 'impact'
                          ? 'bg-rose-500/30 border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                          : 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                        : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {key === 'impact' && '💥 '}
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Thumb Zone Controller (Optimized for Phone Touch Reach) */}
          <div className="p-2.5 sm:p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              {/* Primary Hold/Run Button (Full Ergonomic Target) */}
              {controlMode === 'hold' ? (
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (!isComplete) {
                      setIsHolding(true);
                      if (navigator.vibrate) navigator.vibrate(15);
                    }
                  }}
                  onPointerUp={() => setIsHolding(false)}
                  onPointerLeave={() => setIsHolding(false)}
                  className={`flex-1 min-h-[46px] sm:min-h-[48px] px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 select-none touch-none ${
                    isHolding
                      ? 'bg-amber-500 text-slate-950 shadow-[0_0_24px_rgba(245,158,11,0.7)] scale-[0.98]'
                      : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-md'
                  }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{isHolding ? 'Running Encounter…' : 'Hold to Run'}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!isComplete) setIsAutoRunning((prev) => !prev);
                  }}
                  className={`flex-1 min-h-[46px] sm:min-h-[48px] px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                    isAutoRunning
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                  }`}
                >
                  {isAutoRunning ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Auto Run</span>
                    </>
                  )}
                </button>
              )}

              {/* Step Button */}
              <button
                onClick={handleSingleStep}
                disabled={isComplete}
                className="w-11 h-11 sm:w-auto sm:px-3.5 sm:h-auto py-2 rounded-xl text-xs font-medium bg-slate-800/90 border border-slate-700/80 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                title="Single step"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Step</span>
              </button>

              {/* Reset Button */}
              <button
                onClick={resetSimulation}
                className="w-11 h-11 sm:w-auto sm:px-3.5 sm:h-auto py-2 rounded-xl text-xs font-medium bg-slate-800/90 border border-slate-700/80 hover:bg-slate-700 text-slate-200 transition-colors flex items-center justify-center gap-1.5"
                title="Restart"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>

              {/* Mobile Sheet Trigger Button (Visible on mobile screens) */}
              <button
                onClick={() => setMobileSheetOpen(true)}
                className="lg:hidden w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 text-amber-400 flex flex-col items-center justify-center text-[10px] font-bold"
                title="Open parameters & tuning drawer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Tuning</span>
              </button>
            </div>

            {/* Desktop Settings & Speed */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setParams((p) => ({ ...p, collisionMode: 'explode' }))}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    params.collisionMode === 'explode'
                      ? 'bg-rose-500 text-white'
                      : 'text-slate-400'
                  }`}
                >
                  Explode
                </button>
                <button
                  onClick={() => setParams((p) => ({ ...p, collisionMode: 'bounce' }))}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    params.collisionMode === 'bounce'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400'
                  }`}
                >
                  Bounce
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => {
                    setControlMode('hold');
                    setIsAutoRunning(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    controlMode === 'hold'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400'
                  }`}
                >
                  Hold
                </button>
                <button
                  onClick={() => {
                    setControlMode('auto');
                    setIsHolding(false);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    controlMode === 'auto'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400'
                  }`}
                >
                  Auto
                </button>
              </div>

              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 font-mono text-xs focus:outline-none"
                aria-label="Simulation speed multiplier"
              >
                <option value={0.5}>0.5×</option>
                <option value={1.0}>1.0×</option>
                <option value={1.5}>1.5×</option>
                <option value={2.0}>2.0×</option>
              </select>

              <button
                onClick={() =>
                  setDisplayOptions((prev) => ({
                    ...prev,
                    audioEffects: !prev.audioEffects,
                  }))
                }
                className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200"
                title="Toggle audio"
              >
                {displayOptions.audioEffects ? (
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar (Desktop layout) */}
        <aside className="hidden lg:flex flex-col gap-4 min-w-0">
          {/* Section 1: Encounter Presets */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Compass className="w-4 h-4" />
                <span>Encounter Presets</span>
              </span>
              <span className="font-mono text-slate-500 text-[11px]">SCENARIOS</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((key) => {
                const preset = PRESETS[key];
                const isActive = activePreset === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    className={`p-2.5 rounded-lg text-left transition-all border ${
                      isActive
                        ? key === 'impact'
                          ? 'bg-rose-500/15 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.15)] text-rose-200'
                          : 'bg-amber-500/15 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)] text-amber-200'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span>{preset.name}</span>
                      {key === 'impact' && <Flame className="w-3 h-3 text-rose-400" />}
                    </div>
                    <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2: Parameters */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Sliders className="w-4 h-4" />
                <span>Parameters</span>
              </span>
              <span className="font-mono text-slate-500 text-[11px]">INITIAL CONDITIONS</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="gravity" className="text-slate-300">
                  Gravitational Constant (G)
                </label>
                <output id="gravityVal" className="font-mono text-amber-400 font-bold">
                  {params.gravity.toFixed(2)}
                </output>
              </div>
              <input
                id="gravity"
                type="range"
                min="0.45"
                max="1.8"
                step="0.05"
                value={params.gravity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setParams((prev) => ({ ...prev, gravity: val }));
                  setActivePreset('custom');
                  resetSimulation();
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="velocity" className="text-slate-300">
                  Incoming Speed (v₀)
                </label>
                <output id="velocityVal" className="font-mono text-amber-400 font-bold">
                  {params.velocity.toFixed(1)}
                </output>
              </div>
              <input
                id="velocity"
                type="range"
                min="4.5"
                max="10.5"
                step="0.1"
                value={params.velocity}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setParams((prev) => ({ ...prev, velocity: val }));
                  setActivePreset('custom');
                  resetSimulation();
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="offset" className="text-slate-300">
                  Approach Offset (y₀)
                </label>
                <output id="offsetVal" className="font-mono text-amber-400 font-bold">
                  {params.offset < 0 ? `−${Math.abs(params.offset)}` : params.offset}
                </output>
              </div>
              <input
                id="offset"
                type="range"
                min="-230"
                max="10"
                step="5"
                value={params.offset}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setParams((prev) => ({ ...prev, offset: val }));
                  setActivePreset('custom');
                  resetSimulation();
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="separation" className="text-slate-300">
                  Pair Separation (d)
                </label>
                <output id="separationVal" className="font-mono text-amber-400 font-bold">
                  {params.separation}
                </output>
              </div>
              <input
                id="separation"
                type="range"
                min="14"
                max="65"
                step="1"
                value={params.separation}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setParams((prev) => ({ ...prev, separation: val }));
                  setActivePreset('custom');
                  resetSimulation();
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="zoom" className="text-slate-300">
                  Camera Zoom
                </label>
                <output id="zoomVal" className="font-mono text-amber-400 font-bold">
                  {params.zoom}%
                </output>
              </div>
              <input
                id="zoom"
                type="range"
                min="65"
                max="160"
                step="5"
                value={params.zoom}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setParams((prev) => ({ ...prev, zoom: val }));
                }}
              />
            </div>
          </section>

          {/* Section 3: Telemetry */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Activity className="w-4 h-4" />
                <span>Live Telemetry</span>
              </span>
              <span className="font-mono text-slate-500 text-[11px]">PHYSICS DATA</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">
                  Closest Pass
                </div>
                <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">
                  {Number.isFinite(closestApproach) ? closestApproach.toFixed(1) : '—'}
                  <span className="text-[10px] text-slate-400 font-normal ml-1">units</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">
                  Dist to Earth
                </div>
                <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">
                  {primaryBody?.isDestroyed ? (
                    <span className="text-rose-400 text-sm">IMPACTED (R=52)</span>
                  ) : currentDistToEarth > 0 ? (
                    <>
                      {currentDistToEarth.toFixed(0)}
                      <span className="text-[10px] text-slate-400 font-normal ml-1">units</span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">
                  Incoming Energy
                </div>
                <div
                  className={`text-lg font-bold font-mono mt-0.5 ${
                    primaryBody?.isDestroyed
                      ? 'text-rose-400 text-sm'
                      : isBoundEstimate
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {primaryBody?.isDestroyed ? 'DESTROYED' : primaryBody ? primaryEnergy.toFixed(2) : '—'}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-mono">
                  Companion Energy
                </div>
                <div className="text-lg font-bold font-mono text-slate-300 mt-0.5">
                  {companionBody?.isDestroyed
                    ? 'DESTROYED'
                    : companionBody
                    ? companionEnergy.toFixed(2)
                    : '—'}
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Incoming Body Energy History</span>
                <span className="text-slate-500">Dashed: 0 = Escape</span>
              </div>
              <Sparkline
                data={energyHistory}
                currentEnergy={primaryEnergy}
                height={54}
              />
            </div>

            {impacts.length > 0 && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between text-rose-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    <span>Impact Log</span>
                  </span>
                  <span className="text-[10px] text-slate-400">{impacts.length} total</span>
                </div>
                {impacts.map((imp) => (
                  <div key={imp.id} className="text-[11px] text-slate-300 border-t border-rose-900/40 pt-1">
                    <span className="text-amber-400 font-bold">{imp.bodyName}</span> struck{' '}
                    <span className="text-sky-300">{imp.target.toUpperCase()}</span> at v={imp.speed.toFixed(1)}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 4: Display Toggles */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Layers className="w-4 h-4" />
                <span>3D Display & Effects</span>
              </span>
              <span className="font-mono text-slate-500 text-[11px]">OVERLAYS</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.explosionEffects}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      explosionEffects: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500"
                />
                <span>Explosions</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.audioEffects}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      audioEffects: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500"
                />
                <span>Audio Synthesis</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.trails}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({ ...prev, trails: e.target.checked }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500"
                />
                <span>Trails</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.latLongGrid}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      latLongGrid: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500"
                />
                <span>Lat/Long Grid</span>
              </label>
            </div>
          </section>
        </aside>
      </main>

      {/* MOBILE BOTTOM SHEET DRAWER (Sliding Tuning & Telemetry Sheet for Phone) */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden transition-opacity duration-300 ${
          mobileSheetOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMobileSheetOpen(false)}
      />
      <div
        className={`fixed left-0 right-0 bottom-0 bg-slate-950 border-t border-slate-800 rounded-t-3xl z-50 p-4 max-h-[82vh] overflow-y-auto lg:hidden transition-transform duration-300 ease-out ${
          mobileSheetOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
            <Sliders className="w-4 h-4" />
            <span>Parameters & Telemetry</span>
          </div>
          <button
            onClick={() => setMobileSheetOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 pt-3">
          {/* Collision Mode on Phone */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <span className="font-semibold text-slate-300">Collision Physics</span>
            <div className="flex gap-1">
              <button
                onClick={() => setParams((p) => ({ ...p, collisionMode: 'explode' }))}
                className={`px-2.5 py-1 rounded font-bold ${
                  params.collisionMode === 'explode' ? 'bg-rose-500 text-white' : 'text-slate-400'
                }`}
              >
                Explode
              </button>
              <button
                onClick={() => setParams((p) => ({ ...p, collisionMode: 'bounce' }))}
                className={`px-2.5 py-1 rounded font-bold ${
                  params.collisionMode === 'bounce' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                Bounce
              </button>
            </div>
          </div>

          {/* Quick Sliders */}
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Gravity Constant (G)</span>
                <span className="font-mono text-amber-400 font-bold">{params.gravity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.45"
                max="1.8"
                step="0.05"
                value={params.gravity}
                onChange={(e) => {
                  setParams((p) => ({ ...p, gravity: Number(e.target.value) }));
                  resetSimulation();
                }}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Incoming Speed (v₀)</span>
                <span className="font-mono text-amber-400 font-bold">{params.velocity.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="4.5"
                max="10.5"
                step="0.1"
                value={params.velocity}
                onChange={(e) => {
                  setParams((p) => ({ ...p, velocity: Number(e.target.value) }));
                  resetSimulation();
                }}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Approach Offset (y₀)</span>
                <span className="font-mono text-amber-400 font-bold">{params.offset}</span>
              </div>
              <input
                type="range"
                min="-230"
                max="10"
                step="5"
                value={params.offset}
                onChange={(e) => {
                  setParams((p) => ({ ...p, offset: Number(e.target.value) }));
                  resetSimulation();
                }}
              />
            </div>
          </div>

          {/* Phone Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Closest Pass</span>
              <strong className="text-sm text-slate-100">
                {Number.isFinite(closestApproach) ? closestApproach.toFixed(1) : '—'} u
              </strong>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Earth Distance</span>
              <strong className="text-sm text-slate-100">
                {primaryBody?.isDestroyed ? 'IMPACT (R=52)' : currentDistToEarth > 0 ? `${currentDistToEarth.toFixed(0)} u` : '—'}
              </strong>
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
            <Sparkline data={energyHistory} currentEnergy={primaryEnergy} height={46} />
          </div>

          <button
            onClick={handleDownloadStandalone}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md"
          >
            <Download className="w-4 h-4" />
            <span>Download Standalone Mobile HTML File</span>
          </button>
        </div>
      </div>

      {/* Guide Modal */}
      {activeTab === 'guide' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Info className="w-5 h-5" />
                <h3 className="text-base text-slate-100">Mobile & Standalone Guide</h3>
              </div>
              <button
                onClick={() => setActiveTab('sim')}
                className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1 rounded"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <p>
                <strong>Phone Touch Controls:</strong> Drag with one finger to rotate around the 3D globe and orbital plane. Pinch with two fingers to zoom in and out.
              </p>
              <p>
                <strong>Standalone HTML File:</strong> You can download or open the dedicated single-file HTML version (<code>/orbital-mobile.html</code>) directly on any phone without installing an app or running a local server.
              </p>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-amber-300 space-y-1">
                <div>Earth Physical Radius: R = 52.0 units</div>
                <div>Surface Explosions: Fireball + Shockwave + Debris + Craters</div>
                <div>Thumb Zone: Large ergonomic bottom action button with vibration feedback</div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <a
                href="/orbital-mobile.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-400 flex items-center gap-1 font-semibold"
              >
                <span>Launch /orbital-mobile.html</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => setActiveTab('sim')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs"
              >
                Return to Simulator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-4 py-3 text-center text-[11px] text-slate-500">
        Orbital mechanics educational model with simulated 3D celestial globes · Touch and phone-orientation optimized.
      </footer>
    </div>
  );
}
