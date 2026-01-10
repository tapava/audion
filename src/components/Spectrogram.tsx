import { useRef, useEffect, useCallback } from "react";
import { useComputeKit } from "@computekit/react";

interface SpectrogramProps {
  frequencyData: Uint8Array | null;
  isRecording: boolean;
  sampleRate: number;
}

// Color map for spectrogram (viridis-like)
function getColor(value: number): [number, number, number] {
  // Normalize 0-255 to 0-1
  const t = value / 255;

  // Simple heat map: black -> purple -> blue -> cyan -> green -> yellow -> red
  if (t < 0.2) {
    const s = t / 0.2;
    return [Math.floor(20 * s), 0, Math.floor(40 * s)];
  } else if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    return [20, 0, Math.floor(40 + 100 * s)];
  } else if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    return [Math.floor(20 + 30 * s), Math.floor(100 * s), 140];
  } else if (t < 0.8) {
    const s = (t - 0.6) / 0.2;
    return [
      Math.floor(50 + 150 * s),
      Math.floor(100 + 100 * s),
      Math.floor(140 - 100 * s),
    ];
  } else {
    const s = (t - 0.8) / 0.2;
    return [
      Math.floor(200 + 55 * s),
      Math.floor(200 + 55 * s),
      Math.floor(40 + 60 * s),
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

  // Register the FFT processing function with ComputeKit
  useEffect(() => {
    if (!registeredRef.current) {
      // Process frequency data in a worker (apply windowing and normalization)
      kit.register("processSpectrum", (data: number[]) => {
        // Apply log scaling for better visualization
        const processed = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
          // Log scale with min threshold
          const value = data[i];
          const logValue = value > 0 ? Math.log10((value / 255) * 9 + 1) : 0;
          processed[i] = Math.floor(logValue * 255);
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
      // Process spectrum data in background worker
      const processedData = await kit.run<number[], number[]>(
        "processSpectrum",
        Array.from(frequencyData)
      );

      // Add new column to spectrogram data
      spectrogramDataRef.current.push(new Uint8Array(processedData));

      // Limit history to canvas width
      const rect = canvas.getBoundingClientRect();
      const maxColumns = Math.floor(rect.width);
      if (spectrogramDataRef.current.length > maxColumns) {
        spectrogramDataRef.current = spectrogramDataRef.current.slice(
          -maxColumns
        );
      }
    } catch {
      // If processing fails, use raw data
      spectrogramDataRef.current.push(new Uint8Array(frequencyData));
    }
  }, [frequencyData, kit]);

  // Process new frequency data
  useEffect(() => {
    if (isRecording && frequencyData) {
      processAndDraw();
    }
  }, [frequencyData, isRecording, processAndDraw]);

  // Draw spectrogram
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

    // Clear canvas
    ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
    ctx.fillRect(0, 0, width, height);

    const data = spectrogramDataRef.current;
    if (data.length === 0) {
      // Draw placeholder text
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Start recording to see spectrogram", width / 2, height / 2);
      return;
    }

    // Draw spectrogram columns
    const columnWidth = Math.max(1, width / data.length);

    for (let x = 0; x < data.length; x++) {
      const column = data[x];
      const binHeight = height / column.length;

      for (let y = 0; y < column.length; y++) {
        const value = column[y];
        const [r, g, b] = getColor(value);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        // Draw from bottom (low freq) to top (high freq)
        const yPos = height - (y + 1) * binHeight;
        ctx.fillRect(x * columnWidth, yPos, columnWidth + 1, binHeight + 1);
      }
    }

    // Draw frequency labels
    if (sampleRate > 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";

      const nyquist = sampleRate / 2;
      const labels = [0, 1000, 2000, 5000, 10000, nyquist].filter(
        (f) => f <= nyquist
      );

      for (const freq of labels) {
        const y = height - (freq / nyquist) * height;
        if (y > 10 && y < height - 5) {
          const label =
            freq >= 1000
              ? `${(freq / 1000).toFixed(freq % 1000 === 0 ? 0 : 1)}k`
              : `${freq}`;
          ctx.fillText(label, width - 5, y + 3);
        }
      }
    }
  }, [frequencyData, isRecording, sampleRate]);

  // Clear data when not recording
  useEffect(() => {
    if (!isRecording) {
      // Keep the last spectrogram visible
    }
  }, [isRecording]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
}
