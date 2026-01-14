import { useRef, useEffect, useCallback } from "react";
import { useComputeKit } from "@computekit/react";

interface SpectrogramProps {
  frequencyData: Uint8Array | null;
  isRecording: boolean;
  sampleRate: number;
}

// Professional color palette inspired by scientific visualization
function getColor(value: number): [number, number, number] {
  const t = value / 255;

  // Deep ocean to hot plasma gradient
  if (t < 0.1) {
    // Near black to deep blue
    const s = t / 0.1;
    return [Math.floor(8 * s), Math.floor(12 * s), Math.floor(35 * s)];
  } else if (t < 0.25) {
    // Deep blue to purple
    const s = (t - 0.1) / 0.15;
    return [
      Math.floor(8 + 50 * s),
      Math.floor(12 + 20 * s),
      Math.floor(35 + 90 * s),
    ];
  } else if (t < 0.4) {
    // Purple to magenta
    const s = (t - 0.25) / 0.15;
    return [
      Math.floor(58 + 100 * s),
      Math.floor(32 - 10 * s),
      Math.floor(125 + 30 * s),
    ];
  } else if (t < 0.55) {
    // Magenta to red-orange
    const s = (t - 0.4) / 0.15;
    return [
      Math.floor(158 + 60 * s),
      Math.floor(22 + 50 * s),
      Math.floor(155 - 100 * s),
    ];
  } else if (t < 0.7) {
    // Red-orange to orange
    const s = (t - 0.55) / 0.15;
    return [
      Math.floor(218 + 25 * s),
      Math.floor(72 + 80 * s),
      Math.floor(55 - 30 * s),
    ];
  } else if (t < 0.85) {
    // Orange to yellow
    const s = (t - 0.7) / 0.15;
    return [
      Math.floor(243 + 10 * s),
      Math.floor(152 + 70 * s),
      Math.floor(25 + 20 * s),
    ];
  } else {
    // Yellow to white
    const s = (t - 0.85) / 0.15;
    return [
      Math.floor(253 + 2 * s),
      Math.floor(222 + 33 * s),
      Math.floor(45 + 180 * s),
    ];
  }
}

export function Spectrogram({
  frequencyData,
  isRecording,
  sampleRate,
}: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spectrogramDataRef = useRef<Uint8Array[]>([]);
  const kit = useComputeKit();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!registeredRef.current) {
      kit.register("processSpectrum", (data: number[]) => {
        const processed = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
          // Enhanced log scaling with better dynamic range
          const value = data[i];
          const normalized = value / 255;
          const logValue =
            normalized > 0 ? Math.pow(Math.log10(normalized * 9 + 1), 0.8) : 0;
          processed[i] = Math.floor(Math.min(255, logValue * 280));
        }
        return processed;
      });
      registeredRef.current = true;
    }
  }, [kit]);

  const processAndDraw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !frequencyData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const processedData = await kit.run<number[], number[]>(
        "processSpectrum",
        Array.from(frequencyData)
      );
      spectrogramDataRef.current.push(new Uint8Array(processedData));

      const rect = canvas.getBoundingClientRect();
      const maxColumns = Math.floor(rect.width);
      if (spectrogramDataRef.current.length > maxColumns) {
        spectrogramDataRef.current = spectrogramDataRef.current.slice(
          -maxColumns
        );
      }
    } catch {
      spectrogramDataRef.current.push(new Uint8Array(frequencyData));
    }
  }, [frequencyData, kit]);

  useEffect(() => {
    if (isRecording && frequencyData) {
      processAndDraw();
    }
  }, [frequencyData, isRecording, processAndDraw]);

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

    // Deep dark background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#0a0e14");
    bgGradient.addColorStop(1, "#0d1117");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    const data = spectrogramDataRef.current;
    if (data.length === 0) {
      // Stylish placeholder
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.font = "500 14px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Start recording to see spectrogram", width / 2, height / 2);

      // Decorative frequency lines
      ctx.strokeStyle = "rgba(59, 130, 246, 0.1)";
      ctx.lineWidth = 1;
      for (let y = height * 0.2; y < height; y += height * 0.2) {
        ctx.beginPath();
        ctx.setLineDash([4, 8]);
        ctx.moveTo(40, y);
        ctx.lineTo(width - 10, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      return;
    }

    // Draw spectrogram with smooth interpolation
    const columnWidth = Math.max(1, width / data.length);
    const labelWidth = 45;

    // Create image data for smooth rendering
    for (let x = 0; x < data.length; x++) {
      const column = data[x];
      const binHeight = height / column.length;
      const xPos = labelWidth + (x * (width - labelWidth - 10)) / data.length;

      for (let y = 0; y < column.length; y++) {
        const value = column[y];
        const [r, g, b] = getColor(value);

        // Add subtle glow for high values
        if (value > 200) {
          ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;
          ctx.shadowBlur = 3;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        const yPos = height - (y + 1) * binHeight;
        ctx.fillRect(xPos, yPos, columnWidth + 0.5, binHeight + 0.5);
      }
    }
    ctx.shadowBlur = 0;

    // Gradient overlay at edges for polish
    const leftFade = ctx.createLinearGradient(
      labelWidth,
      0,
      labelWidth + 30,
      0
    );
    leftFade.addColorStop(0, "rgba(10, 14, 20, 0.5)");
    leftFade.addColorStop(1, "rgba(10, 14, 20, 0)");
    ctx.fillStyle = leftFade;
    ctx.fillRect(labelWidth, 0, 30, height);

    const rightFade = ctx.createLinearGradient(width - 40, 0, width - 10, 0);
    rightFade.addColorStop(0, "rgba(10, 14, 20, 0)");
    rightFade.addColorStop(1, "rgba(10, 14, 20, 0.5)");
    ctx.fillStyle = rightFade;
    ctx.fillRect(width - 40, 0, 40, height);

    // Draw frequency labels with better styling
    if (sampleRate > 0) {
      ctx.fillStyle = "#0a0e14";
      ctx.fillRect(0, 0, labelWidth - 5, height);

      const nyquist = sampleRate / 2;
      const frequencies = [0, 500, 1000, 2000, 4000, 8000, 16000].filter(
        (f) => f <= nyquist
      );

      ctx.font = "500 10px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";

      frequencies.forEach((freq, i) => {
        const y = height - (freq / nyquist) * height;
        if (y > 12 && y < height - 5) {
          // Grid line
          ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(labelWidth, y);
          ctx.lineTo(width - 10, y);
          ctx.stroke();

          // Label
          const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
          ctx.fillText(label, labelWidth - 8, y + 3);

          // Tick mark
          ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
          ctx.beginPath();
          ctx.moveTo(labelWidth - 5, y);
          ctx.lineTo(labelWidth, y);
          ctx.stroke();
        }
      });

      // Hz label
      ctx.save();
      ctx.translate(12, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "500 9px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("FREQUENCY (Hz)", 0, 0);
      ctx.restore();
    }

    // Time indicator
    if (isRecording) {
      const pulseAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.3;
      ctx.fillStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
      ctx.beginPath();
      ctx.arc(width - 20, 15, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [frequencyData, isRecording, sampleRate]);

  useEffect(() => {
    if (!isRecording) {
      // Keep last spectrogram visible
    }
  }, [isRecording]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", borderRadius: "8px" }}
    />
  );
}
