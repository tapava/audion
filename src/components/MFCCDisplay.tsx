import { useRef, useEffect, useCallback } from "react";

interface MFCCDisplayProps {
  mfccs: number[][] | null;
  isProcessing: boolean;
  duration?: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
}

/**
 * Get color for MFCC value using a diverging colormap (blue-white-red)
 */
function getColor(
  value: number,
  min: number,
  max: number
): [number, number, number] {
  // Normalize to [-1, 1]
  const range = Math.max(Math.abs(min), Math.abs(max));
  const normalized = range > 0 ? value / range : 0;
  const t = (normalized + 1) / 2; // Map to [0, 1]

  // Blue (negative) -> White (zero) -> Red (positive)
  if (t < 0.5) {
    const s = t * 2;
    return [
      Math.floor(59 + s * 196), // 59 -> 255
      Math.floor(130 + s * 125), // 130 -> 255
      Math.floor(246 + s * 9), // 246 -> 255
    ];
  } else {
    const s = (t - 0.5) * 2;
    return [
      255, // 255
      Math.floor(255 - s * 186), // 255 -> 69
      Math.floor(255 - s * 197), // 255 -> 58
    ];
  }
}

export function MFCCDisplay({
  mfccs,
  isProcessing,
  duration = 0,
  currentTime = 0,
  onSeek,
}: MFCCDisplayProps) {
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

    if (!mfccs || mfccs.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        isProcessing ? "Processing MFCCs..." : "Record audio to extract MFCCs",
        width / 2,
        height / 2
      );
      return;
    }

    const numFrames = mfccs.length;
    const numCoeffs = mfccs[0].length;

    // Find min/max for normalization
    let min = Infinity;
    let max = -Infinity;
    for (const frame of mfccs) {
      for (const val of frame) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    // Draw MFCC heatmap
    const cellWidth = width / numFrames;
    const cellHeight = height / numCoeffs;

    for (let i = 0; i < numFrames; i++) {
      for (let j = 0; j < numCoeffs; j++) {
        const value = mfccs[i][j];
        const [r, g, b] = getColor(value, min, max);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        // Draw from bottom (c0) to top (c12)
        const x = i * cellWidth;
        const y = height - (j + 1) * cellHeight;
        ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
      }
    }

    // Draw playhead
    if (duration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }

    // Draw coefficient labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";

    for (let j = 0; j < numCoeffs; j++) {
      const y = height - (j + 0.5) * cellHeight;
      if (j % 2 === 0) {
        ctx.fillText(`c${j}`, 20, y + 3);
      }
    }

    // Draw frame count
    ctx.textAlign = "left";
    ctx.fillText(`${numFrames} frames`, 5, 15);
  }, [mfccs, isProcessing, duration, currentTime]);

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
