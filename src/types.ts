export type ControlMode = 'hold' | 'auto';

export type CameraViewMode = 'perspective' | 'topdown' | 'globe' | 'follow';

export type PresetKey = 'capture' | 'flyby' | 'wide' | 'pair' | 'impact' | 'custom';

export type CollisionMode = 'explode' | 'bounce';

export interface CelestialBody {
  id: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  vx: number;
  vy: number;
  vz?: number;
  m: number;
  color: string;
  isDestroyed?: boolean;
  impactedTarget?: 'earth' | 'moon' | 'companion';
  trail: { x: number; y: number; z?: number; t: number }[];
}

export interface MoonBody {
  x: number;
  y: number;
  z?: number;
  m: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
}

export interface ImpactEvent {
  id: string;
  bodyId: string;
  bodyName: string;
  target: 'earth' | 'moon' | 'companion';
  x: number;
  y: number;
  z: number;
  speed: number;
  kineticEnergy: number;
  time: number;
  lat?: number;
  lon?: number;
}

export interface SimulationParameters {
  gravity: number;       // Gravitational strength G
  velocity: number;      // Incoming speed v0
  offset: number;        // Impact parameter / y offset
  separation: number;    // Pair separation d
  zoom: number;          // Visual scale / zoom %
  collisionMode: CollisionMode;
}

export interface DisplayOptions {
  trails: boolean;
  referenceOrbits: boolean;
  bodyLabels: boolean;
  starField: boolean;
  potentialWell: boolean;
  latLongGrid: boolean;
  atmosphereGlow: boolean;
  cloudLayer: boolean;
  explosionEffects: boolean;
  audioEffects: boolean;
}

export interface TelemetryData {
  time: number;
  closestApproach: number;
  distanceToEarth: number;
  incomingEnergy: number;
  companionEnergy: number;
  isBound: boolean;
  energyHistory: number[];
  status: 'idle' | 'running' | 'paused' | 'complete' | 'impact';
  impacts: ImpactEvent[];
}
