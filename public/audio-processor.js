/**
 * AudioWorklet processor for capturing audio samples
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096;
    this._buffer = new Float32Array(this._bufferSize);
    this._bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputChannel = input[0];

    // Accumulate samples into buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this._buffer[this._bufferIndex++] = inputChannel[i];

      // When buffer is full, send it to main thread
      if (this._bufferIndex >= this._bufferSize) {
        this.port.postMessage({
          type: "audio",
          buffer: this._buffer.slice(),
        });
        this._bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
