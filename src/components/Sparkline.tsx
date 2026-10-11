import React, { useEffect, useRef } from 'react';

interface SparklineProps {
  data: number[];
  currentEnergy: number;
  width?: number;
  height?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  currentEnergy,
  height = 54,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 280;
    const h = height;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    const points = data.length > 0 ? data : [currentEnergy];
    let minVal = Math.min(0, ...points);
    let maxVal = Math.max(0, ...points);
    if (maxVal - minVal < 1.0) {
      maxVal += 0.5;
      minVal -= 0.5;
    }

    const padding = 6;
    const getY = (val: number) => {
      const normalized = (val - minVal) / (maxVal - minVal);
      return h - padding - normalized * (h - padding * 2);
    };

    // Escape boundary (Energy = 0)
    const zeroY = getY(0);
    ctx.save();
    ctx.strokeStyle = '#475569';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();
    ctx.restore();

    // Bound region shading (below 0)
    if (zeroY < h - padding) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
      ctx.fillRect(0, zeroY, w, h - zeroY);
    }

    // Unbound / Escape region shading (above 0)
    if (zeroY > padding) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
      ctx.fillRect(0, 0, w, zeroY);
    }

    if (points.length < 2) {
      // Draw single current value marker
      const cy = getY(currentEnergy);
      ctx.fillStyle = currentEnergy < 0 ? '#10b981' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(w / 2, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Plot energy curve
    ctx.beginPath();
    points.forEach((val, i) => {
      const x = (i / (points.length - 1)) * (w - 12) + 6;
      const y = getY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    const isCurrentBound = currentEnergy < 0;
    ctx.strokeStyle = isCurrentBound ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Highlight current point
    const lastX = w - 6;
    const lastY = getY(points[points.length - 1]);
    ctx.fillStyle = isCurrentBound ? '#10b981' : '#f59e0b';
    ctx.shadowColor = isCurrentBound ? '#10b981' : '#f59e0b';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [data, currentEnergy, height]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full block"
      style={{ height: `${height}px` }}
      aria-label="Specific orbital energy history chart"
    />
  );
};
