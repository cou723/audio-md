import { describe, expect, it, vi } from "vitest";
import { executePlayerCommand, isPlayerCommandMessage, type PlayerCommand } from "../src/webview/playerCommands";

function controls() {
  return { seek: vi.fn(), togglePlay: vi.fn(), insertTimestamp: vi.fn() };
}

describe("player commands", () => {
  it.each([
    ["seekBackward", 20, 15],
    ["seekForward", 20, 25],
    ["seekBackward", 2, 0],
    ["seekForward", 98, 100],
    ["seekBackward", 0, 0],
    ["seekForward", 100, 100],
  ] as const)("%s at %s seeks to %s", (command, currentTime, target) => {
    const handlers = controls();
    executePlayerCommand(command, { currentTime, duration: 100 }, handlers);
    expect(handlers.seek).toHaveBeenCalledExactlyOnceWith(target);
    expect(handlers.togglePlay).not.toHaveBeenCalled();
  });

  it("toggles playback without seeking", () => {
    const handlers = controls();
    executePlayerCommand("togglePlayback", { currentTime: 20, duration: 100 }, handlers);
    expect(handlers.togglePlay).toHaveBeenCalledOnce();
    expect(handlers.seek).not.toHaveBeenCalled();
  });

  it.each([
    [0, "[0:00](#t=0) "],
    [65.9, "[1:05](#t=65) "],
    [3661.9, "[1:01:01](#t=3661) "],
  ])("inserts the audio element's current time %s", (currentTime, text) => {
    const handlers = controls();
    executePlayerCommand("insertCurrentTimestamp", { currentTime, duration: 4000 }, handlers);
    expect(handlers.insertTimestamp).toHaveBeenCalledExactlyOnceWith(text);
    expect(handlers.seek).not.toHaveBeenCalled();
  });

  const commands: PlayerCommand[] = ["seekBackward", "seekForward", "togglePlayback", "insertCurrentTimestamp"];
  it.each(commands)("%s ignores unloaded or invalid audio", command => {
    const handlers = controls();
    for (const audio of [null, { currentTime: 0, duration: NaN }, { currentTime: 0, duration: 0 },
      { currentTime: 0, duration: Infinity }, { currentTime: NaN, duration: 100 }]) {
      executePlayerCommand(command, audio, handlers);
    }
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled();
  });

  it.each(commands)("accepts the %s message", command => {
    expect(isPlayerCommandMessage({ type: "playerCommand", command })).toBe(true);
  });

  it.each([null, undefined, 5, "seekForward", {}, { type: "init" },
    { type: "playerCommand" }, { type: "playerCommand", command: "delete" }])("rejects invalid input %j", value => {
    expect(isPlayerCommandMessage(value)).toBe(false);
  });
});
