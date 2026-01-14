import { useRef, useEffect, useCallback, useState } from "react";

interface MFCCDisplayProps {
  mfccs: number[][] | null;
  isProcessing: boolean;
  duration?: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
}

/**
 * Professional colormap for MFCC visualization (viridis-inspired)
 */
function getColor(
  value: number,
  min: number,
  max: number
): [number, number, number] {
  // Normalize to [0, 1]
  const range = max - min;
  const t = range > 0 ? (value - min) / range : 0.5;

  // Viridis-inspired colormap: dark purple → blue → teal → green → yellow
  if (t < 0.25) {
    const s = t / 0.25;
    return [
      Math.floor(68 + s * -15),
      Math.floor(1 + s * 45),
      Math.floor(84 + s * 40),
    ];
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [
      Math.floor(53 - s * 20),
      Math.floor(46 + s * 68),
      Math.floor(124 + s * 5),
    ];
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [
      Math.floor(33 + s * 60),
      Math.floor(114 + s * 50),
      Math.floor(129 - s * 40),
    ];
  } else {
    const s = (t - 0.75) / 0.25;
    return [
      Math.floor(93 + s * 160),
      Math.floor(164 + s * 60),
      Math.floor(89 - s * 50),
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
  const [hoverInfo, setHoverInfo] = useState<{
    frame: number;
    coeff: number;
    value: number;
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
    const labelWidth = 35;
    const topMargin = 20;

    // Dark gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a0e14");
    bgGradient.addColorStop(1, "#0d1117");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    if (!mfccs || mfccs.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "500 14px system-ui, -apple-system, sans-serif";
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
    const cellWidth = (width - labelWidth - 10) / numFrames;
    const cellHeight = (height - topMargin - 25) / numCoeffs;

    for (let i = 0; i < numFrames; i++) {
      for (let j = 0; j < numCoeffs; j++) {
        const value = mfccs[i][j];
        const [r, g, b] = getColor(value, min, max);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        const x = labelWidth + i * cellWidth;
        const y = topMargin + (numCoeffs - j - 1) * cellHeight;
        ctx.fillRect(x, y, cellWidth + 0.5, cellHeight + 0.5);
      }
    }

    // Edge gradient for polish
    const leftFade = ctx.createLinearGradient(
      labelWidth,
      0,
      labelWidth + 15,
      0
    );
    leftFade.addColorStop(0, "rgba(10, 14, 20, 0.4)");
    leftFade.addColorStop(1, "rgba(10, 14, 20, 0)");
    ctx.fillStyle = leftFade;
    ctx.fillRect(labelWidth, topMargin, 15, height - topMargin - 25);

    // Draw coefficient labels
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, labelWidth - 2, height);

    ctx.font = "500 9px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";

    for (let j = 0; j < numCoeffs; j++) {
      const y =
        topMargin + (numCoeffs - j - 1) * cellHeight + cellHeight / 2 + 3;
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText(`C${j}`, labelWidth - 6, y);

      // Tick mark
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.beginPath();
      ctx.moveTo(labelWidth - 3, y - 3);
      ctx.lineTo(labelWidth, y - 3);
      ctx.stroke();
    }

    // Header
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "600 10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("MFCC COEFFICIENTS", labelWidth + 5, 14);

    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "500 9px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`${numFrames} frames`, width - 10, 14);

    // Time axis
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "500 9px system-ui";
    ctx.textAlign = "center";
    if (duration > 0) {
      const timeLabels = [0, 0.25, 0.5, 0.75, 1].map((t) => t * duration);
      timeLabels.forEach((time, i) => {
        const x =
          labelWidth +
          (i / (timeLabels.length - 1)) * (width - labelWidth - 10);
        ctx.fillText(time.toFixed(1) + "s", x, height - 5);
      });
    }

    // Draw playhead
    if (duration > 0 && currentTime >= 0) {
      const playheadX =
        labelWidth + (currentTime / duration) * (width - labelWidth - 10);

      // Glow
      const glowGradient = ctx.createRadialGradient(
        playheadX,
        height / 2,
        0,
        playheadX,
        height / 2,
        20
      );
      glowGradient.addColorStop(0, "rgba(239, 68, 68, 0.3)");
      glowGradient.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = glowGradient;
      ctx.fillRect(playheadX - 20, 0, 40, height);

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, topMargin);
      ctx.lineTo(playheadX, height - 20);
      ctx.stroke();
    }

    // Color bar legend
    const legendX = width - 20;
    const legendHeight = height - topMargin - 40;
    const legendY = topMargin + 10;

    for (let i = 0; i < legendHeight; i++) {
      const t = i / legendHeight;
      const [r, g, b] = getColor(max - t * (max - min), min, max);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(legendX, legendY + i, 8, 2);
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.strokeRect(legendX, legendY, 8, legendHeight);

    // Hover info
    if (hoverInfo) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.beginPath();
      ctx.roundRect(width / 2 - 60, 2, 120, 16, 3);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "500 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        `C${hoverInfo.coeff}: ${hoverInfo.value.toFixed(2)}`,
        width / 2,
        14
      );
    }
  }, [mfccs, isProcessing, duration, currentTime, hoverInfo]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const labelWidth = 35;
    const adjustedX = x - labelWidth;
    const adjustedWidth = rect.width - labelWidth - 10;

    if (adjustedX > 0) {
      const time = (adjustedX / adjustedWidth) * duration;
      onSeek(Math.max(0, Math.min(time, duration)));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mfccs || mfccs.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const labelWidth = 35;
    const topMargin = 20;
    const numCoeffs = mfccs[0].length;
    const cellWidth = (rect.width - labelWidth - 10) / mfccs.length;
    const cellHeight = (rect.height - topMargin - 25) / numCoeffs;

    const frameIdx = Math.floor((x - labelWidth) / cellWidth);
    const coeffIdx = numCoeffs - 1 - Math.floor((y - topMargin) / cellHeight);

    if (
      frameIdx >= 0 &&
      frameIdx < mfccs.length &&
      coeffIdx >= 0 &&
      coeffIdx < numCoeffs
    ) {
      setHoverInfo({
        frame: frameIdx,
        coeff: coeffIdx,
        value: mfccs[frameIdx][coeffIdx],
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
