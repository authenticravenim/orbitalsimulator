import * as THREE from 'three';

/**
 * Creates high-fidelity procedural textures for the 3D celestial bodies
 * so Earth looks like a realistic Google Earth globe with landmasses,
 * oceans, city lights, and clouds.
 */

export function createEarthDayTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // 1. Deep Oceanic Background with gradient depths
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#0d1e38');
  oceanGrad.addColorStop(0.3, '#0e2b4f');
  oceanGrad.addColorStop(0.5, '#0b355c');
  oceanGrad.addColorStop(0.7, '#0e2b4f');
  oceanGrad.addColorStop(1, '#0d1e38');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Oceanic trenches and deep water currents
  ctx.fillStyle = 'rgba(7, 24, 48, 0.4)';
  for (let i = 0; i < 40; i++) {
    const rx = (i * 137.5) % width;
    const ry = (i * 83.2) % height;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 120, 60, (i * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  // Continental shelf shallows (turquoise reefs & coastal margins)
  function drawCoastlineBuffer(paths: [number, number][][], color: string, lineWidth: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    paths.forEach(poly => {
      ctx.beginPath();
      poly.forEach(([px, py], idx) => {
        const x = (px / 360) * width;
        const y = ((90 - py) / 180) * height;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    });
  }

  // Define simplified continental polygons [lon (-180 to 180), lat (-90 to 90)]
  // High fidelity representation of global continents:
  const northAmerica: [number, number][] = [
    [-168, 65], [-150, 70], [-130, 70], [-95, 74], [-75, 62], [-60, 50],
    [-70, 42], [-75, 35], [-81, 25], [-80, 22], [-82, 30], [-90, 30],
    [-97, 26], [-97, 18], [-85, 12], [-77, 8], [-83, 8], [-92, 14],
    [-105, 20], [-110, 30], [-124, 40], [-124, 48], [-135, 57], [-165, 60]
  ];

  const greenland: [number, number][] = [
    [-55, 60], [-40, 60], [-25, 70], [-18, 78], [-30, 83], [-55, 82], [-65, 76]
  ];

  const southAmerica: [number, number][] = [
    [-77, 8], [-60, 10], [-50, 0], [-35, -5], [-35, -12], [-40, -22],
    [-50, -32], [-60, -40], [-68, -55], [-74, -50], [-72, -35], [-70, -20],
    [-80, -5], [-80, 2]
  ];

  const eurasia: [number, number][] = [
    [-9, 36], [-9, 44], [2, 51], [8, 55], [10, 58], [25, 71], [40, 68],
    [60, 73], [80, 74], [110, 77], [140, 75], [170, 68], [180, 65],
    [160, 55], [140, 50], [130, 42], [120, 32], [110, 20], [100, 10],
    [105, 2], [98, 8], [90, 22], [80, 15], [72, 20], [68, 25],
    [58, 24], [50, 26], [44, 13], [35, 30], [28, 41], [15, 40],
    [5, 43], [-5, 36]
  ];

  const scandinavia: [number, number][] = [
    [5, 58], [10, 55], [18, 56], [28, 60], [30, 70], [25, 71], [15, 68], [5, 62]
  ];

  const britishIsles: [number, number][] = [
    [-10, 51], [-5, 50], [1, 53], [-2, 58], [-6, 58], [-10, 54]
  ];

  const africa: [number, number][] = [
    [-17, 15], [-12, 28], [-5, 36], [10, 37], [25, 32], [32, 31],
    [43, 12], [51, 10], [42, -5], [35, -20], [28, -32], [18, -34],
    [12, -20], [9, -5], [0, 5], [-10, 5], [-15, 10]
  ];

  const madagascar: [number, number][] = [
    [44, -12], [50, -15], [47, -25], [43, -24]
  ];

  const australia: [number, number][] = [
    [114, -22], [120, -15], [130, -12], [136, -12], [142, -10],
    [148, -20], [153, -28], [150, -37], [138, -35], [130, -32],
    [115, -34], [113, -26]
  ];

  const newZealand: [number, number][] = [
    [168, -46], [174, -41], [178, -37], [174, -36], [172, -43]
  ];

  const antarctica: [number, number][] = [
    [-180, -70], [-120, -74], [-60, -65], [-30, -72], [0, -68],
    [60, -66], [100, -65], [140, -66], [180, -70], [180, -90], [-180, -90]
  ];

  const japan: [number, number][] = [
    [130, 32], [135, 34], [140, 38], [145, 44], [141, 44], [135, 37], [129, 33]
  ];

  const allPolys = [
    northAmerica, greenland, southAmerica, eurasia, scandinavia,
    britishIsles, africa, madagascar, australia, newZealand, antarctica, japan
  ];

  // Draw shallow water fringes (Google Earth coastal shelf look)
  drawCoastlineBuffer(allPolys, 'rgba(40, 160, 210, 0.4)', 26);
  drawCoastlineBuffer(allPolys, 'rgba(75, 195, 230, 0.5)', 12);

  // Fill continents with base terrain
  function fillPolygons(polys: [number, number][][], baseFill: string) {
    ctx.fillStyle = baseFill;
    polys.forEach(poly => {
      ctx.beginPath();
      poly.forEach(([px, py], idx) => {
        const x = (px / 360) * width;
        const y = ((90 - py) / 180) * height;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
    });
  }

  // Base lush vegetation green
  fillPolygons(allPolys, '#2e6b3e');

  // Paint biomes over landmasses using regional clip/coordinates:
  // 1. Arid Deserts (Sahara, Arabia, Gobi, Australian Outback, Mojave)
  function drawBiomePatch(centerLon: number, centerLat: number, radX: number, radY: number, color: string) {
    const cx = (centerLon / 360) * width;
    const cy = ((90 - centerLat) / 180) * height;
    const rx = (radX / 360) * width;
    const ry = (radY / 180) * height;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, color);
    g.addColorStop(0.7, color);
    g.addColorStop(1, 'rgba(46, 107, 62, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Deserts
  drawBiomePatch(18, 22, 38, 12, '#cda665'); // Sahara
  drawBiomePatch(45, 24, 18, 10, '#c79f58'); // Arabian
  drawBiomePatch(100, 42, 26, 10, '#b89f66'); // Gobi
  drawBiomePatch(132, -25, 22, 10, '#bf894d'); // Outback
  drawBiomePatch(-112, 32, 14, 8, '#b89d6a'); // Mojave / Mexican

  // Tropical Rainforest deep vibrant emeralds
  drawBiomePatch(-62, -4, 25, 14, '#1b522a'); // Amazon
  drawBiomePatch(22, 0, 16, 10, '#1c562c'); // Congo
  drawBiomePatch(115, 0, 20, 8, '#1b522a'); // Indonesia / Sundaland

  // High Mountain Ranges (Rockies, Andes, Himalayas, Alps)
  function drawMountainChain(points: [number, number][], color: string, snowColor: string) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach(([px, py], idx) => {
      const x = (px / 360) * width;
      const y = ((90 - py) / 180) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Snow caps
    ctx.strokeStyle = snowColor;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  drawMountainChain([[-115, 52], [-110, 42], [-106, 35]], '#5e5044', '#f1f5f9'); // Rockies
  drawMountainChain([[-72, -10], [-70, -22], [-69, -38], [-72, -50]], '#57483e', '#e2e8f0'); // Andes
  drawMountainChain([[70, 36], [82, 30], [92, 28], [100, 28]], '#65574a', '#ffffff'); // Himalayas
  drawMountainChain([[6, 46], [10, 47], [14, 46]], '#5e5246', '#ffffff'); // Alps

  // Polar Ice Caps (Greenland & Antarctica in ice white)
  fillPolygons([greenland, antarctica], '#edf4fc');
  // Arctic Sea Ice ring
  const arcticGrad = ctx.createLinearGradient(0, 0, 0, height * 0.16);
  arcticGrad.addColorStop(0, 'rgba(235, 245, 255, 0.95)');
  arcticGrad.addColorStop(0.7, 'rgba(235, 245, 255, 0.6)');
  arcticGrad.addColorStop(1, 'rgba(235, 245, 255, 0)');
  ctx.fillStyle = arcticGrad;
  ctx.fillRect(0, 0, width, height * 0.16);

  // Subtle natural terrain noise overlay for photorealistic earth texturing
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    // Only add subtle noise to non-black areas
    const noise = (Math.random() - 0.5) * 12;
    data[i] = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/**
 * Creates an Earth Night texture showing clusters of city lights
 * glowing in urban metropolitan centers.
 */
export function createEarthNightTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#010206';
  ctx.fillRect(0, 0, width, height);

  // City light clusters [lon, lat, intensity, radius]
  const cities: [number, number, number, number][] = [
    // North America
    [-74, 40.7, 1.0, 18],   // NYC / East Coast
    [-87.6, 41.8, 0.9, 14], // Chicago
    [-118.2, 34, 0.95, 16], // Los Angeles
    [-122.4, 37.7, 0.9, 12],// SF Bay
    [-95.3, 29.7, 0.8, 12], // Houston / Texas
    [-79.3, 43.6, 0.8, 10], // Toronto
    [-99.1, 19.4, 0.85, 14],// Mexico City
    // Europe
    [-0.1, 51.5, 1.0, 16],  // London
    [2.3, 48.8, 0.95, 14],  // Paris
    [13.4, 52.5, 0.85, 12], // Berlin
    [12.5, 41.9, 0.8, 10],  // Rome
    [37.6, 55.7, 0.9, 14],  // Moscow
    [5.0, 52.0, 0.9, 14],   // Benelux / Rhine corridor
    // Asia
    [139.7, 35.6, 1.0, 22], // Tokyo / Kanto
    [126.9, 37.5, 0.9, 16], // Seoul
    [121.4, 31.2, 1.0, 20], // Shanghai / Yangtze delta
    [113.2, 23.1, 1.0, 22], // Pearl River Delta / HK
    [116.4, 39.9, 0.95, 18],// Beijing
    [77.2, 28.6, 0.9, 18],  // Delhi / Indo-Gangetic plain
    [72.8, 19.0, 0.9, 16],  // Mumbai
    [103.8, 1.3, 0.85, 10], // Singapore
    [100.5, 13.7, 0.8, 12], // Bangkok
    [55.3, 25.2, 0.85, 10], // Dubai
    // South America
    [-46.6, -23.5, 0.9, 18],// Sao Paulo
    [-43.1, -22.9, 0.85, 12],// Rio de Janeiro
    [-58.3, -34.6, 0.85, 14],// Buenos Aires
    // Africa & Middle East
    [31.2, 30.0, 0.9, 15],  // Cairo / Nile
    [28.0, -26.2, 0.8, 12], // Johannesburg
    // Australia
    [151.2, -33.8, 0.85, 12],// Sydney
    [144.9, -37.8, 0.8, 10]  // Melbourne
  ];

  cities.forEach(([lon, lat, intensity, radius]) => {
    const cx = (lon / 360) * width;
    const cy = ((90 - lat) / 180) * height;
    const rx = (radius / 360) * width * 1.5;
    const ry = (radius / 180) * height * 1.5;

    // Warm golden urban glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    glow.addColorStop(0, `rgba(255, 230, 140, ${intensity})`);
    glow.addColorStop(0.3, `rgba(240, 180, 70, ${intensity * 0.7})`);
    glow.addColorStop(0.7, `rgba(200, 120, 30, ${intensity * 0.25})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp high-intensity city points
    for (let p = 0; p < 15; p++) {
      const px = cx + (Math.random() - 0.5) * rx * 0.8;
      const py = cy + (Math.random() - 0.5) * ry * 0.8;
      ctx.fillStyle = `rgba(255, 255, 210, ${Math.random() * 0.9 * intensity})`;
      ctx.fillRect(px, py, 1.5, 1.5);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Creates Earth Ocean Specular Map where water is glossy white
 * and continents are black, producing realistic sun glints off oceans!
 */
export function createEarthSpecularMap(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Oceans are shiny white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Continents are matte black
  ctx.fillStyle = '#111111';

  // Draw continent silhouettes on specular map
  const continentalPolys: [number, number][][] = [
    // NA
    [[-168, 65], [-130, 70], [-75, 62], [-60, 50], [-75, 35], [-81, 25], [-97, 18], [-83, 8], [-110, 30], [-135, 57]],
    // SA
    [[-77, 8], [-50, 0], [-35, -12], [-50, -32], [-68, -55], [-74, -50], [-80, -5]],
    // Eurasia & Africa
    [[-9, 36], [10, 58], [40, 68], [110, 77], [170, 68], [130, 42], [100, 10], [72, 20], [44, 13], [15, 40], [-5, 36]],
    [[-17, 15], [10, 37], [43, 12], [35, -20], [18, -34], [0, 5]],
    // Australia
    [[114, -22], [136, -12], [153, -28], [138, -35], [115, -34]],
    // Antarctica
    [[-180, -70], [0, -68], [180, -70], [180, -90], [-180, -90]]
  ];

  continentalPolys.forEach(poly => {
    ctx.beginPath();
    poly.forEach(([px, py], idx) => {
      const x = (px / 360) * width;
      const y = ((90 - py) / 180) * height;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Creates dynamic Earth Cloud Layer texture with realistic atmospheric swirls
 * and weather storm fronts.
 */
export function createEarthCloudTexture(): THREE.CanvasTexture {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, width, height);

  // Cloud bands and cyclone spirals
  function drawCloudSwirl(cx: number, cy: number, radius: number, arms: number) {
    for (let a = 0; a < arms; a++) {
      const baseAngle = (a / arms) * Math.PI * 2;
      ctx.beginPath();
      for (let r = 0; r < radius; r += 4) {
        const theta = baseAngle + (r / radius) * 3.5;
        const x = cx + Math.cos(theta) * r + (Math.random() - 0.5) * 8;
        const y = cy + Math.sin(theta) * (r * 0.5) + (Math.random() - 0.5) * 8;
        if (r === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + Math.random() * 0.4})`;
      ctx.lineWidth = 14 + Math.random() * 16;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // Intertropical Convergence Zone (equatorial cloud belt)
  for (let i = 0; i < 35; i++) {
    const x = (i / 35) * width + Math.sin(i * 0.8) * 40;
    const y = height * 0.48 + Math.sin(i * 1.5) * 35;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.random() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 60 + Math.random() * 50, 18 + Math.random() * 14, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mid-latitude storm tracks (North & South)
  const stormCenters: [number, number, number][] = [
    [width * 0.2, height * 0.28, 90], // Pacific North
    [width * 0.45, height * 0.3, 110], // Atlantic North
    [width * 0.78, height * 0.26, 95], // Siberia
    [width * 0.25, height * 0.72, 110], // Southern Ocean
    [width * 0.65, height * 0.74, 120]  // Roaring Forties
  ];

  stormCenters.forEach(([cx, cy, rad]) => {
    drawCloudSwirl(cx, cy, rad, 4);
  });

  // Soft scattered cirrus clouds across planet
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 40 + Math.random() * 80, 10 + Math.random() * 25, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Creates realistic Red Moon cratered regolith texture
 */
export function createRedMoonTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Crimson/iron-oxide base with dark basalt maria
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#782321');
  bg.addColorStop(0.5, '#99342f');
  bg.addColorStop(1, '#661c1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Dark lunar maria patches
  ctx.fillStyle = '#451211';
  for (let i = 0; i < 8; i++) {
    const x = (i * 140 + 70) % width;
    const y = (i * 90 + 50) % height;
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 45, i * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Craters with bright rims and ejecta rays
  for (let i = 0; i < 60; i++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const r = 4 + Math.random() * 20;

    // Crater interior shadow
    ctx.fillStyle = '#3a0d0c';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Crater bright rim
    ctx.strokeStyle = '#e6736a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Ejecta rays for larger craters
    if (r > 12) {
      ctx.strokeStyle = 'rgba(240, 140, 130, 0.3)';
      ctx.lineWidth = 1;
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2 + Math.random() * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * (r * 2.8), cy + Math.sin(ang) * (r * 2.8));
        ctx.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Creates Asteroid texture for incoming bodies
 */
export function createAsteroidTexture(baseColor = '#d97706'): THREE.CanvasTexture {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  // Rocky pits and chondrite grain
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = 2 + Math.random() * 8;
    ctx.fillStyle = 'rgba(20, 10, 5, 0.5)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 230, 180, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
