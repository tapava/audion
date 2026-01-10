import { useRef, useEffect, useCallback } from "react";
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
    ctx.fillRect(0, 0, width, height);

    if (!pitch || pitch.f0.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        isProcessing ? "Extracting pitch..." : "Analyze audio to see pitch",
        width / 2,
        height / 2
      );
      return;
    }

    const { f0, confidence, minF0, maxF0 } = pitch;
    const numFrames = f0.length;

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    // Horizontal grid lines (pitch levels)
    const pitchLevels = [100, 150, 200, 250, 300, 400, 500];
    for (const level of pitchLevels) {
      if (level >= minF0 && level <= maxF0) {
        const y = height - ((level - minF0) / (maxF0 - minF0)) * height;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "9px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(`${level}Hz`, 3, y - 2);
      }
    }

    // Draw pitch points
    const pointRadius = 2;
    for (let i = 0; i < numFrames; i++) {
      if (f0[i] > 0) {
        const x = (i / numFrames) * width;
        const y = height - ((f0[i] - minF0) / (maxF0 - minF0)) * height;
        const alpha = 0.3 + confidence[i] * 0.7;

        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
        ctx.fill();
      }
    }

    // Connect points with lines
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    let started = false;
    for (let i = 0; i < numFrames; i++) {
      if (f0[i] > 0) {
        const x = (i / numFrames) * width;
        const y = height - ((f0[i] - minF0) / (maxF0 - minF0)) * height;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();

    // Draw playhead
    if (duration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Show current pitch value
      const frameIndex = Math.floor((currentTime / duration) * numFrames);
      if (frameIndex >= 0 && frameIndex < numFrames && f0[frameIndex] > 0) {
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 11px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(`${Math.round(f0[frameIndex])} Hz`, playheadX + 5, 15);
      }
    }

    // Labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("F0 (Hz)", width - 5, 15);
  }, [pitch, duration, currentTime, isProcessing]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * duration;
    onSeek(Math.max(0, Math.min(time, duration)));
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
        cursor: onSeek ? "pointer" : "default",
      }}
    />
  );
}
