import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  CelestialBody,
  MoonBody,
  CameraViewMode,
  DisplayOptions,
  ImpactEvent,
} from '../types';
import {
  EARTH_VISUAL_RADIUS,
  MOON_VISUAL_RADIUS,
  MOON_RADIUS,
} from '../utils/physics';
import {
  createEarthDayTexture,
  createEarthNightTexture,
  createEarthSpecularMap,
  createEarthCloudTexture,
  createRedMoonTexture,
  createAsteroidTexture,
} from '../utils/textures';
import { playExplosionSound } from '../utils/audio';
import skyboxImg from '../assets/images/skybox_deep_space_1791692502178.jpg';

interface ActiveExplosion {
  id: string;
  group: THREE.Group;
  fireball: THREE.Mesh;
  shockwave: THREE.Mesh;
  particles: THREE.Points;
  particleVels: Float32Array;
  light: THREE.PointLight;
  startTime: number;
  duration: number;
  maxRadius: number;
}

interface Orbital3DCanvasProps {
  bodies: CelestialBody[];
  moon: MoonBody;
  viewMode: CameraViewMode;
  displayOptions: DisplayOptions;
  zoom: number;
  time: number;
  closestApproach: number;
  impacts?: ImpactEvent[];
  onResetCamera?: () => void;
}

export const Orbital3DCanvas: React.FC<Orbital3DCanvasProps> = ({
  bodies,
  moon,
  viewMode,
  displayOptions,
  zoom,
  time,
  closestApproach,
  impacts = [],
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // References for Three.js objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Mesh refs
  const earthGroupRef = useRef<THREE.Group | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const earthGridRef = useRef<THREE.Group | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);

  const moonMeshRef = useRef<THREE.Mesh | null>(null);
  const moonOrbitLineRef = useRef<THREE.Line | null>(null);

  const bodyMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const trailLinesRef = useRef<Map<string, THREE.Line>>(new Map());
  const velocityArrowsRef = useRef<Map<string, THREE.ArrowHelper>>(new Map());

  const potentialWellMeshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.Group | null>(null);
  const starsGroupRef = useRef<THREE.Points | null>(null);

  // Explosions & Crater Decals
  const activeExplosionsRef = useRef<ActiveExplosion[]>([]);
  const handledImpactIdsRef = useRef<Set<string>>(new Set());
  const cratersGroupRef = useRef<THREE.Group | null>(null);

  // Camera animation target & orbit state
  const cameraTargetPos = useRef<THREE.Vector3>(new THREE.Vector3(0, -520, 420));
  const cameraTargetLookAt = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const currentLookAt = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // Interactive Orbit Controls State
  const isDragging = useRef(false);
  const dragButton = useRef<number>(0);
  const prevMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const orbitSpherical = useRef<{ radius: number; theta: number; phi: number }>({
    radius: 720,
    theta: Math.PI * 0.5,
    phi: Math.PI * 0.28,
  });
  const panOffset = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  const [webglError, setWebglError] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>('3D Orbit Perspective');

  // Handle camera view modes
  useEffect(() => {
    const zoomMultiplier = 100 / zoom;
    if (viewMode === 'perspective') {
      orbitSpherical.current = {
        radius: 740 * zoomMultiplier,
        theta: Math.PI * 0.5,
        phi: Math.PI * 0.28,
      };
      panOffset.current.set(0, 0, 0);
      setCameraLabel('3D Angled Perspective');
    } else if (viewMode === 'topdown') {
      orbitSpherical.current = {
        radius: 800 * zoomMultiplier,
        theta: Math.PI * 0.5,
        phi: 0.001,
      };
      panOffset.current.set(0, 0, 0);
      setCameraLabel('Orbital Planar (Top-Down)');
    } else if (viewMode === 'globe') {
      orbitSpherical.current = {
        radius: 175 * zoomMultiplier,
        theta: Math.PI * 0.45,
        phi: Math.PI * 0.42,
      };
      panOffset.current.set(0, 0, 0);
      setCameraLabel('Earth Globe Inspector');
    } else if (viewMode === 'follow') {
      setCameraLabel('Target Tracking Cam');
    }
  }, [viewMode, zoom]);

  // Pointer & Touch Orbit Event Handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    dragButton.current = e.button;
    prevMousePos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - prevMousePos.current.x;
    const dy = e.clientY - prevMousePos.current.y;
    prevMousePos.current = { x: e.clientX, y: e.clientY };

    if (dragButton.current === 2 || e.shiftKey) {
      const panSpeed = 0.6;
      panOffset.current.x -= dx * panSpeed;
      panOffset.current.y += dy * panSpeed;
    } else {
      const rotSpeed = 0.006;
      orbitSpherical.current.theta -= dx * rotSpeed;
      orbitSpherical.current.phi = Math.max(
        0.02,
        Math.min(Math.PI * 0.49, orbitSpherical.current.phi + dy * rotSpeed)
      );
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.7;
    orbitSpherical.current.radius = Math.max(
      90,
      Math.min(2200, orbitSpherical.current.radius + zoomDelta)
    );
  }, []);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL is not supported or hardware acceleration is disabled.');
      return;
    }

    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#03060f');

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      5,
      6000
    );
    cameraRef.current = camera;
    camera.up.set(0, 0, 1);

    // Load Skybox texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      skyboxImg,
      (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const bgSphereGeo = new THREE.SphereGeometry(3500, 32, 32);
        const bgSphereMat = new THREE.MeshBasicMaterial({
          map: tex,
          side: THREE.BackSide,
        });
        const skyMesh = new THREE.Mesh(bgSphereGeo, bgSphereMat);
        scene.add(skyMesh);
      },
      undefined,
      () => {
        scene.background = new THREE.Color('#040712');
      }
    );

    // 1. Lighting System
    const sunLight = new THREE.DirectionalLight('#fff8ea', 2.2);
    sunLight.position.set(-600, 300, 250);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight('#7dd3fc', 0.8);
    rimLight.position.set(400, -500, -100);
    scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight('#1e293b', 0.45);
    scene.add(ambientLight);

    // 2. Realistic 3D Earth Globe
    const earthGroup = new THREE.Group();
    earthGroupRef.current = earthGroup;
    earthGroup.position.set(0, 0, 0);
    earthGroup.rotation.x = 0.409; // 23.44° axial tilt
    scene.add(earthGroup);

    // Procedural Earth Textures
    const earthDayTex = createEarthDayTexture();
    const earthNightTex = createEarthNightTexture();
    const earthSpecTex = createEarthSpecularMap();
    const earthCloudTex = createEarthCloudTexture();

    // Earth Surface Mesh
    const earthGeo = new THREE.SphereGeometry(EARTH_VISUAL_RADIUS, 64, 64);
    const earthMat = new THREE.MeshStandardMaterial({
      map: earthDayTex,
      roughnessMap: earthSpecTex,
      roughness: 0.55,
      metalness: 0.1,
      emissiveMap: earthNightTex,
      emissive: new THREE.Color('#ffc368'),
      emissiveIntensity: 0.45,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMeshRef.current = earthMesh;
    earthGroup.add(earthMesh);

    // Impact Craters Container on Earth Globe
    const cratersGroup = new THREE.Group();
    cratersGroupRef.current = cratersGroup;
    earthMesh.add(cratersGroup);

    // Earth Cloud Sphere Layer
    const cloudsGeo = new THREE.SphereGeometry(EARTH_VISUAL_RADIUS * 1.016, 48, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      map: earthCloudTex,
      transparent: true,
      opacity: 0.55,
      blending: THREE.NormalBlending,
      roughness: 0.9,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    cloudsMeshRef.current = cloudsMesh;
    earthGroup.add(cloudsMesh);

    // Atmospheric Rayleigh Glow Halo
    const atmoGeo = new THREE.SphereGeometry(EARTH_VISUAL_RADIUS * 1.05, 48, 48);
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        color: { value: new THREE.Color('#38bdf8') },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        uniform vec3 color;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.8);
          gl_FragColor = vec4(color, intensity * 0.85);
        }
      `,
    });
    const atmosphereMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmosphereRef.current = atmosphereMesh;
    earthGroup.add(atmosphereMesh);

    // Geographic Lat/Long Coordinate Grid
    const gridGroup = new THREE.Group();
    earthGridRef.current = gridGroup;
    const gridMat = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.28,
    });

    const lats = [-60, -30, 0, 30, 60];
    lats.forEach((lat) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const rad = Math.sin(phi) * (EARTH_VISUAL_RADIUS * 1.008);
      const z = Math.cos(phi) * (EARTH_VISUAL_RADIUS * 1.008);
      const circleGeo = new THREE.BufferGeometry();
      const pts: THREE.Vector3[] = [];
      const segments = 64;
      for (let s = 0; s <= segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(theta) * rad, Math.sin(theta) * rad, z));
      }
      circleGeo.setFromPoints(pts);
      const line = new THREE.Line(
        circleGeo,
        lat === 0
          ? new THREE.LineBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.6 })
          : gridMat
      );
      gridGroup.add(line);
    });

    const lons = [0, 45, 90, 135, 180, 225, 270, 315];
    lons.forEach((lon) => {
      const theta = lon * (Math.PI / 180);
      const meridianGeo = new THREE.BufferGeometry();
      const pts: THREE.Vector3[] = [];
      const segments = 48;
      for (let s = 0; s <= segments; s++) {
        const phi = (s / segments) * Math.PI;
        const rad = Math.sin(phi) * (EARTH_VISUAL_RADIUS * 1.008);
        const z = Math.cos(phi) * (EARTH_VISUAL_RADIUS * 1.008);
        pts.push(new THREE.Vector3(Math.cos(theta) * rad, Math.sin(theta) * rad, z));
      }
      meridianGeo.setFromPoints(pts);
      gridGroup.add(new THREE.Line(meridianGeo, gridMat));
    });
    earthGroup.add(gridGroup);

    // 3. Red Moon Globe in 3D
    const moonTex = createRedMoonTexture();
    const moonGeo = new THREE.SphereGeometry(MOON_VISUAL_RADIUS, 36, 36);
    const moonMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      roughness: 0.85,
      metalness: 0.15,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMeshRef.current = moonMesh;
    scene.add(moonMesh);

    // Red Moon Orbit Reference Line
    const moonOrbitGeo = new THREE.BufferGeometry();
    const moonOrbitPts: THREE.Vector3[] = [];
    const orbitSegments = 90;
    for (let i = 0; i <= orbitSegments; i++) {
      const angle = (i / orbitSegments) * Math.PI * 2;
      moonOrbitPts.push(
        new THREE.Vector3(
          Math.cos(angle) * MOON_RADIUS,
          Math.sin(angle) * MOON_RADIUS,
          0
        )
      );
    }
    moonOrbitGeo.setFromPoints(moonOrbitPts);
    const moonOrbitMat = new THREE.LineDashedMaterial({
      color: '#f87171',
      dashSize: 6,
      gapSize: 4,
      transparent: true,
      opacity: 0.65,
    });
    const moonOrbitLine = new THREE.Line(moonOrbitGeo, moonOrbitMat);
    moonOrbitLine.computeLineDistances();
    moonOrbitLineRef.current = moonOrbitLine;
    scene.add(moonOrbitLine);

    // 4. Orbital Coordinate Grid
    const orbitalPlaneGroup = new THREE.Group();
    gridHelperRef.current = orbitalPlaneGroup;

    [100, 200, 300, 420].forEach((r) => {
      const ringGeo = new THREE.BufferGeometry();
      const ringPts: THREE.Vector3[] = [];
      const segs = 80;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      ringGeo.setFromPoints(ringPts);
      const ringMat = new THREE.LineDashedMaterial({
        color: '#334155',
        dashSize: 8,
        gapSize: 6,
        transparent: true,
        opacity: 0.45,
      });
      const ringLine = new THREE.Line(ringGeo, ringMat);
      ringLine.computeLineDistances();
      orbitalPlaneGroup.add(ringLine);
    });

    const axisMat = new THREE.LineBasicMaterial({
      color: '#1e293b',
      transparent: true,
      opacity: 0.4,
    });
    const axesGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-550, 0, 0),
      new THREE.Vector3(550, 0, 0),
      new THREE.Vector3(0, -550, 0),
      new THREE.Vector3(0, 550, 0),
    ]);
    orbitalPlaneGroup.add(new THREE.LineSegments(axesGeo, axisMat));
    scene.add(orbitalPlaneGroup);

    // 5. Gravitational Potential Funnel
    const wellSize = 800;
    const wellSegs = 60;
    const wellGeo = new THREE.PlaneGeometry(wellSize, wellSize, wellSegs, wellSegs);
    const posAttr = wellGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const dist = Math.hypot(vx, vy);
      const depth = -Math.min(95, 2200 / (dist + 28));
      posAttr.setZ(i, depth);
    }
    wellGeo.computeVertexNormals();
    const wellMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    const wellMesh = new THREE.Mesh(wellGeo, wellMat);
    potentialWellMeshRef.current = wellMesh;
    scene.add(wellMesh);

    // 6. Realistic 3D Star Particle Field
    const starCount = 1800;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const radius = 1800 + Math.random() * 800;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      starPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = radius * Math.cos(phi);

      const colorVariance = Math.random();
      if (colorVariance > 0.8) {
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 0.85;
        starColors[i * 3 + 2] = 0.7;
      } else if (colorVariance > 0.6) {
        starColors[i * 3] = 0.7;
        starColors[i * 3 + 1] = 0.85;
        starColors[i * 3 + 2] = 1.0;
      } else {
        starColors[i * 3] = 0.95;
        starColors[i * 3 + 1] = 0.95;
        starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
    });
    const starsPoints = new THREE.Points(starGeo, starMat);
    starsGroupRef.current = starsPoints;
    scene.add(starsPoints);

    // Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Rotate Earth on its polar axis
      if (earthMeshRef.current) {
        earthMeshRef.current.rotation.y += 0.002;
      }
      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += 0.0028;
      }

      // Animate active explosions
      const now = performance.now();
      for (let i = activeExplosionsRef.current.length - 1; i >= 0; i--) {
        const exp = activeExplosionsRef.current[i];
        const elapsed = (now - exp.startTime) / 1000;
        const progress = Math.min(1.0, elapsed / exp.duration);

        if (progress >= 1.0) {
          // Dispose explosion
          scene.remove(exp.group);
          exp.fireball.geometry.dispose();
          (exp.fireball.material as THREE.Material).dispose();
          exp.shockwave.geometry.dispose();
          (exp.shockwave.material as THREE.Material).dispose();
          exp.particles.geometry.dispose();
          (exp.particles.material as THREE.Material).dispose();
          activeExplosionsRef.current.splice(i, 1);
        } else {
          // Scale fireball & shockwave
          const fireballScale = (Math.sin(progress * Math.PI) * 0.9 + progress * 0.5) * exp.maxRadius;
          exp.fireball.scale.set(fireballScale, fireballScale, fireballScale);
          (exp.fireball.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1.0 - progress * 1.2);

          const shockScale = (0.2 + progress * 1.8) * exp.maxRadius;
          exp.shockwave.scale.set(shockScale, shockScale, shockScale);
          (exp.shockwave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1.0 - progress) * 0.8);

          // Update flying debris particles
          const posAttr = exp.particles.geometry.attributes.position as THREE.BufferAttribute;
          const count = posAttr.count;
          for (let p = 0; p < count; p++) {
            const vx = exp.particleVels[p * 3];
            const vy = exp.particleVels[p * 3 + 1];
            const vz = exp.particleVels[p * 3 + 2];
            posAttr.setXYZ(
              p,
              posAttr.getX(p) + vx * 0.016 * (1.0 - progress * 0.5),
              posAttr.getY(p) + vy * 0.016 * (1.0 - progress * 0.5),
              posAttr.getZ(p) + vz * 0.016 * (1.0 - progress * 0.5)
            );
          }
          posAttr.needsUpdate = true;
          (exp.particles.material as THREE.PointsMaterial).opacity = Math.max(0, 1.0 - progress);

          // Dim impact light flash
          exp.light.intensity = Math.max(0, (1.0 - progress) * 12);
        }
      }

      // Update Camera based on Orbit spherical coordinates
      const targetLook = cameraTargetLookAt.current;
      currentLookAt.current.lerp(targetLook, 0.08);

      const rad = orbitSpherical.current.radius;
      const th = orbitSpherical.current.theta;
      const ph = orbitSpherical.current.phi;

      cameraTargetPos.current.set(
        panOffset.current.x + rad * Math.sin(ph) * Math.cos(th),
        panOffset.current.y + rad * Math.sin(ph) * Math.sin(th),
        rad * Math.cos(ph)
      );

      camera.position.lerp(cameraTargetPos.current, 0.12);
      camera.lookAt(currentLookAt.current);

      renderer.render(scene, camera);
    };
    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      earthDayTex.dispose();
      earthNightTex.dispose();
      earthSpecTex.dispose();
      earthCloudTex.dispose();
      moonTex.dispose();
    };
  }, []);

  // Handle Explosion Triggers from physics impacts
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !displayOptions.explosionEffects) return;

    impacts.forEach((imp) => {
      if (handledImpactIdsRef.current.has(imp.id)) return;
      handledImpactIdsRef.current.add(imp.id);

      // Play synthesized audio
      if (displayOptions.audioEffects) {
        playExplosionSound(Math.min(1.5, imp.speed / 6));
      }

      // Build 3D Explosion System
      const expGroup = new THREE.Group();
      expGroup.position.set(imp.x, imp.y, imp.z);

      // 1. Expanding Core Fireball
      const fireGeo = new THREE.SphereGeometry(1, 16, 16);
      const fireMat = new THREE.MeshBasicMaterial({
        color: '#ffdd6b',
        transparent: true,
        opacity: 0.95,
      });
      const fireball = new THREE.Mesh(fireGeo, fireMat);
      expGroup.add(fireball);

      // 2. Shockwave Ring
      const shockGeo = new THREE.RingGeometry(0.8, 1.8, 32);
      const shockMat = new THREE.MeshBasicMaterial({
        color: '#f97316',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const shockwave = new THREE.Mesh(shockGeo, shockMat);
      // Align shockwave along normal from target center
      const normal = new THREE.Vector3(imp.x, imp.y, imp.z).normalize();
      shockwave.lookAt(normal);
      expGroup.add(shockwave);

      // 3. Ejecta Debris Particles
      const particleCount = 75;
      const pGeo = new THREE.BufferGeometry();
      const pPositions = new Float32Array(particleCount * 3);
      const pColors = new Float32Array(particleCount * 3);
      const pVelocities = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount; i++) {
        pPositions[i * 3] = 0;
        pPositions[i * 3 + 1] = 0;
        pPositions[i * 3 + 2] = 0;

        // Eject outwards biased along impact normal
        const speed = 15 + Math.random() * 65;
        const randDir = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize();
        const v = randDir.add(normal.clone().multiplyScalar(1.2)).normalize().multiplyScalar(speed);

        pVelocities[i * 3] = v.x;
        pVelocities[i * 3 + 1] = v.y;
        pVelocities[i * 3 + 2] = v.z;

        // Hot ember colors
        pColors[i * 3] = 1.0;
        pColors[i * 3 + 1] = 0.4 + Math.random() * 0.5;
        pColors[i * 3 + 2] = 0.1;
      }
      pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
      pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

      const pMat = new THREE.PointsMaterial({
        size: 3.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
      });
      const particles = new THREE.Points(pGeo, pMat);
      expGroup.add(particles);

      // 4. Point Light Flash
      const light = new THREE.PointLight('#f59e0b', 14, 250);
      expGroup.add(light);

      scene.add(expGroup);

      activeExplosionsRef.current.push({
        id: imp.id,
        group: expGroup,
        fireball,
        shockwave,
        particles,
        particleVels: pVelocities,
        light,
        startTime: performance.now(),
        duration: 1.4,
        maxRadius: Math.max(16, Math.min(36, imp.speed * 3.5)),
      });

      // 5. Permanent Impact Crater Mark on Earth Globe
      if (imp.target === 'earth' && cratersGroupRef.current && earthMeshRef.current) {
        // Transform world coordinates into earthMesh local space
        const worldPos = new THREE.Vector3(imp.x, imp.y, imp.z);
        const localPos = earthMeshRef.current.worldToLocal(worldPos.clone());
        localPos.normalize().multiplyScalar(EARTH_VISUAL_RADIUS * 1.002);

        const craterGeo = new THREE.CircleGeometry(4.5, 24);
        const craterMat = new THREE.MeshBasicMaterial({
          color: '#d97706',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        });
        const craterMesh = new THREE.Mesh(craterGeo, craterMat);
        craterMesh.position.copy(localPos);
        craterMesh.lookAt(localPos.clone().multiplyScalar(2));
        cratersGroupRef.current.add(craterMesh);
      }
    });
  }, [impacts, displayOptions.explosionEffects, displayOptions.audioEffects]);

  // Reset craters and explosions when time is reset to 0
  useEffect(() => {
    if (time === 0) {
      handledImpactIdsRef.current.clear();
      // Clear craters
      if (cratersGroupRef.current) {
        while (cratersGroupRef.current.children.length > 0) {
          const child = cratersGroupRef.current.children[0];
          cratersGroupRef.current.remove(child);
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }
      }
      // Clear active explosions
      const scene = sceneRef.current;
      if (scene) {
        activeExplosionsRef.current.forEach((exp) => {
          scene.remove(exp.group);
          exp.fireball.geometry.dispose();
          exp.shockwave.geometry.dispose();
          exp.particles.geometry.dispose();
        });
        activeExplosionsRef.current = [];
      }
    }
  }, [time]);

  // Update dynamic simulation entities: Bodies, Moon, Trails, Vectors
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // 1. Update Red Moon position and rotation
    if (moonMeshRef.current) {
      moonMeshRef.current.position.set(moon.x, moon.y, moon.z || 0);
      moonMeshRef.current.rotation.z = moon.angle + Math.PI * 0.5;
    }

    // 2. Synchronize Celestial Bodies
    bodies.forEach((b) => {
      let group = bodyMeshesRef.current.get(b.id);
      if (!group) {
        group = new THREE.Group();
        const rad = b.id === 'primary' ? 8.5 : 6.5;
        const asteroidGeo = new THREE.DodecahedronGeometry(rad, 1);
        const asteroidTex = createAsteroidTexture(b.color);
        const asteroidMat = new THREE.MeshStandardMaterial({
          map: asteroidTex,
          color: b.color,
          roughness: 0.7,
          metalness: 0.25,
          emissive: b.color,
          emissiveIntensity: 0.25,
        });
        const mesh = new THREE.Mesh(asteroidGeo, asteroidMat);
        group.add(mesh);

        // Glowing core halo
        const haloGeo = new THREE.SphereGeometry(rad * 1.35, 16, 16);
        const haloMat = new THREE.MeshBasicMaterial({
          color: b.color,
          transparent: true,
          opacity: 0.25,
        });
        group.add(new THREE.Mesh(haloGeo, haloMat));

        scene.add(group);
        bodyMeshesRef.current.set(b.id, group);
      }

      // Hide or show body based on destroyed state
      if (b.isDestroyed) {
        group.visible = false;
      } else {
        group.visible = true;
        group.position.set(b.x, b.y, b.z || 0);
        group.rotation.x += 0.015;
        group.rotation.y += 0.02;
      }

      // 3. Update 3D Velocity Arrow
      let arrow = velocityArrowsRef.current.get(b.id);
      const speed = Math.hypot(b.vx, b.vy, b.vz || 0);
      const dir = new THREE.Vector3(b.vx, b.vy, b.vz || 0).normalize();
      const length = Math.max(10, speed * 4.5);

      if (!arrow) {
        arrow = new THREE.ArrowHelper(
          dir,
          new THREE.Vector3(b.x, b.y, b.z || 0),
          length,
          b.color,
          8,
          4
        );
        scene.add(arrow);
        velocityArrowsRef.current.set(b.id, arrow);
      } else {
        if (b.isDestroyed) {
          arrow.visible = false;
        } else {
          arrow.visible = true;
          arrow.position.set(b.x, b.y, b.z || 0);
          arrow.setDirection(dir);
          arrow.setLength(length, 8, 4);
        }
      }

      // 4. Update 3D Trajectory Trail Line
      let trailLine = trailLinesRef.current.get(b.id);
      if (displayOptions.trails && b.trail.length > 1) {
        const pts = b.trail.map((p) => new THREE.Vector3(p.x, p.y, p.z || 0));
        const trailGeo = new THREE.BufferGeometry().setFromPoints(pts);

        if (!trailLine) {
          const trailMat = new THREE.LineBasicMaterial({
            color: b.color,
            transparent: true,
            opacity: 0.85,
            linewidth: 2,
          });
          trailLine = new THREE.Line(trailGeo, trailMat);
          scene.add(trailLine);
          trailLinesRef.current.set(b.id, trailLine);
        } else {
          trailLine.geometry.dispose();
          trailLine.geometry = trailGeo;
          trailLine.visible = true;
        }
      } else if (trailLine) {
        trailLine.visible = false;
      }
    });

    // Handle Follow camera tracking
    if (viewMode === 'follow' && bodies[0]) {
      cameraTargetLookAt.current.set(bodies[0].x, bodies[0].y, bodies[0].z || 0);
    } else {
      cameraTargetLookAt.current.set(0, 0, 0);
    }

    // Toggle layer visibilities
    if (earthGridRef.current) earthGridRef.current.visible = displayOptions.latLongGrid;
    if (atmosphereRef.current) atmosphereRef.current.visible = displayOptions.atmosphereGlow;
    if (cloudsMeshRef.current) cloudsMeshRef.current.visible = displayOptions.cloudLayer;
    if (moonOrbitLineRef.current) moonOrbitLineRef.current.visible = displayOptions.referenceOrbits;
    if (gridHelperRef.current) gridHelperRef.current.visible = displayOptions.referenceOrbits;
    if (potentialWellMeshRef.current) potentialWellMeshRef.current.visible = displayOptions.potentialWell;
    if (starsGroupRef.current) starsGroupRef.current.visible = displayOptions.starField;
  }, [bodies, moon, displayOptions, viewMode, time]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none cursor-grab active:cursor-grabbing overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
      aria-label="Interactive 3D orbital mechanics viewport"
    >
      {webglError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-300 p-6 text-center">
          <p>{webglError}</p>
        </div>
      ) : (
        <canvas ref={canvasRef} className="block w-full h-full outline-none" />
      )}

      {/* 3D Camera & Scene HUD Tag */}
      <div className="absolute top-3.5 left-4 pointer-events-none flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/80 backdrop-blur-md border border-slate-800 text-xs text-slate-300 font-mono">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>CAMERA: {cameraLabel}</span>
        </span>
      </div>

      {/* Interactive 3D Control Hints Overlay */}
      <div className="absolute bottom-3 right-4 pointer-events-none text-right hidden sm:block">
        <div className="text-[11px] text-slate-400 bg-slate-950/75 backdrop-blur-md px-3 py-1.5 rounded border border-slate-800/80 font-mono space-y-0.5">
          <div>Drag to Rotate · Scroll to Zoom · Right-drag to Pan</div>
          <div>Closest: {Number.isFinite(closestApproach) ? closestApproach.toFixed(1) : '—'} units</div>
        </div>
      </div>
    </div>
  );
};
