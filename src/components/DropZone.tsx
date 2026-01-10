import { useState, useRef } from "react";
import type { DragEvent, ChangeEvent } from "react";

interface DropZoneProps {
  onFileDrop: (file: File) => void;
  isLoading: boolean;
  error: string | null;
}

export function DropZone({ onFileDrop, isLoading, error }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && isAudioFile(file)) {
      onFileDrop(file);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isAudioFile(file)) {
      onFileDrop(file);
    }
    // Reset input so same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      style={{
        border: `2px dashed ${
          isDragOver ? "#3b82f6" : "rgba(255, 255, 255, 0.2)"
        }`,
        borderRadius: "8px",
        padding: "32px",
        textAlign: "center",
        cursor: isLoading ? "wait" : "pointer",
        backgroundColor: isDragOver ? "rgba(59, 130, 246, 0.1)" : "transparent",
        transition: "all 0.15s ease",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.webm"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      {isLoading ? (
        <div>
          <div style={{ marginBottom: "8px", fontSize: "24px" }}>⏳</div>
          <div style={{ color: "rgba(255, 255, 255, 0.7)" }}>
            Decoding audio...
          </div>
        </div>
      ) : error ? (
        <div>
          <div style={{ marginBottom: "8px", fontSize: "24px" }}>❌</div>
          <div style={{ color: "#ef4444", marginBottom: "8px" }}>{error}</div>
          <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: "12px" }}>
            Click or drop another file to try again
          </div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: "8px", fontSize: "24px" }}>📁</div>
          <div
            style={{ color: "rgba(255, 255, 255, 0.7)", marginBottom: "4px" }}
          >
            Drop audio file here or click to browse
          </div>
          <div style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: "12px" }}>
            WAV, MP3, OGG, FLAC, M4A, AAC, WebM
          </div>
        </div>
      )}
    </div>
  );
}

function isAudioFile(file: File): boolean {
  const audioTypes = [
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mp3",
    "audio/mpeg",
    "audio/ogg",
    "audio/flac",
    "audio/x-flac",
    "audio/mp4",
    "audio/x-m4a",
    "audio/aac",
    "audio/webm",
  ];

  const audioExtensions = [
    ".wav",
    ".mp3",
    ".ogg",
    ".flac",
    ".m4a",
    ".aac",
    ".webm",
  ];

  return (
    audioTypes.includes(file.type) ||
    audioExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
  );
}
