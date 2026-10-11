import {
  CelestialBody,
  MoonBody,
  SimulationParameters,
  ImpactEvent,
  CollisionMode,
} from '../types';

export const EARTH_MASS = 10000;
export const MOON_RADIUS = 175;
export const MOON_MASS = 4;
export const EARTH_VISUAL_RADIUS = 52; // Visual scale for Earth in 3D
export const MOON_VISUAL_RADIUS = 14;  // Visual scale for Moon in 3D
export const EARTH_COLLISION_RADIUS = 52.0;
export const MOON_COLLISION_RADIUS = 14.0;
export const MUTUAL_COLLISION_RADIUS = 14.0;

export function createInitialSimulationState(params: SimulationParameters) {
  const G = params.gravity;
  const v = params.velocity;
  const off = params.offset;
  const sep = params.separation;

  const moonSpeed = Math.sqrt((G * EARTH_MASS) / MOON_RADIUS);
  const moon: MoonBody = {
    x: MOON_RADIUS,
    y: -5,
    z: 0,
    m: MOON_MASS,
    vx: 0,
    vy: moonSpeed,
    radius: MOON_RADIUS,
    angle: Math.atan2(-5, MOON_RADIUS),
  };

  const bodies: CelestialBody[] = [
    {
      id: 'primary',
      name: 'Incoming Body',
      x: -430,
      y: off,
      z: 0,
      vx: v,
      vy: 0.12,
      vz: 0,
      m: 1.5,
      color: '#f59e0b',
      isDestroyed: false,
      trail: [{ x: -430, y: off, z: 0, t: 0 }],
    },
    {
      id: 'companion',
      name: 'Companion',
      x: -430,
      y: off - sep,
      z: 0,
      vx: v - 0.12,
      vy: -0.1,
      vz: 0,
      m: 1.0,
      color: '#94a3b8',
      isDestroyed: false,
      trail: [{ x: -430, y: off - sep, z: 0, t: 0 }],
    },
  ];

  return { moon, bodies };
}

export function computeAcceleration(
  b: CelestialBody,
  moon: MoonBody,
  otherBody?: CelestialBody,
  G = 1.0
): { ax: number; ay: number; az: number } {
  if (b.isDestroyed) {
    return { ax: 0, ay: 0, az: 0 };
  }

  // Earth at (0, 0, 0)
  const dxE = -b.x;
  const dyE = -b.y;
  const dzE = -(b.z || 0);
  const r2E = dxE * dxE + dyE * dyE + dzE * dzE + 100;
  const fE = (G * EARTH_MASS) / Math.pow(r2E, 1.5);
  let ax = dxE * fE;
  let ay = dyE * fE;
  let az = dzE * fE;

  // Moon pull
  const dxM = moon.x - b.x;
  const dyM = moon.y - b.y;
  const dzM = (moon.z || 0) - (b.z || 0);
  const r2M = dxM * dxM + dyM * dyM + dzM * dzM + 20;
  const fM = (G * moon.m) / Math.pow(r2M, 1.5);
  ax += dxM * fM;
  ay += dyM * fM;
  az += dzM * fM;

  // Mutual pair pull (only if other body is intact)
  if (otherBody && !otherBody.isDestroyed) {
    const dxO = otherBody.x - b.x;
    const dyO = otherBody.y - b.y;
    const dzO = (otherBody.z || 0) - (b.z || 0);
    const r2O = dxO * dxO + dyO * dyO + dzO * dzO + 12;
    const fO = (G * otherBody.m) / Math.pow(r2O, 1.5);
    ax += dxO * fO;
    ay += dyO * fO;
    az += dzO * fO;
  }

  return { ax, ay, az };
}

export function computeSpecificOrbitalEnergy(b: CelestialBody, G = 1.0): number {
  if (b.isDestroyed) return 0;
  const v2 = b.vx * b.vx + b.vy * b.vy + (b.vz || 0) * (b.vz || 0);
  const r = Math.max(Math.hypot(b.x, b.y, b.z || 0), 1);
  return 0.5 * v2 - (G * EARTH_MASS) / r;
}

/**
 * Calculates terrestrial latitude and longitude for a collision on Earth
 * taking into account axial tilt and diurnal rotation.
 */
function calculateEarthCoords(
  x: number,
  y: number,
  z: number,
  earthRotationAngle: number
): { lat: number; lon: number } {
  // Invert axial tilt (rotX by -0.409 rad)
  const tilt = -0.409;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const yTilted = y * cosT - z * sinT;
  const zTilted = y * sinT + z * cosT;
  const xTilted = x;

  // Invert diurnal rotation
  const cosR = Math.cos(-earthRotationAngle);
  const sinR = Math.sin(-earthRotationAngle);
  const xLocal = xTilted * cosR - yTilted * sinR;
  const yLocal = xTilted * sinR + yTilted * cosR;
  const zLocal = zTilted;

  const r = Math.max(1, Math.hypot(xLocal, yLocal, zLocal));
  const lat = Math.asin(Math.max(-1, Math.min(1, zLocal / r))) * (180 / Math.PI);
  let lon = Math.atan2(yLocal, xLocal) * (180 / Math.PI);
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return { lat, lon };
}

export function integrateStep(
  bodies: CelestialBody[],
  moon: MoonBody,
  dt: number,
  G = 1.0,
  time = 0,
  collisionMode: CollisionMode = 'explode',
  earthRotation = 0
): { done: boolean; impacts: ImpactEvent[] } {
  const impacts: ImpactEvent[] = [];

  // 1. Current accelerations
  const oldAcc = bodies.map((b) =>
    computeAcceleration(b, moon, bodies.find((o) => o.id !== b.id), G)
  );

  // 2. Update positions for active bodies
  bodies.forEach((b, i) => {
    if (b.isDestroyed) return;
    b.x += b.vx * dt + 0.5 * oldAcc[i].ax * dt * dt;
    b.y += b.vy * dt + 0.5 * oldAcc[i].ay * dt * dt;
    b.z = (b.z || 0) + (b.vz || 0) * dt + 0.5 * oldAcc[i].az * dt * dt;
  });

  // 3. New accelerations
  const newAcc = bodies.map((b) =>
    computeAcceleration(b, moon, bodies.find((o) => o.id !== b.id), G)
  );

  // 4. Update velocities for active bodies
  bodies.forEach((b, i) => {
    if (b.isDestroyed) return;
    b.vx += 0.5 * (oldAcc[i].ax + newAcc[i].ax) * dt;
    b.vy += 0.5 * (oldAcc[i].ay + newAcc[i].ay) * dt;
    b.vz = (b.vz || 0) + 0.5 * (oldAcc[i].az + newAcc[i].az) * dt;
  });

  // 5. Update Moon orbit
  const rM = Math.hypot(moon.x, moon.y);
  const omega = Math.sqrt((G * EARTH_MASS) / Math.pow(rM, 3));
  moon.angle += omega * dt;
  moon.x = rM * Math.cos(moon.angle);
  moon.y = rM * Math.sin(moon.angle);
  moon.vx = -Math.sin(moon.angle) * Math.sqrt((G * EARTH_MASS) / rM);
  moon.vy = Math.cos(moon.angle) * Math.sqrt((G * EARTH_MASS) / rM);

  // 6. PHYSICAL COLLISION DETECTION & RESOLUTION
  bodies.forEach((b) => {
    if (b.isDestroyed) return;

    // A. Collision with Earth (R = 52)
    const distToEarth = Math.hypot(b.x, b.y, b.z || 0);
    if (distToEarth <= EARTH_COLLISION_RADIUS) {
      const speed = Math.hypot(b.vx, b.vy, b.vz || 0);
      const ke = 0.5 * b.m * speed * speed;

      // Clamp position strictly to surface of Earth so it NEVER plunges inside
      const nx = b.x / (distToEarth || 1);
      const ny = b.y / (distToEarth || 1);
      const nz = (b.z || 0) / (distToEarth || 1);
      b.x = nx * EARTH_COLLISION_RADIUS;
      b.y = ny * EARTH_COLLISION_RADIUS;
      b.z = nz * EARTH_COLLISION_RADIUS;

      const { lat, lon } = calculateEarthCoords(b.x, b.y, b.z, earthRotation);

      impacts.push({
        id: `impact-${b.id}-${time.toFixed(2)}`,
        bodyId: b.id,
        bodyName: b.name,
        target: 'earth',
        x: b.x,
        y: b.y,
        z: b.z,
        speed,
        kineticEnergy: ke,
        time,
        lat,
        lon,
      });

      if (collisionMode === 'explode') {
        b.isDestroyed = true;
        b.impactedTarget = 'earth';
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
      } else {
        // Elastic / semi-inelastic surface rebound
        const dot = b.vx * nx + b.vy * ny + (b.vz || 0) * nz;
        if (dot < 0) {
          const restitution = 0.45;
          b.vx = (b.vx - (1 + restitution) * dot * nx);
          b.vy = (b.vy - (1 + restitution) * dot * ny);
          b.vz = ((b.vz || 0) - (1 + restitution) * dot * nz);
          // Push slightly outside surface
          b.x = nx * (EARTH_COLLISION_RADIUS + 0.5);
          b.y = ny * (EARTH_COLLISION_RADIUS + 0.5);
          b.z = nz * (EARTH_COLLISION_RADIUS + 0.5);
        }
      }
    }

    // B. Collision with Red Moon (R = 14)
    if (!b.isDestroyed) {
      const dxM = b.x - moon.x;
      const dyM = b.y - moon.y;
      const dzM = (b.z || 0) - (moon.z || 0);
      const distToMoon = Math.hypot(dxM, dyM, dzM);

      if (distToMoon <= MOON_COLLISION_RADIUS) {
        const speed = Math.hypot(b.vx - moon.vx, b.vy - moon.vy, (b.vz || 0));
        const ke = 0.5 * b.m * speed * speed;

        const mnx = dxM / (distToMoon || 1);
        const mny = dyM / (distToMoon || 1);
        const mnz = dzM / (distToMoon || 1);
        b.x = moon.x + mnx * MOON_COLLISION_RADIUS;
        b.y = moon.y + mny * MOON_COLLISION_RADIUS;
        b.z = (moon.z || 0) + mnz * MOON_COLLISION_RADIUS;

        impacts.push({
          id: `impact-${b.id}-moon-${time.toFixed(2)}`,
          bodyId: b.id,
          bodyName: b.name,
          target: 'moon',
          x: b.x,
          y: b.y,
          z: b.z,
          speed,
          kineticEnergy: ke,
          time,
        });

        if (collisionMode === 'explode') {
          b.isDestroyed = true;
          b.impactedTarget = 'moon';
          b.vx = moon.vx;
          b.vy = moon.vy;
          b.vz = 0;
        } else {
          const dot = (b.vx - moon.vx) * mnx + (b.vy - moon.vy) * mny + (b.vz || 0) * mnz;
          if (dot < 0) {
            const restitution = 0.45;
            b.vx = moon.vx + ((b.vx - moon.vx) - (1 + restitution) * dot * mnx);
            b.vy = moon.vy + ((b.vy - moon.vy) - (1 + restitution) * dot * mny);
            b.vz = ((b.vz || 0) - (1 + restitution) * dot * mnz);
            b.x = moon.x + mnx * (MOON_COLLISION_RADIUS + 0.5);
            b.y = moon.y + mny * (MOON_COLLISION_RADIUS + 0.5);
            b.z = (moon.z || 0) + mnz * (MOON_COLLISION_RADIUS + 0.5);
          }
        }
      }
    }
  });

  // C. Mutual Collision between Primary and Companion
  const b1 = bodies[0];
  const b2 = bodies[1];
  if (b1 && b2 && !b1.isDestroyed && !b2.isDestroyed) {
    const distBetween = Math.hypot(b1.x - b2.x, b1.y - b2.y, (b1.z || 0) - (b2.z || 0));
    if (distBetween <= MUTUAL_COLLISION_RADIUS) {
      const relVx = b1.vx - b2.vx;
      const relVy = b1.vy - b2.vy;
      const relVz = (b1.vz || 0) - (b2.vz || 0);
      const relSpeed = Math.hypot(relVx, relVy, relVz);
      const ke = 0.5 * ((b1.m * b2.m) / (b1.m + b2.m)) * relSpeed * relSpeed;

      const midX = (b1.x + b2.x) * 0.5;
      const midY = (b1.y + b2.y) * 0.5;
      const midZ = ((b1.z || 0) + (b2.z || 0)) * 0.5;

      impacts.push({
        id: `impact-mutual-${time.toFixed(2)}`,
        bodyId: 'mutual',
        bodyName: 'Incoming Pair Collision',
        target: 'companion',
        x: midX,
        y: midY,
        z: midZ,
        speed: relSpeed,
        kineticEnergy: ke,
        time,
      });

      if (collisionMode === 'explode') {
        b1.isDestroyed = true;
        b2.isDestroyed = true;
        b1.impactedTarget = 'companion';
        b2.impactedTarget = 'companion';
      }
    }
  }

  // 7. Record trajectory trails for active or newly impacted bodies
  bodies.forEach((b) => {
    const lastPt = b.trail[b.trail.length - 1];
    if (!lastPt || Math.hypot(b.x - lastPt.x, b.y - lastPt.y) > 2.0) {
      b.trail.push({ x: b.x, y: b.y, z: b.z || 0, t: time });
      if (b.trail.length > 2000) {
        b.trail.shift();
      }
    }
  });

  // Check completion: All bodies escaped or destroyed
  const allInactive = bodies.every(
    (b) => b.isDestroyed || Math.abs(b.x) > 850 || Math.abs(b.y) > 850
  );

  return { done: allInactive, impacts };
}
