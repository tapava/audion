import { useState, useEffect, useCallback } from "react";
import { usePoolStats, useComputeKit } from "@computekit/react";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { useFileImport } from "./hooks/useFileImport";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { Waveform } from "./components/Waveform";
import { StaticWaveform } from "./components/StaticWaveform";
import { Spectrogram } from "./components/Spectrogram";
import { MFCCDisplay } from "./components/MFCCDisplay";
import { VADDisplay } from "./components/VADDisplay";
import { PitchDisplay } from "./components/PitchDisplay";
import { FormantDisplay } from "./components/FormantDisplay";
import { DropZone } from "./components/DropZone";
import { PlaybackControls } from "./components/PlaybackControls";
import type { MFCCResult, VADResult } from "./utils/dsp";
import type { PitchResult, FormantResult } from "./utils/pitch";
import {
  prepareExportData,
  exportAsJSON,
  exportAsCSV,
  exportSegmentAsWAV,
} from "./utils/export";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}.${ms}`;
}

function App() {
  const {
    state,
    audioData,
    frequencyData,
    timeData,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  // File import state
  const {
    file: importedFile,
    isLoading: isImportLoading,
    error: importError,
    importFile,
    clear: clearImport,
  } = useFileImport();

  // Audio player for imported files
  const {
    isPlaying,
    currentTime,
    duration: playerDuration,
    setAudioBuffer,
    play,
    pause,
    stop,
    seek,
  } = useAudioPlayer();

  // Load imported audio into player
  useEffect(() => {
    if (importedFile) {
      setAudioBuffer(importedFile.audioBuffer);
    } else {
      setAudioBuffer(null);
    }
  }, [importedFile, setAudioBuffer]);

  const poolStats = usePoolStats(500);
  const kit = useComputeKit();

  // Mode: "record" | "import"
  const [mode, setMode] = useState<"record" | "import">("record");

  // Phase 2 & 3 state
  const [mfccResult, setMfccResult] = useState<MFCCResult | null>(null);
  const [vadResult, setVadResult] = useState<VADResult | null>(null);
  const [pitchResult, setPitchResult] = useState<PitchResult | null>(null);
  const [formantResult, setFormantResult] = useState<FormantResult | null>(
    null
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"realtime" | "analysis">(
    "realtime"
  );
  const [selectedSegment, setSelectedSegment] = useState<{
    start: number;
    end: number;
    index: number;
  } | null>(null);
  const [processingWarning, setProcessingWarning] = useState<string | null>(
    null
  );

  // Register compute functions - must be self-contained for Web Workers
  useEffect(() => {
    // MFCC extraction - fully self-contained
    kit.register(
      "extractMFCC",
      (params: { signal: number[]; sampleRate: number }) => {
        const { signal, sampleRate } = params;

        // Pre-emphasis
        function preEmphasis(sig: number[], coef = 0.97): number[] {
          const result = new Array(sig.length);
          result[0] = sig[0];
          for (let i = 1; i < sig.length; i++) {
            result[i] = sig[i] - coef * sig[i - 1];
          }
          return result;
        }

        // Hamming window
        function hammingWindow(frame: number[]): number[] {
          const N = frame.length;
          const result = new Array(N);
          for (let i = 0; i < N; i++) {
            const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
            result[i] = frame[i] * w;
          }
          return result;
        }

        // Frame signal
        function frameSignal(
          sig: number[],
          frameSize: number,
          hopSize: number
        ): number[][] {
          const frames: number[][] = [];
          for (let i = 0; i + frameSize <= sig.length; i += hopSize) {
            frames.push(sig.slice(i, i + frameSize));
          }
          return frames;
        }

        // FFT
        function reverseBits(num: number, bits: number): number {
          let result = 0;
          for (let i = 0; i < bits; i++) {
            result = (result << 1) | (num & 1);
            num >>= 1;
          }
          return result;
        }

        function fft(sig: number[]): { real: number[]; imag: number[] } {
          const N = sig.length;
          const paddedLength = Math.pow(2, Math.ceil(Math.log2(N)));
          const real = new Array(paddedLength).fill(0);
          const imag = new Array(paddedLength).fill(0);
          for (let i = 0; i < N; i++) real[i] = sig[i];

          const bits = Math.log2(paddedLength);
          for (let i = 0; i < paddedLength; i++) {
            const j = reverseBits(i, bits);
            if (j > i) {
              [real[i], real[j]] = [real[j], real[i]];
              [imag[i], imag[j]] = [imag[j], imag[i]];
            }
          }

          for (let size = 2; size <= paddedLength; size *= 2) {
            const halfSize = size / 2;
            const angle = (-2 * Math.PI) / size;
            for (let i = 0; i < paddedLength; i += size) {
              for (let j = 0; j < halfSize; j++) {
                const wr = Math.cos(angle * j);
                const wi = Math.sin(angle * j);
                const idx1 = i + j;
                const idx2 = i + j + halfSize;
                const tr = real[idx2] * wr - imag[idx2] * wi;
                const ti = real[idx2] * wi + imag[idx2] * wr;
                real[idx2] = real[idx1] - tr;
                imag[idx2] = imag[idx1] - ti;
                real[idx1] = real[idx1] + tr;
                imag[idx1] = imag[idx1] + ti;
              }
            }
          }
          return { real, imag };
        }

        function powerSpectrum(sig: number[]): number[] {
          const { real, imag } = fft(sig);
          const N = real.length;
          const power = new Array(N / 2 + 1);
          for (let i = 0; i <= N / 2; i++) {
            power[i] = (real[i] * real[i] + imag[i] * imag[i]) / N;
          }
          return power;
        }

        // Mel scale
        function hzToMel(hz: number): number {
          return 2595 * Math.log10(1 + hz / 700);
        }
        function melToHz(mel: number): number {
          return 700 * (Math.pow(10, mel / 2595) - 1);
        }

        function createMelFilterbank(
          numFilters: number,
          fftSize: number,
          sr: number
        ): number[][] {
          const lowMel = hzToMel(0);
          const highMel = hzToMel(sr / 2);
          const melPoints = new Array(numFilters + 2);
          for (let i = 0; i < numFilters + 2; i++) {
            melPoints[i] = lowMel + (i * (highMel - lowMel)) / (numFilters + 1);
          }
          const hzPoints = melPoints.map(melToHz);
          const binPoints = hzPoints.map((hz) =>
            Math.floor(((fftSize + 1) * hz) / sr)
          );
          const filterbank: number[][] = [];
          const numBins = fftSize / 2 + 1;
          for (let i = 0; i < numFilters; i++) {
            const filter = new Array(numBins).fill(0);
            const start = binPoints[i],
              center = binPoints[i + 1],
              end = binPoints[i + 2];
            for (let j = start; j < center; j++) {
              if (j < numBins) filter[j] = (j - start) / (center - start);
            }
            for (let j = center; j < end; j++) {
              if (j < numBins) filter[j] = (end - j) / (end - center);
            }
            filterbank.push(filter);
          }
          return filterbank;
        }

        function applyFilterbank(
          powerSpec: number[],
          filterbank: number[][]
        ): number[] {
          return filterbank.map((filter) => {
            let sum = 0;
            for (
              let i = 0;
              i < Math.min(filter.length, powerSpec.length);
              i++
            ) {
              sum += filter[i] * powerSpec[i];
            }
            return sum;
          });
        }

        // DCT
        function dct(sig: number[], numCoeffs: number): number[] {
          const N = sig.length;
          const result = new Array(numCoeffs);
          for (let k = 0; k < numCoeffs; k++) {
            let sum = 0;
            for (let n = 0; n < N; n++) {
              sum += sig[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
            }
            result[k] = sum * Math.sqrt(2 / N);
          }
          result[0] *= Math.sqrt(0.5);
          return result;
        }

        // Main extraction
        const frameSize = 512,
          hopSize = 256,
          numFilters = 26,
          numCoeffs = 13;
        const processed = preEmphasis(signal);
        const frames = frameSignal(processed, frameSize, hopSize);

        const mfccs = frames.map((frame) => {
          const windowed = hammingWindow(frame);
          const power = powerSpectrum(windowed);
          const fftSize = (power.length - 1) * 2;
          const filterbank = createMelFilterbank(
            numFilters,
            fftSize,
            sampleRate
          );
          const melSpec = applyFilterbank(power, filterbank);
          const logMelSpec = melSpec.map((x) => Math.log(Math.max(x, 1e-10)));
          return dct(logMelSpec, numCoeffs);
        });

        return {
          mfccs,
          frameCount: frames.length,
          frameSize,
          hopSize,
          numCoeffs,
        };
      }
    );

    // VAD - fully self-contained
    kit.register(
      "detectVAD",
      (params: { signal: number[]; sampleRate: number }) => {
        const { signal, sampleRate } = params;
        const frameSize = 512,
          hopSize = 256;

        // Frame signal
        const frames: number[][] = [];
        for (let i = 0; i + frameSize <= signal.length; i += hopSize) {
          frames.push(signal.slice(i, i + frameSize));
        }

        // Compute energy and ZCR
        const energy = frames.map((frame) => {
          let sum = 0;
          for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
          return sum / frame.length;
        });

        const zcr = frames.map((frame) => {
          let count = 0;
          for (let i = 1; i < frame.length; i++) {
            if (
              (frame[i] >= 0 && frame[i - 1] < 0) ||
              (frame[i] < 0 && frame[i - 1] >= 0)
            ) {
              count++;
            }
          }
          return count / frame.length;
        });

        // Auto-threshold
        const noiseFrames = Math.min(10, Math.floor(frames.length * 0.1));
        const noiseEnergy = energy.slice(0, Math.max(1, noiseFrames));
        const meanNoise =
          noiseEnergy.reduce((a, b) => a + b, 0) / noiseEnergy.length;
        const energyThreshold = meanNoise * 10;
        const zcrThreshold = 0.3;

        // Detect voice
        const isVoice = energy.map(
          (e, i) => e > energyThreshold && zcr[i] < zcrThreshold
        );

        // Smooth
        const minConsecutive = 3;
        for (let i = 0; i < isVoice.length; i++) {
          if (isVoice[i]) {
            let count = 0;
            for (
              let j = i;
              j < Math.min(i + minConsecutive, isVoice.length);
              j++
            ) {
              if (isVoice[j]) count++;
            }
            if (count < minConsecutive) isVoice[i] = false;
          }
        }

        // Extract segments
        const segments: { start: number; end: number }[] = [];
        let segmentStart: number | null = null;
        for (let i = 0; i < isVoice.length; i++) {
          if (isVoice[i] && segmentStart === null) {
            segmentStart = i;
          } else if (!isVoice[i] && segmentStart !== null) {
            segments.push({
              start: (segmentStart * hopSize) / sampleRate,
              end: (i * hopSize) / sampleRate,
            });
            segmentStart = null;
          }
        }
        if (segmentStart !== null) {
          segments.push({
            start: (segmentStart * hopSize) / sampleRate,
            end: (isVoice.length * hopSize) / sampleRate,
          });
        }

        return { isVoice, energy, zcr, segments };
      }
    );

    // Pitch extraction - fully self-contained
    kit.register(
      "extractPitch",
      (params: { signal: number[]; sampleRate: number }) => {
        const { signal, sampleRate } = params;
        const frameSize = 2048;
        const hopSize = 512;
        const minF0 = 75;
        const maxF0 = 500;

        const minLag = Math.floor(sampleRate / maxF0);
        const maxLag = Math.floor(sampleRate / minF0);

        const frames: number[][] = [];
        for (let i = 0; i + frameSize <= signal.length; i += hopSize) {
          frames.push(signal.slice(i, i + frameSize));
        }

        const f0: number[] = [];
        const confidence: number[] = [];

        for (const frame of frames) {
          // Apply Hamming window
          const windowed = frame.map((x, i) => {
            const w =
              0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
            return x * w;
          });

          // Compute autocorrelation
          const r: number[] = [];
          for (let lag = 0; lag <= maxLag; lag++) {
            let sum = 0;
            for (let i = 0; i < windowed.length - lag; i++) {
              sum += windowed[i] * windowed[i + lag];
            }
            r.push(sum);
          }

          // Find peak in valid lag range
          let maxR = 0;
          let bestLag = 0;

          for (let lag = minLag; lag <= maxLag; lag++) {
            if (r[lag] > maxR) {
              maxR = r[lag];
              bestLag = lag;
            }
          }

          const r0 = r[0];
          const normalizedPeak = r0 > 0 ? maxR / r0 : 0;

          if (normalizedPeak > 0.3 && bestLag > 0) {
            // Parabolic interpolation
            let refinedLag = bestLag;
            if (bestLag > 0 && bestLag < r.length - 1) {
              const y0 = r[bestLag - 1];
              const y1 = r[bestLag];
              const y2 = r[bestLag + 1];
              const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
              if (isFinite(d) && Math.abs(d) < 1) {
                refinedLag = bestLag + d;
              }
            }
            f0.push(sampleRate / refinedLag);
            confidence.push(normalizedPeak);
          } else {
            f0.push(0);
            confidence.push(0);
          }
        }

        // Median filter
        const smoothedF0: number[] = [];
        for (let i = 0; i < f0.length; i++) {
          const start = Math.max(0, i - 1);
          const end = Math.min(f0.length, i + 2);
          const window = f0.slice(start, end).filter((x) => x > 0);
          if (window.length === 0) {
            smoothedF0.push(0);
          } else {
            window.sort((a, b) => a - b);
            smoothedF0.push(window[Math.floor(window.length / 2)]);
          }
        }

        return {
          f0: smoothedF0,
          confidence,
          frameCount: frames.length,
          hopSize,
          minF0,
          maxF0,
        };
      }
    );

    // Formant extraction - simplified LPC-based
    kit.register(
      "extractFormants",
      (params: { signal: number[]; sampleRate: number }) => {
        const { signal, sampleRate } = params;
        const frameSize = 1024;
        const hopSize = 256;
        const numFormants = 4;
        const lpcOrder = 2 * numFormants + 2;

        const frames: number[][] = [];
        for (let i = 0; i + frameSize <= signal.length; i += hopSize) {
          frames.push(signal.slice(i, i + frameSize));
        }

        const formants: number[][] = [];
        const bandwidths: number[][] = [];

        for (const frame of frames) {
          // Pre-emphasis
          const preemph: number[] = [frame[0]];
          for (let i = 1; i < frame.length; i++) {
            preemph.push(frame[i] - 0.97 * frame[i - 1]);
          }

          // Hamming window
          const windowed = preemph.map((x, i) => {
            const w =
              0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
            return x * w;
          });

          // Autocorrelation
          const r: number[] = [];
          for (let k = 0; k <= lpcOrder; k++) {
            let sum = 0;
            for (let i = 0; i < windowed.length - k; i++) {
              sum += windowed[i] * windowed[i + k];
            }
            r.push(sum);
          }

          // Levinson-Durbin
          const a: number[] = new Array(lpcOrder + 1).fill(0);
          const aPrev: number[] = new Array(lpcOrder + 1).fill(0);
          let e = r[0];

          for (let i = 1; i <= lpcOrder; i++) {
            let sum = 0;
            for (let j = 1; j < i; j++) {
              sum += aPrev[j] * r[i - j];
            }
            const k = e !== 0 ? (r[i] - sum) / e : 0;
            a[i] = k;
            for (let j = 1; j < i; j++) {
              a[j] = aPrev[j] - k * aPrev[i - j];
            }
            e = e * (1 - k * k);
            for (let j = 0; j <= lpcOrder; j++) {
              aPrev[j] = a[j];
            }
          }

          // Find formants from LPC roots (simplified)
          const frameFormants: number[] = [];
          const frameBandwidths: number[] = [];

          // Use spectral peak picking as fallback
          const nfft = 512;
          const spectrum: number[] = new Array(nfft / 2).fill(0);
          for (let k = 0; k < nfft / 2; k++) {
            let realSum = 1;
            let imagSum = 0;
            for (let i = 1; i <= lpcOrder; i++) {
              const angle = (-2 * Math.PI * k * i) / nfft;
              realSum -= a[i] * Math.cos(angle);
              imagSum -= a[i] * Math.sin(angle);
            }
            const magnitude = Math.sqrt(realSum * realSum + imagSum * imagSum);
            spectrum[k] = magnitude > 0 ? 1 / magnitude : 0;
          }

          // Find peaks
          const peaks: { freq: number; mag: number }[] = [];
          for (let k = 2; k < spectrum.length - 2; k++) {
            if (
              spectrum[k] > spectrum[k - 1] &&
              spectrum[k] > spectrum[k + 1] &&
              spectrum[k] > spectrum[k - 2] &&
              spectrum[k] > spectrum[k + 2]
            ) {
              const freq = (k * sampleRate) / nfft;
              if (freq > 90 && freq < 5000) {
                peaks.push({ freq, mag: spectrum[k] });
              }
            }
          }

          peaks.sort((a, b) => a.freq - b.freq);

          for (let i = 0; i < numFormants; i++) {
            if (i < peaks.length) {
              frameFormants.push(peaks[i].freq);
              frameBandwidths.push(100); // estimated
            } else {
              frameFormants.push(0);
              frameBandwidths.push(0);
            }
          }

          formants.push(frameFormants);
          bandwidths.push(frameBandwidths);
        }

        return { formants, bandwidths, frameCount: frames.length };
      }
    );
  }, [kit]);

  // Process audio when recording stops
  const processAudio = useCallback(
    async (data: Float32Array, sampleRate: number) => {
      if (!data || data.length === 0 || sampleRate === 0) return;

      setIsProcessing(true);
      setActiveTab("analysis");
      setProcessingWarning(null);

      try {
        // For long audio files, downsample to prevent memory issues
        // Max ~2 million samples (~45 sec at 44.1kHz, or ~90 sec at 22kHz)
        const MAX_SAMPLES = 2_000_000;
        let processedSignal: number[];
        let effectiveSampleRate = sampleRate;

        if (data.length > MAX_SAMPLES) {
          // Downsample by taking every Nth sample
          const downsampleFactor = Math.ceil(data.length / MAX_SAMPLES);
          const downsampled: number[] = [];
          for (let i = 0; i < data.length; i += downsampleFactor) {
            downsampled.push(data[i]);
          }
          processedSignal = downsampled;
          effectiveSampleRate = sampleRate / downsampleFactor;

          const originalDuration = data.length / sampleRate;
          setProcessingWarning(
            `Large file (${Math.round(
              originalDuration / 60
            )}min) - analysis uses downsampled audio for performance. Playback uses original.`
          );
          console.log(
            `Downsampled from ${data.length} to ${processedSignal.length} samples (factor ${downsampleFactor})`
          );
        } else {
          processedSignal = Array.from(data);
        }

        console.log(
          "Processing audio:",
          processedSignal.length,
          "samples at",
          effectiveSampleRate,
          "Hz"
        );

        // Run processing sequentially to avoid memory pressure
        const mfcc = await kit.run<
          { signal: number[]; sampleRate: number },
          MFCCResult
        >("extractMFCC", {
          signal: processedSignal,
          sampleRate: effectiveSampleRate,
        });
        setMfccResult(mfcc);

        const vad = await kit.run<
          { signal: number[]; sampleRate: number },
          VADResult
        >("detectVAD", {
          signal: processedSignal,
          sampleRate: effectiveSampleRate,
        });
        setVadResult(vad);

        const pitch = await kit.run<
          { signal: number[]; sampleRate: number },
          PitchResult
        >("extractPitch", {
          signal: processedSignal,
          sampleRate: effectiveSampleRate,
        });
        setPitchResult(pitch);

        const formant = await kit.run<
          { signal: number[]; sampleRate: number },
          FormantResult
        >("extractFormants", {
          signal: processedSignal,
          sampleRate: effectiveSampleRate,
        });
        setFormantResult(formant);

        console.log("Processing complete");
      } catch (err) {
        console.error("Processing error:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    [kit]
  );

  // Trigger processing when audioData becomes available after recording stops
  useEffect(() => {
    if (
      !state.isRecording &&
      audioData &&
      audioData.length > 0 &&
      state.sampleRate > 0 &&
      mode === "record"
    ) {
      processAudio(audioData, state.sampleRate);
    }
  }, [state.isRecording, audioData, state.sampleRate, processAudio, mode]);

  // Trigger processing when a file is imported
  useEffect(() => {
    if (importedFile && importedFile.samples.length > 0) {
      processAudio(importedFile.samples, importedFile.sampleRate);
    }
  }, [importedFile, processAudio]);

  const handleFileDrop = useCallback(
    (file: File) => {
      setMode("import");
      setMfccResult(null);
      setVadResult(null);
      setPitchResult(null);
      setFormantResult(null);
      setSelectedSegment(null);
      setProcessingWarning(null);
      importFile(file);
    },
    [importFile]
  );

  const handleSwitchToRecord = useCallback(() => {
    setMode("record");
    clearImport();
    setMfccResult(null);
    setVadResult(null);
    setPitchResult(null);
    setFormantResult(null);
    setSelectedSegment(null);
    setProcessingWarning(null);
    setActiveTab("realtime");
  }, [clearImport]);

  const handleSegmentClick = useCallback(
    (segment: { start: number; end: number }, index: number) => {
      setSelectedSegment({ ...segment, index });
      seek(segment.start);
    },
    [seek]
  );

  const handleExportSegment = useCallback(() => {
    if (!selectedSegment) return;

    const samples =
      mode === "import" && importedFile ? importedFile.samples : audioData;
    const sampleRate =
      mode === "import" && importedFile
        ? importedFile.sampleRate
        : state.sampleRate;

    if (samples && sampleRate > 0) {
      exportSegmentAsWAV(
        samples,
        sampleRate,
        selectedSegment.start,
        selectedSegment.end
      );
    }
  }, [selectedSegment, mode, importedFile, audioData, state.sampleRate]);

  const handleExportJSON = () => {
    const data = prepareExportData(
      state.sampleRate,
      state.duration,
      mfccResult,
      vadResult
    );
    exportAsJSON(data);
  };

  const handleExportCSV = () => {
    const data = prepareExportData(
      state.sampleRate,
      state.duration,
      mfccResult,
      vadResult
    );
    exportAsCSV(data);
  };

  const hasAnalysisData = mfccResult !== null || vadResult !== null;

  // Determine which sample rate and duration to display
  const displaySampleRate =
    mode === "import" && importedFile
      ? importedFile.sampleRate
      : state.sampleRate;
  const displayDuration =
    mode === "import" && importedFile ? importedFile.duration : state.duration;

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Audion</h1>
          <p className="subtitle">Client-side audio analyzer</p>
        </div>

        {/* Mode toggle */}
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === "record" ? "active" : ""}`}
            onClick={handleSwitchToRecord}
          >
            🎤 Record
          </button>
          <button
            className={`mode-btn ${mode === "import" ? "active" : ""}`}
            onClick={() => setMode("import")}
          >
            📁 Import
          </button>
        </div>

        <div className="controls">
          {mode === "record" && (
            <>
              <div className="status">
                <span
                  className={`status-dot ${
                    state.isRecording
                      ? "recording"
                      : state.isReady
                      ? "ready"
                      : ""
                  }`}
                />
                <span>
                  {state.isRecording
                    ? "Recording"
                    : state.isReady
                    ? "Ready"
                    : "Idle"}
                </span>
              </div>
              {!state.isRecording ? (
                <button className="btn btn-primary" onClick={startRecording}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                  Start Recording
                </button>
              ) : (
                <button className="btn btn-danger" onClick={stopRecording}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop
                </button>
              )}
            </>
          )}
          {mode === "import" && importedFile && (
            <div className="file-info">
              <span className="file-name">{importedFile.name}</span>
              <button
                className="btn btn-secondary btn-small"
                onClick={clearImport}
              >
                ✕ Clear
              </button>
            </div>
          )}
        </div>
      </header>

      {state.error && (
        <div className="error-message">
          <strong>Error:</strong> {state.error}
        </div>
      )}

      {processingWarning && (
        <div className="warning-message">
          <strong>Note:</strong> {processingWarning}
        </div>
      )}

      {/* Tab navigation */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "realtime" ? "active" : ""}`}
          onClick={() => setActiveTab("realtime")}
        >
          Real-time
        </button>
        <button
          className={`tab ${activeTab === "analysis" ? "active" : ""}`}
          onClick={() => setActiveTab("analysis")}
          disabled={!hasAnalysisData && !isProcessing}
        >
          Analysis
          {isProcessing && <span className="processing-indicator" />}
        </button>
        {hasAnalysisData && (
          <div className="export-buttons">
            <button className="btn btn-secondary" onClick={handleExportJSON}>
              Export JSON
            </button>
            <button className="btn btn-secondary" onClick={handleExportCSV}>
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Real-time visualizers */}
      {activeTab === "realtime" && mode === "record" && (
        <div className="visualizers">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Waveform</span>
              <span className="panel-info">Time Domain</span>
            </div>
            <div className="canvas-container">
              <Waveform timeData={timeData} isRecording={state.isRecording} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Spectrogram</span>
              <span className="panel-info">
                {state.sampleRate > 0
                  ? `0 - ${(state.sampleRate / 2 / 1000).toFixed(1)}kHz`
                  : "Frequency"}
              </span>
            </div>
            <div className="canvas-container">
              <Spectrogram
                frequencyData={frequencyData}
                isRecording={state.isRecording}
                sampleRate={state.sampleRate}
              />
            </div>
          </div>
        </div>
      )}

      {/* Import mode - show drop zone or imported audio */}
      {activeTab === "realtime" && mode === "import" && (
        <div className="visualizers">
          {!importedFile ? (
            <div className="panel import-panel">
              <DropZone
                onFileDrop={handleFileDrop}
                isLoading={isImportLoading}
                error={importError}
              />
            </div>
          ) : (
            <>
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Waveform</span>
                  <span className="panel-info">
                    {importedFile.duration.toFixed(2)}s @{" "}
                    {(importedFile.sampleRate / 1000).toFixed(1)}kHz
                  </span>
                </div>
                <div className="canvas-container">
                  <StaticWaveform
                    samples={importedFile.samples}
                    duration={playerDuration}
                    currentTime={currentTime}
                    onSeek={seek}
                  />
                </div>
                <PlaybackControls
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={playerDuration}
                  onPlay={play}
                  onPause={pause}
                  onStop={stop}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Analysis visualizers (Phase 2 & 3) */}
      {activeTab === "analysis" && (
        <div className="visualizers">
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">MFCC</span>
              <span className="panel-info">
                {mfccResult
                  ? `${mfccResult.numCoeffs} coefficients × ${mfccResult.frameCount} frames`
                  : "Mel-Frequency Cepstral Coefficients"}
              </span>
            </div>
            <div className="canvas-container">
              <MFCCDisplay
                mfccs={mfccResult?.mfccs ?? null}
                isProcessing={isProcessing}
                duration={displayDuration}
                currentTime={mode === "import" ? currentTime : 0}
                onSeek={mode === "import" ? seek : undefined}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Pitch (F0)</span>
              <span className="panel-info">
                {pitchResult
                  ? `${pitchResult.minF0}-${pitchResult.maxF0} Hz range`
                  : "Fundamental Frequency"}
              </span>
            </div>
            <div className="canvas-container">
              <PitchDisplay
                pitch={pitchResult}
                duration={displayDuration}
                currentTime={mode === "import" ? currentTime : 0}
                isProcessing={isProcessing}
                onSeek={mode === "import" ? seek : undefined}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Formants</span>
              <span className="panel-info">
                {formantResult
                  ? `F1-F4 × ${formantResult.frameCount} frames`
                  : "Resonance Frequencies"}
              </span>
            </div>
            <div className="canvas-container">
              <FormantDisplay
                formants={formantResult}
                duration={displayDuration}
                currentTime={mode === "import" ? currentTime : 0}
                isProcessing={isProcessing}
                onSeek={mode === "import" ? seek : undefined}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">Voice Activity Detection</span>
              <span className="panel-info">
                {vadResult
                  ? `${vadResult.segments.length} segments detected`
                  : "Energy / ZCR Analysis"}
              </span>
            </div>
            <div className="canvas-container">
              <VADDisplay
                energy={vadResult?.energy ?? null}
                zcr={vadResult?.zcr ?? null}
                isVoice={vadResult?.isVoice ?? null}
                segments={vadResult?.segments ?? null}
                duration={displayDuration}
                currentTime={mode === "import" ? currentTime : 0}
                onSeek={mode === "import" ? seek : undefined}
                onSegmentClick={handleSegmentClick}
              />
            </div>
          </div>

          {/* Segment list */}
          {vadResult && vadResult.segments.length > 0 && (
            <div className="panel segments-panel">
              <div className="panel-header">
                <span className="panel-title">Detected Segments</span>
                {selectedSegment && (
                  <button
                    className="btn btn-secondary btn-small"
                    onClick={handleExportSegment}
                  >
                    Export Segment #{selectedSegment.index + 1}
                  </button>
                )}
              </div>
              <div className="segments-list">
                {vadResult.segments.map((seg, i) => (
                  <div
                    key={i}
                    className={`segment-item ${
                      selectedSegment?.index === i ? "selected" : ""
                    }`}
                    onClick={() => handleSegmentClick(seg, i)}
                  >
                    <span className="segment-index">#{i + 1}</span>
                    <span className="segment-time">
                      {seg.start.toFixed(2)}s - {seg.end.toFixed(2)}s
                    </span>
                    <span className="segment-duration">
                      ({(seg.end - seg.start).toFixed(2)}s)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Playback controls in analysis view for imported files */}
          {mode === "import" && importedFile && (
            <div className="panel playback-panel">
              <PlaybackControls
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={playerDuration}
                onPlay={play}
                onPause={pause}
                onStop={stop}
              />
            </div>
          )}
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <span className="stat-label">Duration</span>
          <span className="stat-value">{formatDuration(displayDuration)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Sample Rate</span>
          <span className="stat-value">
            {displaySampleRate > 0
              ? `${(displaySampleRate / 1000).toFixed(1)} kHz`
              : "--"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Workers</span>
          <span className="stat-value">
            {poolStats.activeWorkers}/{poolStats.totalWorkers}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Tasks Completed</span>
          <span className="stat-value">{poolStats.tasksCompleted}</span>
        </div>
      </div>
    </div>
  );
}

export default App;
