import type { SettingsMessage } from "./types";

// HTMLMediaElement.volume は 0〜1 の範囲外や NaN で例外を投げる。
// settings.json は手編集され得るため、受け取った値は必ずここで丸める。
export function clampVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function isSettingsMessage(value: unknown): value is SettingsMessage {
  return typeof value === "object" && value !== null && "type" in value && value.type === "settings"
    && "volume" in value && typeof value.volume === "number";
}
