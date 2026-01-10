import { useRef, useEffect } from "react";

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

  useEffect(() => {
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

    // Clear
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, width, height);

    if (!samples || samples.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("No audio loaded", width / 2, height / 2);
      return;
    }

    // Draw waveform using peaks
    const numBars = Math.min(samples.length, Math.floor(width));
    const samplesPerBar = Math.floor(samples.length / numBars);
    const barWidth = width / numBars;
    const playbackPosition = duration > 0 ? currentTime / duration : 0;
    const playbackX = playbackPosition * width;

    for (let i = 0; i < numBars; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, samples.length);

      let min = 0,
        max = 0;
      for (let j = start; j < end; j++) {
        if (samples[j] < min) min = samples[j];
        if (samples[j] > max) max = samples[j];
      }

      const x = i * barWidth;
      const barHeight = Math.max(2, (max - min) * height * 0.8);
      const y = (height - barHeight) / 2;

      // Color based on playback position
      if (x < playbackX) {
        ctx.fillStyle = "#3b82f6"; // Played - blue
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)"; // Unplayed - gray
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }

    // Draw playhead
    if (duration > 0) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playbackX, 0);
      ctx.lineTo(playbackX, height);
      ctx.stroke();
    }

    // Draw time labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText(formatTime(0), 4, height - 4);
    ctx.textAlign = "right";
    ctx.fillText(formatTime(duration), width - 4, height - 4);
    ctx.textAlign = "center";
    ctx.fillText(formatTime(currentTime), playbackX, 12);
  }, [samples, duration, currentTime]);

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

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
        cursor: samples ? "pointer" : "default",
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
