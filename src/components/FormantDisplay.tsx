import { useRef, useEffect, useCallback } from "react";
import type { FormantResult } from "../utils/pitch";

interface FormantDisplayProps {
  formants: FormantResult | null;
  duration: number;
  currentTime: number;
  isProcessing: boolean;
  onSeek?: (time: number) => void;
}

const FORMANT_COLORS = [
  "#ef4444", // F1 - red
  "#f59e0b", // F2 - orange
  "#22c55e", // F3 - green
  "#3b82f6", // F4 - blue
];

export function FormantDisplay({
  formants,
  duration,
  currentTime,
  isProcessing,
  onSeek,
}: FormantDisplayProps) {
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

    if (!formants || formants.formants.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        isProcessing
          ? "Extracting formants..."
          : "Analyze audio to see formants",
        width / 2,
        height / 2
      );
      return;
    }

    const { formants: f } = formants;
    const numFrames = f.length;
    const numFormants = f[0]?.length || 0;

    // Y-axis range (typical formant range)
    const minFreq = 0;
    const maxFreq = 5000;

    // Draw grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    const freqLevels = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500];
    for (const level of freqLevels) {
      const y = height - ((level - minFreq) / (maxFreq - minFreq)) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      if (level % 1000 === 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "9px system-ui";
        ctx.textAlign = "left";
        ctx.fillText(`${level / 1000}kHz`, 3, y - 2);
      }
    }

    // Draw formant tracks
    for (
      let formantIdx = 0;
      formantIdx < Math.min(numFormants, 4);
      formantIdx++
    ) {
      const color = FORMANT_COLORS[formantIdx];

      // Draw points
      for (let i = 0; i < numFrames; i++) {
        const freq = f[i][formantIdx];
        if (freq > 0 && freq < maxFreq) {
          const x = (i / numFrames) * width;
          const y = height - ((freq - minFreq) / (maxFreq - minFreq)) * height;

          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.6;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // Connect with lines
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();

      let started = false;
      let lastX = 0;

      for (let i = 0; i < numFrames; i++) {
        const freq = f[i][formantIdx];
        if (freq > 0 && freq < maxFreq) {
          const x = (i / numFrames) * width;
          const y = height - ((freq - minFreq) / (maxFreq - minFreq)) * height;

          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            // Don't connect if gap is too large
            if (x - lastX < (width / numFrames) * 5) {
              ctx.lineTo(x, y);
            } else {
              ctx.moveTo(x, y);
            }
          }
          lastX = x;
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw legend
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    for (let i = 0; i < Math.min(numFormants, 4); i++) {
      ctx.fillStyle = FORMANT_COLORS[i];
      ctx.fillText(`F${i + 1}`, width - 5, 15 + i * 14);
    }

    // Draw playhead
    if (duration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Show current formant values
      const frameIndex = Math.floor((currentTime / duration) * numFrames);
      if (frameIndex >= 0 && frameIndex < numFrames) {
        const frameFormants = f[frameIndex];
        let yOffset = height - 15;

        for (let i = 0; i < Math.min(numFormants, 4); i++) {
          if (frameFormants[i] > 0) {
            ctx.fillStyle = FORMANT_COLORS[i];
            ctx.font = "9px system-ui";
            ctx.textAlign = "left";
            ctx.fillText(
              `F${i + 1}: ${Math.round(frameFormants[i])}`,
              playheadX + 5,
              yOffset
            );
            yOffset -= 12;
          }
        }
      }
    }
  }, [formants, duration, currentTime, isProcessing]);

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
