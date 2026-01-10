import type { MFCCResult, VADResult } from "../utils/dsp";

export interface ExportData {
  metadata: {
    exportedAt: string;
    sampleRate: number;
    duration: number;
    frameSize: number;
    hopSize: number;
  };
  mfcc?: {
    numCoeffs: number;
    frameCount: number;
    coefficients: number[][];
  };
  vad?: {
    energy: number[];
    zcr: number[];
    isVoice: boolean[];
    segments: { start: number; end: number }[];
  };
}

export function prepareExportData(
  sampleRate: number,
  duration: number,
  mfccResult: MFCCResult | null,
  vadResult: VADResult | null
): ExportData {
  const data: ExportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      sampleRate,
      duration,
      frameSize: mfccResult?.frameSize ?? 512,
      hopSize: mfccResult?.hopSize ?? 256,
    },
  };

  if (mfccResult) {
    data.mfcc = {
      numCoeffs: mfccResult.numCoeffs,
      frameCount: mfccResult.frameCount,
      coefficients: mfccResult.mfccs,
    };
  }

  if (vadResult) {
    data.vad = {
      energy: vadResult.energy,
      zcr: vadResult.zcr,
      isVoice: vadResult.isVoice,
      segments: vadResult.segments,
    };
  }

  return data;
}

export function exportAsJSON(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, `audion-export-${formatTimestamp()}.json`);
}

export function exportAsCSV(data: ExportData): void {
  const lines: string[] = [];

  // Header with metadata
  lines.push("# Audion Audio Analysis Export");
  lines.push(`# Exported: ${data.metadata.exportedAt}`);
  lines.push(`# Sample Rate: ${data.metadata.sampleRate} Hz`);
  lines.push(`# Duration: ${data.metadata.duration.toFixed(3)} s`);
  lines.push(`# Frame Size: ${data.metadata.frameSize}`);
  lines.push(`# Hop Size: ${data.metadata.hopSize}`);
  lines.push("");

  // MFCC data
  if (data.mfcc) {
    lines.push("# MFCC Coefficients");

    // Header row
    const mfccHeaders = ["frame"];
    for (let i = 0; i < data.mfcc.numCoeffs; i++) {
      mfccHeaders.push(`c${i}`);
    }
    lines.push(mfccHeaders.join(","));

    // Data rows
    for (let i = 0; i < data.mfcc.coefficients.length; i++) {
      const row = [
        i.toString(),
        ...data.mfcc.coefficients[i].map((v) => v.toFixed(6)),
      ];
      lines.push(row.join(","));
    }
    lines.push("");
  }

  // VAD data
  if (data.vad) {
    lines.push("# VAD Analysis");
    lines.push("frame,energy,zcr,is_voice");

    for (let i = 0; i < data.vad.energy.length; i++) {
      const row = [
        i.toString(),
        data.vad.energy[i].toFixed(8),
        data.vad.zcr[i].toFixed(6),
        data.vad.isVoice[i] ? "1" : "0",
      ];
      lines.push(row.join(","));
    }
    lines.push("");

    // Segments
    if (data.vad.segments.length > 0) {
      lines.push("# Voice Segments");
      lines.push("segment,start_s,end_s,duration_s");
      for (let i = 0; i < data.vad.segments.length; i++) {
        const seg = data.vad.segments[i];
        const row = [
          i.toString(),
          seg.start.toFixed(3),
          seg.end.toFixed(3),
          (seg.end - seg.start).toFixed(3),
        ];
        lines.push(row.join(","));
      }
    }
  }

  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  downloadBlob(blob, `audion-export-${formatTimestamp()}.csv`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Export a segment of audio as a WAV file
 */
export function exportSegmentAsWAV(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
  filename?: string
): void {
  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.floor(end * sampleRate);
  const segmentSamples = samples.slice(startSample, endSample);

  const wavBlob = createWAVBlob(segmentSamples, sampleRate);
  const name =
    filename || `segment-${start.toFixed(2)}s-${end.toFixed(2)}s.wav`;
  downloadBlob(wavBlob, name);
}

/**
 * Create a WAV file blob from Float32Array samples
 */
function createWAVBlob(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
