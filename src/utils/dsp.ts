/**
 * Audio DSP utilities for feature extraction
 * All functions are pure and designed to run in Web Workers via ComputeKit
 */

/**
 * Apply pre-emphasis filter to boost high frequencies
 */
export function preEmphasis(signal: number[], coefficient = 0.97): number[] {
  const result = new Array(signal.length);
  result[0] = signal[0];
  for (let i = 1; i < signal.length; i++) {
    result[i] = signal[i] - coefficient * signal[i - 1];
  }
  return result;
}

/**
 * Apply Hamming window to a frame
 */
export function hammingWindow(frame: number[]): number[] {
  const N = frame.length;
  const result = new Array(N);
  for (let i = 0; i < N; i++) {
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    result[i] = frame[i] * window;
  }
  return result;
}

/**
 * Split signal into overlapping frames
 */
export function frameSignal(
  signal: number[],
  frameSize: number,
  hopSize: number
): number[][] {
  const frames: number[][] = [];
  for (let i = 0; i + frameSize <= signal.length; i += hopSize) {
    frames.push(signal.slice(i, i + frameSize));
  }
  return frames;
}

/**
 * Compute FFT magnitude spectrum using Cooley-Tukey algorithm
 */
export function fft(signal: number[]): { real: number[]; imag: number[] } {
  const N = signal.length;

  // Pad to next power of 2
  const paddedLength = Math.pow(2, Math.ceil(Math.log2(N)));
  const real = new Array(paddedLength).fill(0);
  const imag = new Array(paddedLength).fill(0);

  for (let i = 0; i < N; i++) {
    real[i] = signal[i];
  }

  // Bit-reversal permutation
  const bits = Math.log2(paddedLength);
  for (let i = 0; i < paddedLength; i++) {
    const j = reverseBits(i, bits);
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Cooley-Tukey FFT
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

function reverseBits(num: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (num & 1);
    num >>= 1;
  }
  return result;
}

/**
 * Compute power spectrum from FFT
 */
export function powerSpectrum(signal: number[]): number[] {
  const { real, imag } = fft(signal);
  const N = real.length;
  const power = new Array(N / 2 + 1);

  for (let i = 0; i <= N / 2; i++) {
    power[i] = (real[i] * real[i] + imag[i] * imag[i]) / N;
  }

  return power;
}

/**
 * Convert frequency to Mel scale
 */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/**
 * Convert Mel to frequency
 */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Create Mel filterbank
 */
export function createMelFilterbank(
  numFilters: number,
  fftSize: number,
  sampleRate: number,
  lowFreq = 0,
  highFreq?: number
): number[][] {
  highFreq = highFreq || sampleRate / 2;

  const lowMel = hzToMel(lowFreq);
  const highMel = hzToMel(highFreq);

  // Create equally spaced points in Mel scale
  const melPoints = new Array(numFilters + 2);
  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = lowMel + (i * (highMel - lowMel)) / (numFilters + 1);
  }

  // Convert back to Hz
  const hzPoints = melPoints.map(melToHz);

  // Convert to FFT bin indices
  const binPoints = hzPoints.map((hz) =>
    Math.floor(((fftSize + 1) * hz) / sampleRate)
  );

  // Create filterbank
  const filterbank: number[][] = [];
  const numBins = fftSize / 2 + 1;

  for (let i = 0; i < numFilters; i++) {
    const filter = new Array(numBins).fill(0);
    const start = binPoints[i];
    const center = binPoints[i + 1];
    const end = binPoints[i + 2];

    // Rising edge
    for (let j = start; j < center; j++) {
      if (j < numBins) {
        filter[j] = (j - start) / (center - start);
      }
    }

    // Falling edge
    for (let j = center; j < end; j++) {
      if (j < numBins) {
        filter[j] = (end - j) / (end - center);
      }
    }

    filterbank.push(filter);
  }

  return filterbank;
}

/**
 * Apply filterbank to power spectrum
 */
export function applyFilterbank(
  powerSpec: number[],
  filterbank: number[][]
): number[] {
  return filterbank.map((filter) => {
    let sum = 0;
    for (let i = 0; i < Math.min(filter.length, powerSpec.length); i++) {
      sum += filter[i] * powerSpec[i];
    }
    return sum;
  });
}

/**
 * Compute DCT-II (used for MFCC)
 */
export function dct(signal: number[], numCoeffs?: number): number[] {
  const N = signal.length;
  numCoeffs = numCoeffs || N;
  const result = new Array(numCoeffs);

  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += signal[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
    }
    result[k] = sum * Math.sqrt(2 / N);
  }

  // Apply orthonormal scaling to first coefficient
  result[0] *= Math.sqrt(0.5);

  return result;
}

/**
 * Extract MFCCs from a single frame
 */
export function extractMFCCFrame(
  frame: number[],
  sampleRate: number,
  numFilters = 26,
  numCoeffs = 13
): number[] {
  // Apply Hamming window
  const windowed = hammingWindow(frame);

  // Compute power spectrum
  const power = powerSpectrum(windowed);

  // Create and apply Mel filterbank
  const fftSize = (power.length - 1) * 2;
  const filterbank = createMelFilterbank(numFilters, fftSize, sampleRate);
  const melSpec = applyFilterbank(power, filterbank);

  // Apply log compression (with floor to avoid log(0))
  const logMelSpec = melSpec.map((x) => Math.log(Math.max(x, 1e-10)));

  // Apply DCT to get MFCCs
  const mfccs = dct(logMelSpec, numCoeffs);

  return mfccs;
}

/**
 * Extract MFCCs from entire signal
 */
export interface MFCCResult {
  mfccs: number[][];
  frameCount: number;
  frameSize: number;
  hopSize: number;
  numCoeffs: number;
}

export function extractMFCC(
  signal: number[],
  sampleRate: number,
  frameSize = 512,
  hopSize = 256,
  numFilters = 26,
  numCoeffs = 13,
  applyPreEmphasis = true
): MFCCResult {
  // Apply pre-emphasis
  const processed = applyPreEmphasis ? preEmphasis(signal) : signal;

  // Frame the signal
  const frames = frameSignal(processed, frameSize, hopSize);

  // Extract MFCCs for each frame
  const mfccs = frames.map((frame) =>
    extractMFCCFrame(frame, sampleRate, numFilters, numCoeffs)
  );

  return {
    mfccs,
    frameCount: frames.length,
    frameSize,
    hopSize,
    numCoeffs,
  };
}

/**
 * Compute frame energy (for VAD)
 */
export function computeEnergy(frame: number[]): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return sum / frame.length;
}

/**
 * Compute zero-crossing rate (for VAD)
 */
export function computeZCR(frame: number[]): number {
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
}

/**
 * Voice Activity Detection result
 */
export interface VADResult {
  isVoice: boolean[];
  energy: number[];
  zcr: number[];
  segments: { start: number; end: number }[];
}

/**
 * Perform Voice Activity Detection
 */
export function detectVoiceActivity(
  signal: number[],
  sampleRate: number,
  frameSize = 512,
  hopSize = 256,
  energyThreshold?: number,
  zcrThreshold?: number
): VADResult {
  const frames = frameSignal(signal, frameSize, hopSize);

  // Compute energy and ZCR for each frame
  const energy = frames.map(computeEnergy);
  const zcr = frames.map(computeZCR);

  // Auto-threshold if not provided (using first few frames as noise estimate)
  const noiseFrames = Math.min(10, Math.floor(frames.length * 0.1));
  if (energyThreshold === undefined) {
    const noiseEnergy = energy.slice(0, noiseFrames);
    const meanNoise =
      noiseEnergy.reduce((a, b) => a + b, 0) / noiseEnergy.length;
    energyThreshold = meanNoise * 10; // 10x noise floor
  }
  if (zcrThreshold === undefined) {
    zcrThreshold = 0.3; // Default ZCR threshold
  }

  // Detect voice frames
  const isVoice = energy.map(
    (e, i) => e > energyThreshold! && zcr[i] < zcrThreshold!
  );

  // Smooth: require N consecutive frames
  const minConsecutive = 3;
  for (let i = 0; i < isVoice.length; i++) {
    if (isVoice[i]) {
      let count = 0;
      for (let j = i; j < Math.min(i + minConsecutive, isVoice.length); j++) {
        if (isVoice[j]) count++;
      }
      if (count < minConsecutive) {
        isVoice[i] = false;
      }
    }
  }

  // Extract segments
  const segments: { start: number; end: number }[] = [];
  let segmentStart: number | null = null;

  for (let i = 0; i < isVoice.length; i++) {
    if (isVoice[i] && segmentStart === null) {
      segmentStart = i;
    } else if (!isVoice[i] && segmentStart !== null) {
      const startTime = (segmentStart * hopSize) / sampleRate;
      const endTime = (i * hopSize) / sampleRate;
      segments.push({ start: startTime, end: endTime });
      segmentStart = null;
    }
  }

  // Handle segment at end
  if (segmentStart !== null) {
    const startTime = (segmentStart * hopSize) / sampleRate;
    const endTime = (isVoice.length * hopSize) / sampleRate;
    segments.push({ start: startTime, end: endTime });
  }

  return {
    isVoice,
    energy,
    zcr,
    segments,
  };
}
