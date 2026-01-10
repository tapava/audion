import { useRef, useEffect, useCallback } from "react";

interface VADDisplayProps {
  energy: number[] | null;
  zcr: number[] | null;
  isVoice: boolean[] | null;
  segments: { start: number; end: number }[] | null;
  duration: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  onSegmentClick?: (
    segment: { start: number; end: number },
    index: number
  ) => void;
}

export function VADDisplay({
  energy,
  zcr,
  isVoice,
  segments,
  duration,
  currentTime = 0,
  onSeek,
  onSegmentClick,
}: VADDisplayProps) {
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

    if (!energy || !zcr || !isVoice || energy.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Record audio to see VAD analysis", width / 2, height / 2);
      return;
    }

    const numFrames = energy.length;
    const frameWidth = width / numFrames;

    // Heights for each section
    const voiceHeight = 30;
    const energyHeight = (height - voiceHeight) / 2;
    const zcrHeight = height - voiceHeight - energyHeight;

    // Draw voice activity regions (background)
    for (let i = 0; i < numFrames; i++) {
      if (isVoice[i]) {
        ctx.fillStyle = "rgba(34, 197, 94, 0.2)";
        ctx.fillRect(i * frameWidth, 0, frameWidth + 1, height);
      }
    }

    // Draw voice activity bar at top
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(0, 0, width, voiceHeight);

    for (let i = 0; i < numFrames; i++) {
      ctx.fillStyle = isVoice[i] ? "#22c55e" : "#374151";
      ctx.fillRect(i * frameWidth, 5, frameWidth - 1, voiceHeight - 10);
    }

    // Normalize energy for display
    const maxEnergy = Math.max(...energy);
    const normalizedEnergy = energy.map((e) =>
      maxEnergy > 0 ? e / maxEnergy : 0
    );

    // Draw energy plot
    const energyY = voiceHeight;
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < numFrames; i++) {
      const x = i * frameWidth + frameWidth / 2;
      const y =
        energyY + energyHeight - normalizedEnergy[i] * (energyHeight - 10);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw ZCR plot
    const zcrY = voiceHeight + energyHeight;
    const maxZCR = Math.max(...zcr);
    const normalizedZCR = zcr.map((z) => (maxZCR > 0 ? z / maxZCR : 0));

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < numFrames; i++) {
      const x = i * frameWidth + frameWidth / 2;
      const y = zcrY + zcrHeight - normalizedZCR[i] * (zcrHeight - 10);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw labels
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("Voice", 5, 18);
    ctx.fillStyle = "#3b82f6";
    ctx.fillText("Energy", 5, energyY + 15);
    ctx.fillStyle = "#f59e0b";
    ctx.fillText("ZCR", 5, zcrY + 15);

    // Draw segment markers
    if (segments && segments.length > 0 && duration > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";

      for (const segment of segments) {
        const startX = (segment.start / duration) * width;
        const endX = (segment.end / duration) * width;

        // Draw segment boundary lines
        ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw playhead
    if (duration > 0 && currentTime >= 0) {
      const playheadX = (currentTime / duration) * width;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
    }
  }, [energy, zcr, isVoice, segments, duration, currentTime]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickTime = (x / rect.width) * duration;

    // Check if clicking on a segment
    if (segments && onSegmentClick) {
      for (let i = 0; i < segments.length; i++) {
        if (clickTime >= segments[i].start && clickTime <= segments[i].end) {
          onSegmentClick(segments[i], i);
          return;
        }
      }
    }

    // Otherwise seek
    if (onSeek) {
      onSeek(Math.max(0, Math.min(clickTime, duration)));
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
        cursor: onSeek || onSegmentClick ? "pointer" : "default",
      }}
    />
  );
}
