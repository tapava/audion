import { PlayIcon, PauseIcon, StopIcon } from "./Icons.tsx";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPause,
  onStop,
}: PlaybackControlsProps) {
  const buttonStyle: React.CSSProperties = {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "white",
    transition: "background-color 0.15s ease",
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    width: "48px",
    height: "48px",
    backgroundColor: "#3b82f6",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 0",
      }}
    >
      <button
        onClick={onStop}
        style={buttonStyle}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)")
        }
        title="Stop"
      >
        <StopIcon size={16} />
      </button>

      <button
        onClick={isPlaying ? onPause : onPlay}
        style={primaryButtonStyle}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "#2563eb")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "#3b82f6")
        }
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
      </button>

      <div
        style={{
          marginLeft: "12px",
          fontFamily: "monospace",
          fontSize: "14px",
        }}
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
