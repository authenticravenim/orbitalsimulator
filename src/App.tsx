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
  CollisionMode,
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
  Sparkles,
  Info,
  Activity,
  Sliders,
  Crosshair,
  Flame,
  Volume2,
  VolumeX,
  AlertTriangle,
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

      // Diurnal rotation angle
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

          // Track closest approach of primary body
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

  // Single Step Trigger
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

  // Telemetry Metrics
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
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans">
      {/* 1. TOP BAR CONTRACT: Brand Wordmark — 3 Single-Line Nav Links — Primary Action */}
      <header className="h-16 px-6 md:px-8 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between gap-8">
        {/* Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-sky-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Globe2 className="w-5 h-5" />
          </div>
          <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
            Orbital Encounter Lab
          </span>
        </div>

        {/* 3 Single-Line Nav Links */}
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

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={resetSimulation}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-200 transition-colors whitespace-nowrap"
            title="Reset system to initial trajectory (R)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset System</span>
          </button>
        </div>
      </header>

      {/* Hero Subtitle & Metadata Bar */}
      <div className="px-6 md:px-8 py-3.5 border-b border-slate-800/40 bg-slate-900/30 flex items-center justify-between gap-4 text-xs text-slate-400 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-amber-400 uppercase tracking-wider text-[11px]">
            Physical 3D Gravity Simulator
          </span>
          <span aria-hidden="true">·</span>
          <span>Surface Collision Explosions</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-slate-300">
            {activePreset !== 'custom' ? PRESETS[activePreset].name : 'Custom Parameters'}
          </span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-3 font-mono">
          {impacts.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px]">
              <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>{impacts.length} IMPACT{impacts.length > 1 ? 'S' : ''} DETECTED</span>
            </span>
          )}
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isComplete
                  ? 'bg-slate-400'
                  : isAdvancing
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300 font-medium">
              {isComplete
                ? 'Encounter Finished'
                : isAdvancing
                ? 'Simulation Running'
                : controlMode === 'hold'
                ? 'Hold SPACE to Run'
                : 'Paused'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 md:px-6 lg:px-8 py-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px] gap-5 items-start">
        {/* Left Column: 3D Viewport & Transport Bar */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* 3D Viewport Container */}
          <div
            className={`relative rounded-xl border overflow-hidden bg-slate-950 shadow-2xl transition-all duration-200 ${
              latestImpact
                ? 'border-rose-500/50 shadow-[0_0_40px_rgba(244,63,94,0.18)]'
                : isAdvancing
                ? 'border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.12)]'
                : 'border-slate-800'
            }`}
            style={{ height: 'min(68vh, 740px)', minHeight: '440px' }}
          >
            {/* Viewport Floating Top HUD */}
            <div className="absolute top-3 left-4 right-4 z-10 flex items-center justify-between gap-3 pointer-events-none flex-wrap">
              {/* Perspective Mode Switcher */}
              <div className="pointer-events-auto flex items-center bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-lg p-1 gap-1 text-xs font-medium">
                <button
                  onClick={() => {
                    setCameraMode('perspective');
                    setActiveTab('sim');
                  }}
                  className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    cameraMode === 'perspective'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>3D Orbit</span>
                </button>
                <button
                  onClick={() => {
                    setCameraMode('topdown');
                    setActiveTab('sim');
                  }}
                  className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    cameraMode === 'topdown'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Top-Down</span>
                </button>
                <button
                  onClick={() => {
                    setCameraMode('globe');
                    setActiveTab('globe');
                  }}
                  className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    cameraMode === 'globe'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe2 className="w-3.5 h-3.5" />
                  <span>Earth Globe</span>
                </button>
                <button
                  onClick={() => {
                    setCameraMode('follow');
                    setActiveTab('sim');
                  }}
                  className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    cameraMode === 'follow'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>Chase Cam</span>
                </button>
              </div>

              {/* Model Time Readout */}
              <div className="bg-slate-950/85 backdrop-blur-md border border-slate-800 rounded-lg px-3 py-1 font-mono text-xs text-slate-300 flex items-center gap-2">
                <span className="text-slate-500">TIME</span>
                <span className="text-amber-400 font-bold tabular-nums">
                  T+{simTime.toFixed(1)}s
                </span>
              </div>
            </div>

            {/* The 3D Three.js Canvas with Explosions */}
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

            {/* Hold Space Center Banner Prompt */}
            {controlMode === 'hold' && !isHolding && !isComplete && simTime === 0 && (
              <div className="absolute left-1/2 bottom-16 -translate-x-1/2 pointer-events-none z-20 flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-950/90 border border-amber-500/40 text-amber-200 text-xs backdrop-blur-md shadow-xl animate-pulse">
                <kbd className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 font-mono font-bold text-amber-300 text-[10px]">
                  SPACE
                </kbd>
                <span>Hold spacebar or orange button to run encounter</span>
              </div>
            )}

            {/* Impact Flash Alert Overlay on Canvas */}
            {latestImpact && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <div className="px-4 py-2 rounded-lg bg-rose-950/90 border border-rose-500/60 backdrop-blur-md text-xs font-mono text-rose-200 shadow-2xl flex items-center gap-2.5">
                  <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
                  <span>
                    <strong>SURFACE EXPLOSION:</strong> {latestImpact.bodyName} struck {latestImpact.target.toUpperCase()}!
                    {latestImpact.lat !== undefined && (
                      <span className="ml-1 text-amber-300">
                        [{latestImpact.lat >= 0 ? `${latestImpact.lat.toFixed(1)}°N` : `${Math.abs(latestImpact.lat).toFixed(1)}°S`},{' '}
                        {latestImpact.lon! >= 0 ? `${latestImpact.lon!.toFixed(1)}°E` : `${Math.abs(latestImpact.lon!).toFixed(1)}°W`}]
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Viewport Bottom Celestial Legend */}
            <div className="absolute bottom-3 left-4 z-10 pointer-events-none flex items-center gap-3 text-xs bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800/80 flex-wrap">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]"></span>
                Earth (R=52)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                Red Moon (R=14)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                Incoming Body
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                Companion
              </span>
            </div>
          </div>

          {/* Transport Controls Bar */}
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Hold / Play Primary Button */}
              {controlMode === 'hold' ? (
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (!isComplete) setIsHolding(true);
                  }}
                  onPointerUp={() => setIsHolding(false)}
                  onPointerLeave={() => setIsHolding(false)}
                  className={`px-5 py-2 rounded-lg font-semibold text-xs transition-all flex items-center gap-2 select-none touch-none ${
                    isHolding
                      ? 'bg-amber-500 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.6)] scale-[0.98]'
                      : 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-md'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isHolding ? 'Running Encounter…' : 'Hold to Run'}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!isComplete) setIsAutoRunning((prev) => !prev);
                  }}
                  className={`px-5 py-2 rounded-lg font-semibold text-xs transition-all flex items-center gap-2 ${
                    isAutoRunning
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700'
                  }`}
                >
                  {isAutoRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Auto Run</span>
                    </>
                  )}
                </button>
              )}

              {/* Single Step Button */}
              <button
                onClick={handleSingleStep}
                disabled={isComplete}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800/90 border border-slate-700/80 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                title="Advance 1 step (hold Right Arrow to repeat)"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Step</span>
              </button>

              {/* Reset Button */}
              <button
                onClick={resetSimulation}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800/90 border border-slate-700/80 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1.5"
                title="Restart simulation (R)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>
            </div>

            {/* Right Transport Controls */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Collision Mode Switch */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-500 text-[11px] px-1.5">Collision</span>
                <button
                  onClick={() => {
                    setParams((prev) => ({ ...prev, collisionMode: 'explode' }));
                  }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                    params.collisionMode === 'explode'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Bodies explode on surface impact"
                >
                  <Flame className="w-3 h-3" />
                  <span>Explode</span>
                </button>
                <button
                  onClick={() => {
                    setParams((prev) => ({ ...prev, collisionMode: 'bounce' }));
                  }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    params.collisionMode === 'bounce'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Bodies bounce off surface"
                >
                  <span>Bounce</span>
                </button>
              </div>

              {/* Control Mode Switch */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-500 text-[11px] px-1.5">Mode</span>
                <button
                  onClick={() => {
                    setControlMode('hold');
                    setIsAutoRunning(false);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    controlMode === 'hold'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Hold
                </button>
                <button
                  onClick={() => {
                    setControlMode('auto');
                    setIsHolding(false);
                  }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    controlMode === 'auto'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Auto
                </button>
              </div>

              {/* Playback Speed */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Speed</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:border-amber-400 focus:outline-none"
                  aria-label="Simulation speed multiplier"
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1.0}>1.0×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2.0}>2.0×</option>
                  <option value={3.0}>3.0×</option>
                </select>
              </div>

              {/* Sound Toggle */}
              <button
                onClick={() =>
                  setDisplayOptions((prev) => ({
                    ...prev,
                    audioEffects: !prev.audioEffects,
                  }))
                }
                className={`p-1.5 rounded-lg border transition-colors ${
                  displayOptions.audioEffects
                    ? 'bg-slate-800 border-slate-700 text-amber-400'
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
                title={displayOptions.audioEffects ? 'Mute Audio' : 'Enable Explosion Sound'}
              >
                {displayOptions.audioEffects ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <aside className="flex flex-col gap-4 min-w-0">
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

          {/* Section 2: Initial Parameters */}
          <section className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col gap-3.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Sliders className="w-4 h-4" />
                <span>Parameters</span>
              </span>
              <span className="font-mono text-slate-500 text-[11px]">INITIAL CONDITIONS</span>
            </div>

            {/* Gravity G */}
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

            {/* Velocity v0 */}
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

            {/* Approach Offset y0 */}
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

            {/* Pair Separation */}
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

            {/* View Zoom */}
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

          {/* Section 3: Live Telemetry & Impact Logging */}
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

            {/* Sparkline Graph */}
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Incoming Body Energy History</span>
                <span className="text-slate-500">Dashed Line: 0 = Escape</span>
              </div>
              <Sparkline
                data={energyHistory}
                currentEnergy={primaryEnergy}
                height={54}
              />
            </div>

            {/* Impact Report Card */}
            {impacts.length > 0 && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between text-rose-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    <span>Impact Event Log</span>
                  </span>
                  <span className="text-[10px] text-slate-400">{impacts.length} total</span>
                </div>
                {impacts.map((imp) => (
                  <div key={imp.id} className="text-[11px] text-slate-300 border-t border-rose-900/40 pt-1">
                    <span className="text-amber-400 font-bold">{imp.bodyName}</span> struck{' '}
                    <span className="text-sky-300">{imp.target.toUpperCase()}</span> at v = {imp.speed.toFixed(1)} u/s
                    {imp.lat !== undefined && (
                      <div className="text-[10px] text-slate-400">
                        Coords: {imp.lat >= 0 ? `${imp.lat.toFixed(1)}°N` : `${Math.abs(imp.lat).toFixed(1)}°S`},{' '}
                        {imp.lon! >= 0 ? `${imp.lon!.toFixed(1)}°E` : `${Math.abs(imp.lon!).toFixed(1)}°W`} (Decal marked)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 4: Display & 3D Overlays */}
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
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>Impact Explosions</span>
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
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
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
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>Trajectory Trails</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.referenceOrbits}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      referenceOrbits: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>Orbit Distance Rings</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.potentialWell}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      potentialWell: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>3D Potential Funnel</span>
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
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>Globe Lat/Long Grid</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.cloudLayer}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      cloudLayer: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>Earth Cloud Layer</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={displayOptions.atmosphereGlow}
                  onChange={(e) =>
                    setDisplayOptions((prev) => ({
                      ...prev,
                      atmosphereGlow: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
                />
                <span>Rayleigh Glow Halo</span>
              </label>
            </div>
          </section>
        </aside>
      </main>

      {/* Guide / Educational Modal */}
      {activeTab === 'guide' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <Info className="w-5 h-5" />
                <h3 className="text-base text-slate-100">Physical Collisions & Mechanics</h3>
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
                In real celestial mechanics, celestial bodies possess finite physical radii.
                Orbits that dip below a body&apos;s physical radius result in surface impact collisions.
              </p>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-amber-300 space-y-1">
                <div>Earth Physical Radius: R = 52.0 units</div>
                <div>Red Moon Radius: R = 14.0 units</div>
                <div>Explode Mode: Kinetic Energy converted to impact fireball & crater</div>
                <div>Bounce Mode: Semi-inelastic restitution impulse (e = 0.45)</div>
              </div>
              <p>
                <strong>Collision Dynamics:</strong>
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400">
                <li>
                  <strong>Impact Explosions:</strong> Incoming bodies detonating on the Earth or Moon trigger an expanding 3D fireball, shockwave, ejecta debris shower, light flash, and permanent smoking crater decal.
                </li>
                <li>
                  <strong>Crater Decal Mapping:</strong> The collision location on Earth is calculated in geographic latitude and longitude and pinned to the globe, rotating naturally with Earth&apos;s diurnal spin!
                </li>
                <li>
                  <strong>Direct Collision Preset:</strong> Load Preset 3 to observe a direct head-on collision strike with Earth.
                </li>
              </ul>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setActiveTab('sim')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg text-xs"
              >
                Back to Simulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 px-6 py-4 text-center text-xs text-slate-500">
        Orbital mechanics educational model with normalized units, physical surface collision boundaries, and simulated 3D celestial globes.
      </footer>
    </div>
  );
}
