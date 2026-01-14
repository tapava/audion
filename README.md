# Audion

Browser-based audio analysis. Record from your mic or drop in a file. See the waveform, spectrogram, MFCCs, pitch, formants. Export to JSON/CSV. Everything runs locally — no uploads, no backend.

**[Try the demo →](https://audion-demo.vercel.app)**

## What's it for?

- Inspecting recordings visually
- Extracting MFCCs, pitch, formants for ML pipelines
- Finding speech segments in longer files
- Quick phonetic analysis without installing anything

Not for: music production, audio editing, transcription, or live processing.

## Features

**Input:** Record via mic or import WAV/MP3/OGG/FLAC/M4A/AAC/WebM

**Live view:** Waveform + spectrogram while recording

**Analysis:**

- MFCCs (13 coefficients)
- Pitch (F0) via autocorrelation
- Formants (F1-F4) via LPC
- Voice activity detection with segment boundaries

**Export:** JSON with full structure, CSV for spreadsheets, WAV clips for segments

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173. Record something or drop a file. Switch to Analysis tab.

## Export formats

**JSON:**

```json
{
  "metadata": { "sampleRate": 48000, "duration": 3.2 },
  "mfcc": { "coefficients": [[...]] },
  "vad": { "segments": [{"start": 0.4, "end": 2.1}] }
}
```

**CSV:**

```
frame,c0,c1,c2,...,c12
0,12.34,-5.67,2.34,...
```

## How it works

Processing runs in web workers so the UI stays responsive.

- **MFCCs:** pre-emphasis → framing → Hamming → FFT → mel filterbank → log → DCT
- **Pitch:** autocorrelation + parabolic interpolation + median filter
- **Formants:** LPC → spectral envelope → peak picking
- **VAD:** energy + zero-crossing rate with auto threshold

## Stack

React + Vite, Web Audio API with AudioWorklet, ComputeKit for workers

## Limits

- No noise reduction
- Large files can be slow (it's JS)
- Stereo gets mixed to mono
- VAD threshold is automatic, not adjustable

## Deploy

```bash
npm run build
```

Static output in `dist/`. Works on Vercel, Netlify, or any static host.

## License

MIT
