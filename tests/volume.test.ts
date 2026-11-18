import { describe, expect, it } from "vitest";
import { clampVolume, isSettingsMessage } from "../src/webview/volume";

describe("clampVolume", () => {
  it.each([[0.5, 0.5], [-1, 0], [3, 1], [Number.NaN, 1], ["0.5", 1], [undefined, 1]])("%s -> %s", (input, expected) => {
    expect(clampVolume(input)).toBe(expected);
  });
});

describe("isSettingsMessage", () => {
  it("accepts a settings message with a numeric volume", () => {
    expect(isSettingsMessage({ type: "settings", volume: 0.3 })).toBe(true);
  });
  it.each([null, {}, { type: "init" }, { type: "settings" }, { type: "settings", volume: "1" }])("rejects %j", value => {
    expect(isSettingsMessage(value)).toBe(false);
  });
});
