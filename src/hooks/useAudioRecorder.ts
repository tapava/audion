import { useState, useRef, useCallback, useEffect } from "react";

interface AudioState {
  isRecording: boolean;
  isReady: boolean;
  error: string | null;
  sampleRate: number;
  duration: number;
}

interface UseAudioRecorderResult {
  state: AudioState;
  audioData: Float32Array | null;
  frequencyData: Uint8Array | null;
  timeData: Uint8Array | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  analyserNode: AnalyserNode | null;
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [state, setState] = useState<AudioState>({
    isRecording: false,
    isReady: false,
    error: null,
    sampleRate: 0,
    duration: 0,
  });

  const [audioData, setAudioData] = useState<Float32Array | null>(null);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);
  const [timeData, setTimeData] = useState<Uint8Array | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);

  const updateAnalysis = useCallback(() => {
    if (!analyserRef.current || !isRecordingRef.current) return;

    const analyser = analyserRef.current;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeDomainData = new Uint8Array(analyser.fftSize);

    analyser.getByteFrequencyData(freqData);
    analyser.getByteTimeDomainData(timeDomainData);

    setFrequencyData(new Uint8Array(freqData));
    setTimeData(new Uint8Array(timeDomainData));

    // Update duration
    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    setState((prev) => ({ ...prev, duration: elapsed }));

    animationFrameRef.current = requestAnimationFrame(updateAnalysis);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Reset state
      chunksRef.current = [];
      setState((prev) => ({ ...prev, error: null, isRecording: false }));

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Create analyser node for visualization
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // Load the AudioWorklet module
      try {
        await audioContext.audioWorklet.addModule("/audio-processor.js");
        console.log("AudioWorklet loaded successfully");
      } catch (workletError) {
        console.error("Failed to load AudioWorklet:", workletError);
        throw workletError;
      }

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create AudioWorkletNode for capturing audio data
      const workletNode = new AudioWorkletNode(
        audioContext,
        "audio-capture-processor"
      );
      workletNodeRef.current = workletNode;
      console.log("AudioWorkletNode created");

      // Handle messages from the worklet
      workletNode.port.onmessage = (event) => {
        if (event.data.type === "audio") {
          chunksRef.current.push(new Float32Array(event.data.buffer));
          console.log(
            "Audio chunk received, total chunks:",
            chunksRef.current.length
          );
        }
      };

      // Connect nodes: source -> analyser (for visualization)
      //                source -> worklet (for capture)
      source.connect(analyser);
      source.connect(workletNode);

      startTimeRef.current = performance.now();
      isRecordingRef.current = true;

      setState({
        isRecording: true,
        isReady: true,
        error: null,
        sampleRate: audioContext.sampleRate,
        duration: 0,
      });

      // Start analysis loop
      animationFrameRef.current = requestAnimationFrame(updateAnalysis);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to access microphone";
      setState((prev) => ({
        ...prev,
        error: message,
        isRecording: false,
      }));
    }
  }, [updateAnalysis]);

  const stopRecording = useCallback(() => {
    // Stop the recording flag first
    isRecordingRef.current = false;

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Disconnect and clean up worklet node
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current.port.close();
      workletNodeRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Stop media stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Merge all chunks into single buffer
    const totalLength = chunksRef.current.reduce(
      (acc, chunk) => acc + chunk.length,
      0
    );
    console.log(
      "Merging audio: ",
      chunksRef.current.length,
      "chunks, total length:",
      totalLength
    );

    const mergedData = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      mergedData.set(chunk, offset);
      offset += chunk.length;
    }

    console.log("Setting audioData, length:", mergedData.length);
    setAudioData(mergedData);
    analyserRef.current = null;

    setState((prev) => ({
      ...prev,
      isRecording: false,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current.port.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    state,
    audioData,
    frequencyData,
    timeData,
    startRecording,
    stopRecording,
    analyserNode: analyserRef.current,
  };
}
