import { useCallback, useRef, useState, useEffect } from "react";

interface UseAudioPlayerResult {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setAudioBuffer: (buffer: AudioBuffer | null) => void;
}

export function useAudioPlayer(): UseAudioPlayerResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const offsetRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);

  const updateTime = useCallback(() => {
    if (!audioContextRef.current || !isPlaying) return;

    const elapsed =
      audioContextRef.current.currentTime -
      startTimeRef.current +
      offsetRef.current;
    const clampedTime = Math.min(elapsed, duration);
    setCurrentTime(clampedTime);

    if (clampedTime >= duration) {
      setIsPlaying(false);
      setCurrentTime(0);
      offsetRef.current = 0;
      return;
    }

    animationRef.current = requestAnimationFrame(updateTime);
  }, [isPlaying, duration]);

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, updateTime]);

  const setAudioBuffer = useCallback((buffer: AudioBuffer | null) => {
    // Stop current playback
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {}
      sourceRef.current = null;
    }

    bufferRef.current = buffer;
    setDuration(buffer?.duration || 0);
    setCurrentTime(0);
    setIsPlaying(false);
    offsetRef.current = 0;
  }, []);

  const play = useCallback(() => {
    if (!bufferRef.current) return;

    // Create context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    // Resume context if suspended
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    // Stop any existing source
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {}
    }

    // Create new source
    const source = ctx.createBufferSource();
    source.buffer = bufferRef.current;
    source.connect(ctx.destination);

    const startOffset = offsetRef.current;
    source.onended = () => {
      // Only reset if this source wasn't replaced and we reached the end
      if (
        sourceRef.current === source &&
        startOffset + (ctx.currentTime - startTimeRef.current) >= duration - 0.1
      ) {
        setIsPlaying(false);
        setCurrentTime(0);
        offsetRef.current = 0;
      }
    };

    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime;
    source.start(0, offsetRef.current);
    setIsPlaying(true);
  }, [duration]);

  const pause = useCallback(() => {
    if (!audioContextRef.current || !sourceRef.current) return;

    // Calculate elapsed time since playback started
    const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
    offsetRef.current = offsetRef.current + elapsed;

    try {
      sourceRef.current.stop();
    } catch {}
    sourceRef.current = null;
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {}
      sourceRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    offsetRef.current = 0;
  }, []);

  const seek = useCallback(
    (time: number) => {
      const clampedTime = Math.max(0, Math.min(time, duration));

      // Stop current playback
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {}
        sourceRef.current = null;
      }

      // Update offset and current time
      offsetRef.current = clampedTime;
      setCurrentTime(clampedTime);

      // If was playing, restart from new position
      if (isPlaying) {
        if (!bufferRef.current || !audioContextRef.current) return;

        const ctx = audioContextRef.current;
        if (ctx.state === "suspended") {
          ctx.resume();
        }

        const source = ctx.createBufferSource();
        source.buffer = bufferRef.current;
        source.connect(ctx.destination);

        source.onended = () => {
          // Only reset if we've actually reached the end
          if (offsetRef.current >= duration - 0.1) {
            setIsPlaying(false);
            setCurrentTime(0);
            offsetRef.current = 0;
          }
        };

        sourceRef.current = source;
        startTimeRef.current = ctx.currentTime;
        source.start(0, clampedTime);
      }
    },
    [isPlaying, duration]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {}
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    stop,
    seek,
    setAudioBuffer,
  };
}
