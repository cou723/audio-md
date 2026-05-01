export const PX_PER_SEC = 80;

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function syncScroll(source: Element, target: Element): void {
  const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight);
  target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
}

export function scrollToPlayhead(panel: HTMLDivElement, timeSec: number): void {
  const py = timeSec * PX_PER_SEC;
  const viewportCenter = panel.scrollTop + panel.clientHeight / 2;
  if (Math.abs(py - viewportCenter) > panel.clientHeight * 0.3) {
    panel.scrollTop = py - panel.clientHeight / 2;
  }
}
