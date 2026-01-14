import { useRef, useEffect, useCallback, useState } from "react";
import type { FormantResult } from "../utils/pitch";

interface FormantDisplayProps {
  formants: FormantResult | null;
  duration: number;
  currentTime: number;
  isProcessing: boolean;
  onSeek?: (time: number) => void;
}

const FORMANT_COLORS = [
  { main: "#ef4444", light: "#fca5a5", bg: "rgba(239, 68, 68, 0.15)" }, // F1 - red
  { main: "#f59e0b", light: "#fcd34d", bg: "rgba(245, 158, 11, 0.15)" }, // F2 - orange
  { main: "#22c55e", light: "#86efac", bg: "rgba(34, 197, 94, 0.15)" }, // F3 - green
  { main: "#3b82f6", light: "#93c5fd", bg: "rgba(59, 130, 246, 0.15)" }, // F4 - blue
];

const FORMANT_NAMES = ["F1", "F2", "F3", "F4"];
const TYPICAL_RANGES = [
  { min: 200, max: 1000, label: "F1: 200-1000 Hz" },
  { min: 800, max: 2500, label: "F2: 800-2500 Hz" },
  { min: 1500, max: 3500, label: "F3: 1500-3500 Hz" },
  { min: 2500, max: 4500, label: "F4: 2500-4500 Hz" },
];

export function FormantDisplay({
  formants,
  duration,
  currentTime,
  isProcessing,
  onSeek,
}: FormantDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    formant: number;
    freq: number;
  } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const labelWidth = 45;
    const topMargin = 25;
    const bottomMargin = 25;
    const legendWidth = 50;
    const plotWidth = width - labelWidth - legendWidth - 10;
    const plotHeight = height - topMargin - bottomMargin;

    // Dark gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a0e14");
    bgGradient.addColorStop(1, "#0d1117");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    if (!formants || formants.formants.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "500 14px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        isProcessing
          ? "Extracting formants..."
          : "Analyze audio to see formant tracks",
        width / 2,
        height / 2
      );
      return;
    }

    const { formants: f } = formants;
    const numFrames = f.length;
    const numFormants = Math.min(f[0]?.length || 0, 4);

    // Y-axis range
    const minFreq = 0;
    const maxFreq = 5000;

    // Header
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "600 10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("FORMANT TRACKS (F1-F4)", labelWidth + 5, 14);

    // Label area
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, labelWidth - 2, height);

    // Draw frequency grid
    const freqLevels = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500];
    ctx.font = "500 9px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";

    for (const level of freqLevels) {
      const y =
        topMargin +
        plotHeight -
        ((level - minFreq) / (maxFreq - minFreq)) * plotHeight;

      // Grid line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(labelWidth, y);
      ctx.lineTo(labelWidth + plotWidth, y);
      ctx.stroke();

      // Label
      if (level % 1000 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fillText(`${level / 1000}k`, labelWidth - 6, y + 3);
      }
    }

    // Hz label
    ctx.save();
    ctx.translate(12, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "500 9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Hz", 0, 0);
    ctx.restore();

    // Draw typical formant range bands (subtle background)
    for (let fi = 0; fi < numFormants; fi++) {
      const range = TYPICAL_RANGES[fi];
      const y1 =
        topMargin +
        plotHeight -
        ((range.max - minFreq) / (maxFreq - minFreq)) * plotHeight;
      const y2 =
        topMargin +
        plotHeight -
        ((range.min - minFreq) / (maxFreq - minFreq)) * plotHeight;

      ctx.fillStyle = FORMANT_COLORS[fi].bg;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(labelWidth, y1, plotWidth, y2 - y1);
      ctx.globalAlpha = 1;
    }

    // Draw formant tracks
    for (let formantIdx = numFormants - 1; formantIdx >= 0; formantIdx--) {
      const color = FORMANT_COLORS[formantIdx];

      // Collect valid points
      const points: { x: number; y: number; freq: number }[] = [];
      for (let i = 0; i < numFrames; i++) {
        const freq = f[i][formantIdx];
        if (freq > 50 && freq < maxFreq) {
          const x = labelWidth + (i / numFrames) * plotWidth;
          const y =
            topMargin +
            plotHeight -
            ((freq - minFreq) / (maxFreq - minFreq)) * plotHeight;
          points.push({ x, y, freq });
        }
      }

      if (points.length === 0) continue;

      // Draw area under the curve
      ctx.beginPath();
      ctx.moveTo(points[0].x, topMargin + plotHeight);
      for (const p of points) {
        ctx.lineTo(p.x, p.y);
      }
      ctx.lineTo(points[points.length - 1].x, topMargin + plotHeight);
      ctx.closePath();

      const areaGradient = ctx.createLinearGradient(
        0,
        topMargin,
        0,
        topMargin + plotHeight
      );
      areaGradient.addColorStop(0, color.bg);
      areaGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = areaGradient;
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Draw smooth line with bezier curves
      ctx.strokeStyle = color.main;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      for (let i = 0; i < points.length; i++) {
        if (i === 0) {
          ctx.moveTo(points[i].x, points[i].y);
        } else {
          // Check for gaps
          const gap = points[i].x - points[i - 1].x;
          if (gap > (plotWidth / numFrames) * 8) {
            ctx.moveTo(points[i].x, points[i].y);
          } else {
            // Simple line for now (could add bezier smoothing)
            ctx.lineTo(points[i].x, points[i].y);
          }
        }
      }
      ctx.stroke();

      // Draw points
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = color.light;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Legend
    const legendX = width - legendWidth + 5;
    ctx.font = "600 9px system-ui";

    for (let i = 0; i < numFormants; i++) {
      const y = topMargin + 15 + i * 20;

      // Color dot
      ctx.beginPath();
      ctx.arc(legendX + 5, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = FORMANT_COLORS[i].main;
      ctx.fill();

      // Label
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.textAlign = "left";
      ctx.fillText(FORMANT_NAMES[i], legendX + 14, y + 3);
    }

    // Time axis
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "500 9px system-ui";
    ctx.textAlign = "center";
    if (duration > 0) {
      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        const x = labelWidth + t * plotWidth;
        ctx.fillText((t * duration).toFixed(1) + "s", x, height - 8);
      });
    }

    // Draw playhead
    if (duration > 0 && currentTime >= 0) {
      const playheadX = labelWidth + (currentTime / duration) * plotWidth;

      // Glow
      const glowGradient = ctx.createRadialGradient(
        playheadX,
        height / 2,
        0,
        playheadX,
        height / 2,
        25
      );
      glowGradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
      glowGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = glowGradient;
      ctx.fillRect(playheadX - 25, topMargin, 50, plotHeight);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, topMargin);
      ctx.lineTo(playheadX, topMargin + plotHeight);
      ctx.stroke();

      // Show current formant values
      const frameIndex = Math.floor((currentTime / duration) * numFrames);
      if (frameIndex >= 0 && frameIndex < numFrames) {
        const frameFormants = f[frameIndex];

        // Draw dots and labels at current position
        for (let i = 0; i < numFormants; i++) {
          const freq = frameFormants[i];
          if (freq > 50 && freq < maxFreq) {
            const y =
              topMargin +
              plotHeight -
              ((freq - minFreq) / (maxFreq - minFreq)) * plotHeight;

            // Highlight dot
            ctx.beginPath();
            ctx.arc(playheadX, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = FORMANT_COLORS[i].main;
            ctx.fill();
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }

        // Value tooltip
        const validFormants = frameFormants
          .slice(0, numFormants)
          .filter((freq) => freq > 50);
        if (validFormants.length > 0) {
          const tooltipHeight = validFormants.length * 14 + 8;
          const tooltipY = topMargin + 5;
          const tooltipX = Math.min(playheadX + 10, width - legendWidth - 70);

          ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
          ctx.beginPath();
          ctx.roundRect(tooltipX, tooltipY, 60, tooltipHeight, 4);
          ctx.fill();

          let ty = tooltipY + 14;
          for (let i = 0; i < numFormants; i++) {
            if (frameFormants[i] > 50) {
              ctx.fillStyle = FORMANT_COLORS[i].main;
              ctx.font = "600 10px system-ui";
              ctx.textAlign = "left";
              ctx.fillText(
                `${FORMANT_NAMES[i]}: ${Math.round(frameFormants[i])}`,
                tooltipX + 6,
                ty
              );
              ty += 14;
            }
          }
        }
      }
    }

    // Hover info
    if (hoverInfo) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.beginPath();
      ctx.roundRect(width / 2 - 50, topMargin + 5, 100, 20, 4);
      ctx.fill();
      ctx.fillStyle = FORMANT_COLORS[hoverInfo.formant].main;
      ctx.font = "600 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        `${FORMANT_NAMES[hoverInfo.formant]}: ${Math.round(hoverInfo.freq)} Hz`,
        width / 2,
        topMargin + 19
      );
    }
  }, [formants, duration, currentTime, isProcessing, hoverInfo]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const labelWidth = 45;
    const legendWidth = 50;
    const plotWidth = rect.width - labelWidth - legendWidth - 10;

    if (x > labelWidth && x < labelWidth + plotWidth) {
      const time = ((x - labelWidth) / plotWidth) * duration;
      onSeek(Math.max(0, Math.min(time, duration)));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!formants || formants.formants.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const labelWidth = 45;
    const legendWidth = 50;
    const topMargin = 25;
    const bottomMargin = 25;
    const plotWidth = rect.width - labelWidth - legendWidth - 10;
    const plotHeight = rect.height - topMargin - bottomMargin;

    if (x < labelWidth || x > labelWidth + plotWidth) {
      setHoverInfo(null);
      return;
    }

    const frameIndex = Math.floor(
      ((x - labelWidth) / plotWidth) * formants.formants.length
    );
    if (frameIndex < 0 || frameIndex >= formants.formants.length) {
      setHoverInfo(null);
      return;
    }

    // Find closest formant
    const minFreq = 0;
    const maxFreq = 5000;
    const hoverFreq =
      minFreq + (1 - (y - topMargin) / plotHeight) * (maxFreq - minFreq);

    let closestFormant = -1;
    let closestDist = Infinity;

    for (
      let i = 0;
      i < Math.min(formants.formants[frameIndex].length, 4);
      i++
    ) {
      const freq = formants.formants[frameIndex][i];
      if (freq > 50) {
        const dist = Math.abs(freq - hoverFreq);
        if (dist < closestDist && dist < 200) {
          closestDist = dist;
          closestFormant = i;
        }
      }
    }

    if (closestFormant >= 0) {
      setHoverInfo({
        formant: closestFormant,
        freq: formants.formants[frameIndex][closestFormant],
      });
    } else {
      setHoverInfo(null);
    }
  };

  const handleMouseLeave = () => setHoverInfo(null);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        width: "100%",
        height: "100%",
        cursor: onSeek ? "pointer" : "default",
        borderRadius: "8px",
      }}
    />
  );
}
