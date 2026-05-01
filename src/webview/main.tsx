import { render } from "preact";
import { BridgeContext } from "./BridgeContext";
import { App } from "./App";
import type { PlatformBridge } from "./types";

export type { PlatformBridge };

export function init(bridge: PlatformBridge): void {
  (["log", "warn", "error"] as const).forEach(level => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      bridge.postMessage({ type: "log", level, args: args.map(String) });
    };
  });

  render(
    <BridgeContext.Provider value={bridge}>
      <App />
    </BridgeContext.Provider>,
    document.getElementById("app-root")!
  );
}
