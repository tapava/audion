import { useRef, useEffect, useCallback, useState } from "react";

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
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);

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
    const labelWidth = 55;
    const topMargin = 25;
    const bottomMargin = 25;
    const plotWidth = width - labelWidth - 15;

    // Dark gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a0e14");
    bgGradient.addColorStop(1, "#0d1117");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    if (!energy || !zcr || !isVoice || energy.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "500 14px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Record audio to see voice activity detection",
        width / 2,
        height / 2
      );
      return;
    }

    const numFrames = energy.length;
    const frameWidth = plotWidth / numFrames;

    // Heights for each section
    const voiceHeight = 28;
    const plotAreaHeight = height - topMargin - bottomMargin - voiceHeight - 10;
    const energyHeight = plotAreaHeight * 0.5;
    const zcrHeight = plotAreaHeight * 0.5;

    // Header
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "600 10px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("VOICE ACTIVITY DETECTION", labelWidth + 5, 14);

    if (segments && segments.length > 0) {
      ctx.fillStyle = "rgba(34, 197, 94, 0.8)";
      ctx.font = "500 9px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(
        `${segments.length} segment${segments.length > 1 ? "s" : ""} detected`,
        width - 10,
        14
      );
    }

    // Label area background
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, labelWidth - 2, height);

    // Draw voice activity regions (background highlight)
    for (let i = 0; i < numFrames; i++) {
      if (isVoice[i]) {
        const x = labelWidth + i * frameWidth;
        const gradient = ctx.createLinearGradient(
          0,
          topMargin,
          0,
          height - bottomMargin
        );
        gradient.addColorStop(0, "rgba(34, 197, 94, 0.12)");
        gradient.addColorStop(0.5, "rgba(34, 197, 94, 0.08)");
        gradient.addColorStop(1, "rgba(34, 197, 94, 0.12)");
        ctx.fillStyle = gradient;
        ctx.fillRect(
          x,
          topMargin,
          frameWidth + 0.5,
          height - topMargin - bottomMargin
        );
      }
    }

    // Draw segment highlights
    if (segments && segments.length > 0 && duration > 0) {
      segments.forEach((segment, idx) => {
        const startX = labelWidth + (segment.start / duration) * plotWidth;
        const endX = labelWidth + (segment.end / duration) * plotWidth;
        const segWidth = endX - startX;

        const isHovered = hoveredSegment === idx;

        // Segment background
        ctx.fillStyle = isHovered
          ? "rgba(34, 197, 94, 0.25)"
          : "rgba(34, 197, 94, 0.08)";
        ctx.fillRect(
          startX,
          topMargin,
          segWidth,
          height - topMargin - bottomMargin
        );

        // Segment boundaries
        ctx.strokeStyle = isHovered ? "#22c55e" : "rgba(34, 197, 94, 0.6)";
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.setLineDash(isHovered ? [] : [4, 4]);

        ctx.beginPath();
        ctx.moveTo(startX, topMargin);
        ctx.lineTo(startX, height - bottomMargin);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(endX, topMargin);
        ctx.lineTo(endX, height - bottomMargin);
        ctx.stroke();

        ctx.setLineDash([]);

        // Segment label
        if (segWidth > 30) {
          const segDuration = segment.end - segment.start;
          ctx.fillStyle = isHovered ? "#22c55e" : "rgba(34, 197, 94, 0.7)";
          ctx.font = "500 8px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(
            `${segDuration.toFixed(2)}s`,
            startX + segWidth / 2,
            height - bottomMargin - 5
          );
        }
      });
    }

    // Voice activity bar
    const voiceY = topMargin;

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "500 9px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("Voice", labelWidth - 8, voiceY + voiceHeight / 2 + 3);

    // Voice bar background
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    ctx.beginPath();
    ctx.roundRect(labelWidth, voiceY + 4, plotWidth, voiceHeight - 8, 4);
    ctx.fill();

    for (let i = 0; i < numFrames; i++) {
      const x = labelWidth + i * frameWidth;
      const barHeight = voiceHeight - 8;

      if (isVoice[i]) {
        const gradient = ctx.createLinearGradient(
          0,
          voiceY + 4,
          0,
          voiceY + 4 + barHeight
        );
        gradient.addColorStop(0, "#4ade80");
        gradient.addColorStop(1, "#22c55e");
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = "rgba(55, 65, 81, 0.5)";
      }

      ctx.fillRect(x, voiceY + 4, Math.max(1, frameWidth - 0.5), barHeight);
    }

    // Energy plot
    const energyY = voiceY + voiceHeight + 8;
    const maxEnergy = Math.max(...energy);
    const normalizedEnergy = energy.map((e) =>
      maxEnergy > 0 ? e / maxEnergy : 0
    );

    ctx.fillStyle = "rgba(59, 130, 246, 0.4)";
    ctx.font = "500 9px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("Energy", labelWidth - 8, energyY + energyHeight / 2 + 3);

    // Energy area fill
    ctx.beginPath();
    ctx.moveTo(labelWidth, energyY + energyHeight);
    for (let i = 0; i < numFrames; i++) {
      const x = labelWidth + i * frameWidth + frameWidth / 2;
      const y =
        energyY + energyHeight - normalizedEnergy[i] * (energyHeight - 5);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(labelWidth + plotWidth, energyY + energyHeight);
    ctx.closePath();

    const energyGradient = ctx.createLinearGradient(
      0,
      energyY,
      0,
      energyY + energyHeight
    );
    energyGradient.addColorStop(0, "rgba(59, 130, 246, 0.3)");
    energyGradient.addColorStop(1, "rgba(59, 130, 246, 0.02)");
    ctx.fillStyle = energyGradient;
    ctx.fill();

    // Energy line
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    for (let i = 0; i < numFrames; i++) {
      const x = labelWidth + i * frameWidth + frameWidth / 2;
      const y =
        energyY + energyHeight - normalizedEnergy[i] * (energyHeight - 5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ZCR plot
    const zcrY = energyY + energyHeight + 8;
    const maxZCR = Math.max(...zcr);
    const normalizedZCR = zcr.map((z) => (maxZCR > 0 ? z / maxZCR : 0));

    ctx.fillStyle = "rgba(245, 158, 11, 0.4)";
    ctx.font = "500 9px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("ZCR", labelWidth - 8, zcrY + zcrHeight / 2 + 3);

    // ZCR area fill
    ctx.beginPath();
    ctx.moveTo(labelWidth, zcrY + zcrHeight);
    for (let i = 0; i < numFrames; i++) {
      const x = labelWidth + i * frameWidth + frameWidth / 2;
      const y = zcrY + zcrHeight - normalizedZCR[i] * (zcrHeight - 5);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(labelWidth + plotWidth, zcrY + zcrHeight);
    ctx.closePath();

    const zcrGradient = ctx.createLinearGradient(0, zcrY, 0, zcrY + zcrHeight);
    zcrGradient.addColorStop(0, "rgba(245, 158, 11, 0.25)");
    zcrGradient.addColorStop(1, "rgba(245, 158, 11, 0.02)");
    ctx.fillStyle = zcrGradient;
    ctx.fill();

    // ZCR line
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < numFrames; i++) {
      const x = labelWidth + i * frameWidth + frameWidth / 2;
      const y = zcrY + zcrHeight - normalizedZCR[i] * (zcrHeight - 5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

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
        20
      );
      glowGradient.addColorStop(0, "rgba(239, 68, 68, 0.25)");
      glowGradient.addColorStop(1, "rgba(239, 68, 68, 0)");
      ctx.fillStyle = glowGradient;
      ctx.fillRect(
        playheadX - 20,
        topMargin,
        40,
        height - topMargin - bottomMargin
      );

      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(playheadX, topMargin);
      ctx.lineTo(playheadX, height - bottomMargin);
      ctx.stroke();
    }
  }, [energy, zcr, isVoice, segments, duration, currentTime, hoveredSegment]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || duration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const labelWidth = 55;
    const plotWidth = rect.width - labelWidth - 15;
    const clickTime = ((x - labelWidth) / plotWidth) * duration;

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
    if (onSeek && x > labelWidth) {
      onSeek(Math.max(0, Math.min(clickTime, duration)));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!segments || duration === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const labelWidth = 55;
    const plotWidth = rect.width - labelWidth - 15;
    const hoverTime = ((x - labelWidth) / plotWidth) * duration;

    let found = -1;
    for (let i = 0; i < segments.length; i++) {
      if (hoverTime >= segments[i].start && hoverTime <= segments[i].end) {
        found = i;
        break;
      }
    }
    setHoveredSegment(found >= 0 ? found : null);
  };

  const handleMouseLeave = () => setHoveredSegment(null);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        width: "100%",
        height: "100%",
        cursor: onSeek || onSegmentClick ? "pointer" : "default",
        borderRadius: "8px",
      }}
    />
  );
}
