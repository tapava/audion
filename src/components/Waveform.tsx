import { useRef, useEffect } from "react";

interface WaveformProps {
  timeData: Uint8Array | null;
  isRecording: boolean;
}

export function Waveform({ timeData, isRecording }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const historyRef = useRef<number[][]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const draw = () => {
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

      // Subtle grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      for (let y = 0; y < height; y += height / 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center line with subtle glow
      ctx.strokeStyle = "rgba(100, 150, 200, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      if (!timeData || timeData.length === 0) {
        // Animated idle line
        ctx.strokeStyle = "rgba(59, 130, 246, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const time = Date.now() / 1000;
        for (let x = 0; x < width; x++) {
          const y = centerY + Math.sin(x * 0.02 + time * 2) * 3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }

      // Store history for trail effect
      const currentData: number[] = [];
      for (let i = 0; i < timeData.length; i++) {
        currentData.push((timeData[i] - 128) / 128);
      }
      historyRef.current.push(currentData);
      if (historyRef.current.length > 3) {
        historyRef.current.shift();
      }

      // Draw history trails (ghost effect)
      historyRef.current.forEach((data, histIndex) => {
        const alpha =
          ((histIndex + 1) / (historyRef.current.length + 1)) * 0.15;
        ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const sliceWidth = width / data.length;
        for (let i = 0; i < data.length; i++) {
          const x = i * sliceWidth;
          const y = centerY + data[i] * (height * 0.4);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      // Main waveform with gradient
      const waveGradient = ctx.createLinearGradient(0, 0, 0, height);
      if (isRecording) {
        waveGradient.addColorStop(0, "#60a5fa");
        waveGradient.addColorStop(0.5, "#3b82f6");
        waveGradient.addColorStop(1, "#2563eb");
      } else {
        waveGradient.addColorStop(0, "#6b7280");
        waveGradient.addColorStop(0.5, "#4b5563");
        waveGradient.addColorStop(1, "#374151");
      }

      ctx.strokeStyle = waveGradient;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      const sliceWidth = width / timeData.length;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        const x = i * sliceWidth;
        const y = centerY + v * (height * 0.4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow effect when recording
      if (isRecording) {
        ctx.save();
        ctx.shadowColor = "#3b82f6";
        ctx.shadowBlur = 15;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.restore();

        // Peak indicators
        let maxPeak = 0;
        let maxPeakIndex = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = Math.abs((timeData[i] - 128) / 128);
          if (v > maxPeak) {
            maxPeak = v;
            maxPeakIndex = i;
          }
        }
        if (maxPeak > 0.5) {
          const x = maxPeakIndex * sliceWidth;
          const gradient = ctx.createRadialGradient(
            x,
            centerY,
            0,
            x,
            centerY,
            20
          );
          gradient.addColorStop(0, "rgba(59, 130, 246, 0.4)");
          gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(x, centerY, 20, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Level meters on sides
      let rms = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        rms += v * v;
      }
      rms = Math.sqrt(rms / timeData.length);
      const level = Math.min(1, rms * 3);

      // Left meter
      const meterWidth = 4;
      const meterHeight = height * 0.7 * level;
      const meterGradient = ctx.createLinearGradient(
        0,
        height,
        0,
        height - meterHeight
      );
      meterGradient.addColorStop(0, "#22c55e");
      meterGradient.addColorStop(0.6, "#eab308");
      meterGradient.addColorStop(1, "#ef4444");
      ctx.fillStyle = meterGradient;
      ctx.fillRect(
        4,
        height - meterHeight - height * 0.15,
        meterWidth,
        meterHeight
      );

      // Right meter
      ctx.fillRect(
        width - meterWidth - 4,
        height - meterHeight - height * 0.15,
        meterWidth,
        meterHeight
      );
    };

    draw();

    if (isRecording) {
      const animate = () => {
        draw();
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [timeData, isRecording]);

  useEffect(() => {
    if (!isRecording) {
      historyRef.current = [];
    }
  }, [isRecording]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", borderRadius: "8px" }}
    />
  );
}
