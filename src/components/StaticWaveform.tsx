import { useRef, useEffect, useState } from "react";

interface StaticWaveformProps {
  samples: Float32Array | null;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function StaticWaveform({
  samples,
  duration,
  currentTime,
  onSeek,
}: StaticWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);

  useEffect(() => {
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
    const centerY = height / 2;

    // Dark gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0f1419");
    bgGradient.addColorStop(0.5, "#141a21");
    bgGradient.addColorStop(1, "#0f1419");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Subtle horizontal grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((ratio) => {
      ctx.beginPath();
      ctx.moveTo(0, height * ratio);
      ctx.lineTo(width, height * ratio);
      ctx.stroke();
    });

    if (!samples || samples.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "500 14px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No audio loaded", width / 2, height / 2);
      return;
    }

    // Calculate waveform bars
    const barGap = 2;
    const barWidth = 3;
    const numBars = Math.floor(width / (barWidth + barGap));
    const samplesPerBar = Math.floor(samples.length / numBars);
    const playbackPosition = duration > 0 ? currentTime / duration : 0;
    const playbackX = playbackPosition * width;

    // Draw waveform bars
    for (let i = 0; i < numBars; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, samples.length);

      let min = 0,
        max = 0,
        rms = 0;
      for (let j = start; j < end; j++) {
        if (samples[j] < min) min = samples[j];
        if (samples[j] > max) max = samples[j];
        rms += samples[j] * samples[j];
      }
      rms = Math.sqrt(rms / (end - start));

      const x = i * (barWidth + barGap);
      const amplitude = Math.max(Math.abs(min), Math.abs(max));
      const barHeight = Math.max(4, amplitude * height * 0.8);

      // Create gradient for each bar
      const isPlayed = x < playbackX;
      const isHovered =
        hoverPosition !== null &&
        Math.abs(x - hoverPosition) < (barWidth + barGap) * 3;

      let gradient;
      if (isPlayed) {
        gradient = ctx.createLinearGradient(
          0,
          centerY - barHeight / 2,
          0,
          centerY + barHeight / 2
        );
        gradient.addColorStop(0, "#60a5fa");
        gradient.addColorStop(0.5, "#3b82f6");
        gradient.addColorStop(1, "#2563eb");
      } else if (isHovered) {
        gradient = ctx.createLinearGradient(
          0,
          centerY - barHeight / 2,
          0,
          centerY + barHeight / 2
        );
        gradient.addColorStop(0, "rgba(156, 163, 175, 0.8)");
        gradient.addColorStop(0.5, "rgba(107, 114, 128, 0.8)");
        gradient.addColorStop(1, "rgba(75, 85, 99, 0.8)");
      } else {
        gradient = ctx.createLinearGradient(
          0,
          centerY - barHeight / 2,
          0,
          centerY + barHeight / 2
        );
        gradient.addColorStop(0, "rgba(107, 114, 128, 0.6)");
        gradient.addColorStop(0.5, "rgba(75, 85, 99, 0.6)");
        gradient.addColorStop(1, "rgba(55, 65, 81, 0.6)");
      }

      ctx.fillStyle = gradient;

      // Draw rounded bars
      const y = centerY - barHeight / 2;
      const radius = Math.min(barWidth / 2, 2);
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, radius);
      ctx.fill();

      // Add subtle glow for played section
      if (isPlayed && amplitude > 0.3) {
        ctx.save();
        ctx.shadowColor = "#3b82f6";
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.restore();
      }
    }

    // Draw playhead
    if (duration > 0) {
      // Playhead glow
      const glowGradient = ctx.createRadialGradient(
        playbackX,
        centerY,
        0,
        playbackX,
        centerY,
        30
      );
      glowGradient.addColorStop(0, "rgba(239, 68, 68, 0.3)");
      glowGradient.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = glowGradient;
      ctx.fillRect(playbackX - 30, 0, 60, height);

      // Playhead line
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(playbackX, 4);
      ctx.lineTo(playbackX, height - 4);
      ctx.stroke();

      // Playhead handle
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(playbackX, 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(playbackX, height - 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hover indicator
    if (hoverPosition !== null && duration > 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(hoverPosition, 0);
      ctx.lineTo(hoverPosition, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hover time tooltip
      const hoverTime = (hoverPosition / width) * duration;
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      const tooltipWidth = 60;
      const tooltipX = Math.min(
        Math.max(hoverPosition - tooltipWidth / 2, 0),
        width - tooltipWidth
      );
      ctx.beginPath();
      ctx.roundRect(tooltipX, 4, tooltipWidth, 20, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "500 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(formatTime(hoverTime), hoverPosition, 18);
    }

    // Time labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "500 10px system-ui, -apple-system, sans-serif";

    // Start time
    ctx.textAlign = "left";
    ctx.fillText("0:00", 8, height - 8);

    // End time
    ctx.textAlign = "right";
    ctx.fillText(formatTime(duration), width - 8, height - 8);

    // Current time (centered at playhead)
    if (duration > 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      const timeX = Math.min(Math.max(playbackX, 30), width - 30);
      ctx.fillText(formatTime(currentTime), timeX, height - 8);
    }
  }, [samples, duration, currentTime, hoverPosition]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!samples || duration === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const time = ratio * duration;
    onSeek(Math.max(0, Math.min(time, duration)));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!samples) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    setHoverPosition(e.clientX - rect.left);
  };

  const handleMouseLeave = () => {
    setHoverPosition(null);
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        width: "100%",
        height: "100%",
        cursor: samples ? "pointer" : "default",
        borderRadius: "8px",
      }}
    />
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
}
