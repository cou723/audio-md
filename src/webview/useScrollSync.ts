import { useRef, useEffect } from "preact/hooks";
import type { RefObject } from "preact";
import { syncScroll } from "./utils";

export function useScrollSync(
  leftRef: RefObject<HTMLDivElement>,
  rightRef: RefObject<HTMLDivElement>
): void {
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    const onLeftScroll = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      syncScroll(left, right);
      isSyncingRef.current = false;
    };
    const onRightScroll = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      syncScroll(right, left);
      isSyncingRef.current = false;
    };

    left.addEventListener("scroll", onLeftScroll);
    right.addEventListener("scroll", onRightScroll);
    return () => {
      left.removeEventListener("scroll", onLeftScroll);
      right.removeEventListener("scroll", onRightScroll);
    };
  }, []);
}
