# Audion

Record audio in your browser, or drop in an existing file. See what's happening, extract features, export data. No backend, no uploads, everything runs locally.

## Who is this for?

**Audion is for:**

- **Speech researchers** — quick visual inspection of recordings, extract acoustic features without installing software
- **ML engineers** — grab MFCCs, pitch, formants as JSON/CSV for training data pipelines
- **Phoneticians and linguists** — analyze formants (F1-F4), pitch contours, segment speech
- **Students learning DSP** — see how audio features work, experiment with real recordings
- **Audio developers** — debug your processing pipeline, validate feature extraction
- **Podcasters/journalists** — find speech segments in long recordings, export clips

**Audion is NOT for:**

- **Music production** — no DAW features, no effects, no mixing, no MIDI
- **Audio editing** — you can't cut, splice, or modify audio (only export segments)
- **Real-time processing** — analysis happens after recording/import, not live
- **Production transcription** — there's no speech-to-text, just feature extraction
- **Noise reduction or cleanup** — no denoising, no filtering, no restoration
- **Professional acoustic measurement** — it's a browser tool, not calibrated lab equipment

**The sweet spot:** You have audio, you want to see what's in it, maybe extract features for ML or research. No installs, no uploads, runs in a tab.

## What it does

**Two input modes:**

1. **Record** - capture from your microphone
2. **Import** - drop in any audio file (WAV, MP3, OGG, FLAC, M4A, AAC, WebM)

**While recording:**

- Live waveform (time domain)
- Live spectrogram (frequency over time)

**With imported files:**

- Interactive waveform with playback controls
- Click anywhere to seek
- Play/pause/stop

**After you stop (or import):**

- MFCC extraction (13 coefficients, standard speech features)
- Pitch tracking (F0) using autocorrelation
- Formant analysis (F1-F4) via LPC
- Voice activity detection (finds speech vs silence)
- Segment boundaries with timestamps
- Click any visualization to seek (for imported files)
- Click segments to select, then export as individual WAV files
- Export everything to JSON or CSV

## Quick start

```bash
npm install
npm run dev
```

Go to http://localhost:5173

Click record, talk, stop. Or switch to Import mode and drop a file. Switch to Analysis tab. Export if you need the data.

## The export formats

**JSON** gives you everything structured:

```json
{
  "metadata": { "sampleRate": 48000, "duration": 3.2, ... },
  "mfcc": { "coefficients": [[...], [...], ...] },
  "vad": { "segments": [{"start": 0.4, "end": 2.1}, ...] }
}
```

**CSV** is for throwing into spreadsheets/pandas:

```
frame,c0,c1,c2,...,c12
0,12.34,-5.67,2.34,...
1,11.98,-5.12,2.56,...
```

Plus a segments table at the bottom with start/end times.

## How it works

All the heavy lifting (FFT, filterbanks, DCT, pitch detection, LPC) runs in web workers so the UI doesn't freeze. The audio capture uses AudioWorklet which runs on a separate thread.

**MFCC pipeline:**

```
signal → pre-emphasis → frame → hamming window → FFT → mel filterbank → log → DCT → MFCCs
```

**Pitch detection:** Autocorrelation with parabolic interpolation and median filtering.

**Formant extraction:** LPC coefficients → spectral envelope → peak picking.

**VAD:** Energy + zero crossing rate with automatic threshold estimation.

## Tech

- React + Vite (just for the UI)
- Web Audio API with AudioWorklet (recording)
- ComputeKit (offloads processing to workers)

## Limitations

- No fancy noise reduction
- VAD threshold is automatic but not tunable in the UI
- Large recordings might be slow (it's JS, not C++)
- Stereo files get mixed to mono for analysis

## Building

```bash
npm run build
```

Output goes to `dist/`. It's a static site, host it anywhere.

## License

MIT
