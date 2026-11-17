import { formatTimestamp } from "./utils";

export type PlayerCommand = "seekBackward" | "seekForward" | "togglePlayback" | "insertCurrentTimestamp";

export interface PlayerCommandMessage {
  type: "playerCommand";
  command: PlayerCommand;
}

export function isPlayerCommandMessage(value: unknown): value is PlayerCommandMessage {
  if (typeof value !== "object" || value === null || !("type" in value) || value.type !== "playerCommand") return false;
  return "command" in value && (
    value.command === "seekBackward" || value.command === "seekForward" ||
    value.command === "togglePlayback" || value.command === "insertCurrentTimestamp"
  );
}

export function executePlayerCommand(
  command: PlayerCommand,
  audio: Pick<HTMLAudioElement, "currentTime" | "duration"> | null,
  controls: {
    seek: (time: number) => void;
    togglePlay: () => void;
    insertTimestamp: (text: string) => void;
  }
): void {
  // 読み込み前・失敗時に、不正なシークや架空の時刻の挿入をしない。
  if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0 || !Number.isFinite(audio.currentTime)) return;
  switch (command) {
    case "seekBackward":
      controls.seek(Math.max(0, audio.currentTime - 5));
      break;
    case "seekForward":
      controls.seek(Math.min(audio.duration, audio.currentTime + 5));
      break;
    case "togglePlayback":
      controls.togglePlay();
      break;
    case "insertCurrentTimestamp":
      controls.insertTimestamp(formatTimestamp(audio.currentTime));
      break;
  }
}
