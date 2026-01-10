import { useCallback, useRef, useState } from "react";

export interface AudioFile {
  name: string;
  type: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  audioBuffer: AudioBuffer;
  samples: Float32Array;
}

interface UseFileImportResult {
  file: AudioFile | null;
  isLoading: boolean;
  error: string | null;
  importFile: (file: File) => Promise<void>;
  clear: () => void;
}

const SUPPORTED_TYPES = [
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/flac",
  "audio/webm",
  "audio/aac",
  "audio/m4a",
  "audio/x-m4a",
];

const SUPPORTED_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".ogg",
  ".flac",
  ".webm",
  ".aac",
  ".m4a",
];

export function useFileImport(): UseFileImportResult {
  const [file, setFile] = useState<AudioFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const importFile = useCallback(async (inputFile: File) => {
    // Validate file type
    const extension = inputFile.name
      .toLowerCase()
      .slice(inputFile.name.lastIndexOf("."));
    const isValidType =
      SUPPORTED_TYPES.includes(inputFile.type) ||
      SUPPORTED_EXTENSIONS.includes(extension);

    if (!isValidType) {
      setError(
        `Unsupported file type. Use: ${SUPPORTED_EXTENSIONS.join(", ")}`
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      // Read file as array buffer
      const arrayBuffer = await inputFile.arrayBuffer();

      // Decode audio data
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Get mono samples (mix down if stereo)
      let samples: Float32Array;
      if (audioBuffer.numberOfChannels === 1) {
        samples = audioBuffer.getChannelData(0);
      } else {
        // Mix to mono
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        samples = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
          samples[i] = (left[i] + right[i]) / 2;
        }
      }

      setFile({
        name: inputFile.name,
        type: inputFile.type || extension,
        size: inputFile.size,
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        audioBuffer,
        samples: new Float32Array(samples), // Copy to avoid detached buffer issues
      });
    } catch (err) {
      console.error("File import error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to decode audio file"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setFile(null);
    setError(null);
  }, []);

  return {
    file,
    isLoading,
    error,
    importFile,
    clear,
  };
}
