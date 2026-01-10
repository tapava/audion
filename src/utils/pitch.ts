/**
 * Pitch (F0) detection using autocorrelation method
 * Returns fundamental frequency in Hz for each frame
 */

export interface PitchResult {
  f0: number[]; // F0 in Hz for each frame (0 = unvoiced)
  confidence: number[]; // Confidence score 0-1
  frameCount: number;
  hopSize: number;
  minF0: number;
  maxF0: number;
}

/**
 * Extract pitch using autocorrelation
 */
export function extractPitch(
  signal: Float32Array | number[],
  sampleRate: number,
  minF0 = 75,
  maxF0 = 500
): PitchResult {
  const frameSize = 2048;
  const hopSize = 512;

  const minLag = Math.floor(sampleRate / maxF0);
  const maxLag = Math.floor(sampleRate / minF0);

  const frames: number[][] = [];
  for (let i = 0; i + frameSize <= signal.length; i += hopSize) {
    const frame: number[] = [];
    for (let j = 0; j < frameSize; j++) {
      frame.push(signal[i + j]);
    }
    frames.push(frame);
  }

  const f0: number[] = [];
  const confidence: number[] = [];

  for (const frame of frames) {
    // Apply Hamming window
    const windowed = frame.map((x, i) => {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
      return x * w;
    });

    // Compute autocorrelation
    const r = autocorrelation(windowed, maxLag);

    // Find peak in valid lag range
    let maxR = 0;
    let bestLag = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      if (r[lag] > maxR) {
        maxR = r[lag];
        bestLag = lag;
      }
    }

    // Normalize by r[0] (energy)
    const r0 = r[0];
    const normalizedPeak = r0 > 0 ? maxR / r0 : 0;

    // Threshold for voiced detection
    if (normalizedPeak > 0.3 && bestLag > 0) {
      // Parabolic interpolation for better accuracy
      const refinedLag = parabolicInterpolation(r, bestLag);
      f0.push(sampleRate / refinedLag);
      confidence.push(normalizedPeak);
    } else {
      f0.push(0);
      confidence.push(0);
    }
  }

  // Median filter to remove outliers
  const smoothedF0 = medianFilter(f0, 3);

  return {
    f0: smoothedF0,
    confidence,
    frameCount: frames.length,
    hopSize,
    minF0,
    maxF0,
  };
}

function autocorrelation(signal: number[], maxLag: number): number[] {
  const r: number[] = [];
  const n = signal.length;

  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) {
      sum += signal[i] * signal[i + lag];
    }
    r.push(sum);
  }

  return r;
}

function parabolicInterpolation(r: number[], peakIndex: number): number {
  if (peakIndex <= 0 || peakIndex >= r.length - 1) {
    return peakIndex;
  }

  const y0 = r[peakIndex - 1];
  const y1 = r[peakIndex];
  const y2 = r[peakIndex + 1];

  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));

  if (isFinite(d) && Math.abs(d) < 1) {
    return peakIndex + d;
  }
  return peakIndex;
}

function medianFilter(arr: number[], windowSize: number): number[] {
  const result: number[] = [];
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(arr.length, i + halfWindow + 1);
    const window = arr.slice(start, end).filter((x) => x > 0);

    if (window.length === 0) {
      result.push(0);
    } else {
      window.sort((a, b) => a - b);
      result.push(window[Math.floor(window.length / 2)]);
    }
  }

  return result;
}

/**
 * Get formants using LPC analysis
 * Returns F1, F2, F3 for each frame
 */
export interface FormantResult {
  formants: number[][]; // [frame][F1, F2, F3, F4]
  bandwidths: number[][];
  frameCount: number;
}

export function extractFormants(
  signal: Float32Array | number[],
  sampleRate: number,
  numFormants = 4
): FormantResult {
  const frameSize = 1024;
  const hopSize = 256;
  const lpcOrder = 2 * numFormants + 2;

  const frames: number[][] = [];
  for (let i = 0; i + frameSize <= signal.length; i += hopSize) {
    const frame: number[] = [];
    for (let j = 0; j < frameSize; j++) {
      frame.push(signal[i + j]);
    }
    frames.push(frame);
  }

  const formants: number[][] = [];
  const bandwidths: number[][] = [];

  for (const frame of frames) {
    // Pre-emphasis
    const preemph: number[] = [frame[0]];
    for (let i = 1; i < frame.length; i++) {
      preemph.push(frame[i] - 0.97 * frame[i - 1]);
    }

    // Apply Hamming window
    const windowed = preemph.map((x, i) => {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
      return x * w;
    });

    // LPC analysis using Levinson-Durbin
    const lpc = levinsonDurbin(windowed, lpcOrder);

    // Find roots of LPC polynomial
    const roots = findLPCRoots(lpc);

    // Convert roots to formant frequencies and bandwidths
    const frameFormants: { freq: number; bw: number }[] = [];

    for (const root of roots) {
      if (root.imag >= 0) {
        const freq =
          Math.atan2(root.imag, root.real) * (sampleRate / (2 * Math.PI));
        const r = Math.sqrt(root.real * root.real + root.imag * root.imag);
        const bw = -Math.log(r) * (sampleRate / Math.PI);

        // Filter valid formants (positive freq, reasonable bandwidth)
        if (freq > 90 && freq < sampleRate / 2 && bw < 400) {
          frameFormants.push({ freq, bw });
        }
      }
    }

    // Sort by frequency and take first numFormants
    frameFormants.sort((a, b) => a.freq - b.freq);

    const f: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < numFormants; i++) {
      if (i < frameFormants.length) {
        f.push(frameFormants[i].freq);
        b.push(frameFormants[i].bw);
      } else {
        f.push(0);
        b.push(0);
      }
    }

    formants.push(f);
    bandwidths.push(b);
  }

  return { formants, bandwidths, frameCount: frames.length };
}

function levinsonDurbin(signal: number[], order: number): number[] {
  // Compute autocorrelation
  const r: number[] = [];
  for (let k = 0; k <= order; k++) {
    let sum = 0;
    for (let i = 0; i < signal.length - k; i++) {
      sum += signal[i] * signal[i + k];
    }
    r.push(sum);
  }

  // Levinson-Durbin recursion
  const a: number[] = new Array(order + 1).fill(0);
  const aPrev: number[] = new Array(order + 1).fill(0);

  let e = r[0];

  for (let i = 1; i <= order; i++) {
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

    for (let j = 0; j <= order; j++) {
      aPrev[j] = a[j];
    }
  }

  return a;
}

interface Complex {
  real: number;
  imag: number;
}

function findLPCRoots(lpc: number[]): Complex[] {
  // Simple root finding using companion matrix eigenvalues
  // For efficiency, we use a simplified approach
  const n = lpc.length - 1;

  // Use Durand-Kerner method for polynomial roots
  // Initialize roots on unit circle
  const z: Complex[] = [];
  for (let k = 0; k < n; k++) {
    const angle = (2 * Math.PI * k) / n + 0.1;
    z.push({
      real: 0.9 * Math.cos(angle),
      imag: 0.9 * Math.sin(angle),
    });
  }

  // Coefficients (reverse order for polynomial)
  const coeffs = lpc.slice(1).map((x) => -x);
  coeffs.unshift(1);

  // Iterate
  for (let iter = 0; iter < 50; iter++) {
    for (let i = 0; i < n; i++) {
      // Evaluate polynomial at z[i]
      let pReal = coeffs[0];
      let pImag = 0;
      let zPowReal = 1;
      let zPowImag = 0;

      for (let j = 1; j <= n; j++) {
        const nextReal = zPowReal * z[i].real - zPowImag * z[i].imag;
        const nextImag = zPowReal * z[i].imag + zPowImag * z[i].real;
        zPowReal = nextReal;
        zPowImag = nextImag;

        if (j < coeffs.length) {
          pReal += coeffs[j] * zPowReal;
          pImag += coeffs[j] * zPowImag;
        }
      }

      // Compute product of (z[i] - z[j]) for j != i
      let prodReal = 1;
      let prodImag = 0;

      for (let j = 0; j < n; j++) {
        if (j !== i) {
          const diffReal = z[i].real - z[j].real;
          const diffImag = z[i].imag - z[j].imag;
          const newReal = prodReal * diffReal - prodImag * diffImag;
          const newImag = prodReal * diffImag + prodImag * diffReal;
          prodReal = newReal;
          prodImag = newImag;
        }
      }

      // Update z[i]
      const denom = prodReal * prodReal + prodImag * prodImag;
      if (denom > 1e-10) {
        const divReal = (pReal * prodReal + pImag * prodImag) / denom;
        const divImag = (pImag * prodReal - pReal * prodImag) / denom;
        z[i].real -= divReal;
        z[i].imag -= divImag;
      }
    }
  }

  return z;
}
