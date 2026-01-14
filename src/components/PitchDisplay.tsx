import { useRef, useEffect, useCallback, useState } from "react";
import type { PitchResult } from "../utils/pitch";

interface PitchDisplayProps {
  pitch: PitchResult | null;
  duration: number;
  currentTime: number;
  isProcessing: boolean;
  onSeek?: (time: number) => void;
}

export function PitchDisplay({
  pitch,
  duration,
  currentTime,
  isProcessing,
  onSeek,
}: PitchDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverHz, setHoverHz] = useState<number | null>(null);

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
    const plotHeight = height - topMargin - bottomMargin;

    // Dark gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a0e14");
    bgGradient.addColorStop(1, "#0d1117");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    if (!pitch || pitch.f0.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "500 14px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        isProcessing
          ? "Extracting pitch..."
          : "Analyze audio to see pitch contour",
        width / 2,
        height / 2
      );
      return;
    }

    const { f0, confidence, minF0, maxF0 } = pitch;
    const numFrames = f0.length;
    const plotWidth = width - labelWidth - 15;

    // Calculate statistics
    const voicedF0 = f0.filter((v) => v > 0);
    const avgF0 =
      voicedF0.length > 0
        ? voicedF0.reduce((a, b) => a + b, 0) / voicedF0.length
        : 0;

    // Header
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "600 10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("PITCH CONTOUR (F0)", labelWidth + 5, 14);

    if (avgF0 > 0) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
      ctx.font = "500 9px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(`avg: ${Math.round(avgF0)} Hz`, width - 10, 14);
    }

    // Y-axis labels area
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, labelWidth - 2, height);

    // Draw horizontal grid lines with frequency labels
    ctx.font = "500 9px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";

    const pitchLevels = [75, 100, 150, 200, 250, 300, 400, 500];
    const validLevels = pitchLevels.filter((l) => l >= minF0 && l <= maxF0);

    for (const level of validLevels) {
      const y =
        topMargin +
        plotHeight -
        ((level - minF0) / (maxF0 - minF0)) * plotHeight;

      // Grid line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(labelWidth, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillText(`${level}`, labelWidth - 6, y + 3);

      // Tick
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.moveTo(labelWidth - 3, y);
      ctx.lineTo(labelWidth, y);
      ctx.stroke();
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

    // Draw confidence as background fill
    ctx.beginPath();
    let startedFill = false;
    for (let i = 0; i < numFrames; i++) {
      if (f0[i] > 0) {
        const x = labelWidth + (i / numFrames) * plotWidth;
        const y =
          topMargin +
          plotHeight -
          ((f0[i] - minF0) / (maxF0 - minF0)) * plotHeight;
        if (!startedFill) {
          ctx.moveTo(x, topMargin + plotHeight);
          ctx.lineTo(x, y);
          startedFill = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else if (startedFill) {
        ctx.lineTo(
          labelWidth + ((i - 1) / numFrames) * plotWidth,
          topMargin + plotHeight
        );
        startedFill = false;
      }
    }
    if (startedFill) {
      ctx.lineTo(
        labelWidth + ((numFrames - 1) / numFrames) * plotWidth,
        topMargin + plotHeight
      );
    }
    ctx.closePath();

    const fillGradient = ctx.createLinearGradient(
      0,
      topMargin,
      0,
      topMargin + plotHeight
    );
    fillGradient.addColorStop(0, "rgba(34, 197, 94, 0.15)");
    fillGradient.addColorStop(1, "rgba(34, 197, 94, 0.02)");
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Draw pitch line with gradient based on confidence
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 1; i < numFrames; i++) {
      if (f0[i] > 0 && f0[i - 1] > 0) {
        const x1 = labelWidth + ((i - 1) / numFrames) * plotWidth;
        const x2 = labelWidth + (i / numFrames) * plotWidth;
        const y1 =
          topMargin +
          plotHeight -
          ((f0[i - 1] - minF0) / (maxF0 - minF0)) * plotHeight;
        const y2 =
          topMargin +
          plotHeight -
          ((f0[i] - minF0) / (maxF0 - minF0)) * plotHeight;

        const avgConf = (confidence[i] + confidence[i - 1]) / 2;
        const alpha = 0.4 + avgConf * 0.6;

        ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.lineWidth = 2 + avgConf * 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Draw pitch points
    for (let i = 0; i < numFrames; i++) {
      if (f0[i] > 0) {
        const x = labelWidth + (i / numFrames) * plotWidth;
        const y =
          topMargin +
          plotHeight -
          ((f0[i] - minF0) / (maxF0 - minF0)) * plotHeight;
        const alpha = 0.5 + confidence[i] * 0.5;
        const radius = 1.5 + confidence[i] * 1.5;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(74, 222, 128, ${alpha})`;
        ctx.fill();
      }
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
      glowGradient.addColorStop(0, "rgba(239, 68, 68, 0.25)");
      glowGradient.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = glowGradient;
      ctx.fillRect(playheadX - 25, topMargin, 50, plotHeight);

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, topMargin);
      ctx.lineTo(playheadX, topMargin + plotHeight);
      ctx.stroke();

      // Current pitch value
      const frameIndex = Math.floor((currentTime / duration) * numFrames);
      if (frameIndex >= 0 && frameIndex < numFrames && f0[frameIndex] > 0) {
        const pitchY =
          topMargin +
          plotHeight -
          ((f0[frameIndex] - minF0) / (maxF0 - minF0)) * plotHeight;

        // Highlight dot
        ctx.beginPath();
        ctx.arc(playheadX, pitchY, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Value label
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.beginPath();
        ctx.roundRect(playheadX - 30, pitchY - 25, 60, 18, 4);
        ctx.fill();
        ctx.fillStyle = "#22c55e";
        ctx.font = "600 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(
          `${Math.round(f0[frameIndex])} Hz`,
          playheadX,
          pitchY - 11
        );
      }
    }

    // Hover indicator
    if (hoverHz !== null) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.beginPath();
      ctx.roundRect(width / 2 - 35, topMargin + 5, 70, 18, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "500 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(hoverHz)} Hz`, width / 2, topMargin + 18);
    }
  }, [pitch, duration, currentTime, isProcessing, hoverHz]);

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
    const adjustedX = x - labelWidth;
    const plotWidth = rect.width - labelWidth - 15;

    if (adjustedX > 0) {
      const time = (adjustedX / plotWidth) * duration;
      onSeek(Math.max(0, Math.min(time, duration)));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!pitch || pitch.f0.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const labelWidth = 45;
    const plotWidth = rect.width - labelWidth - 15;
    const frameIndex = Math.floor(
      ((x - labelWidth) / plotWidth) * pitch.f0.length
    );

    if (
      frameIndex >= 0 &&
      frameIndex < pitch.f0.length &&
      pitch.f0[frameIndex] > 0
    ) {
      setHoverHz(pitch.f0[frameIndex]);
    } else {
      setHoverHz(null);
    }
  };

  const handleMouseLeave = () => setHoverHz(null);

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
