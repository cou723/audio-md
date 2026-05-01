import { formatTime } from "./utils";

interface Props {
  playState: "playing" | "paused" | "ended";
  currentTime: number;
  duration: number;
  fileName: string;
  onPlay: () => void;
  onVolumeChange: (vol: number) => void;
}

export function Toolbar({ playState, currentTime, duration, fileName, onPlay, onVolumeChange }: Props) {
  return (
    <div id="toolbar">
      <button id="play-btn" onClick={onPlay}>
        {playState === "playing" ? "⏸" : "▶"}
      </button>
      <span id="time-display">
        {formatTime(Math.floor(currentTime))} / {formatTime(Math.floor(duration))}
      </span>
      <span id="volume-control">
        <span id="volume-icon">&#x1F50A;</span>
        <input
          type="range"
          id="volume-slider"
          min="0"
          max="1"
          step="0.01"
          defaultValue="1"
          onInput={(e) => onVolumeChange(parseFloat((e.target as HTMLInputElement).value))}
        />
      </span>
      <span id="file-label">{fileName}</span>
    </div>
  );
}
