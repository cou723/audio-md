import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { PlatformBridge } from "./types";

export const BridgeContext = createContext<PlatformBridge | null>(null);

export function useBridge(): PlatformBridge {
  const bridge = useContext(BridgeContext);
  if (!bridge) throw new Error("BridgeContext not provided");
  return bridge;
}
