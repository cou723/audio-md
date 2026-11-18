export const PX_PER_SEC = 80;
// スペクトログラム1チャンネル分の幅。ステレオでは L・R を横に並べる。
export const SPECTRUM_WIDTH = 160;

/**
 * チャンネル ch の周波数列 x（0=低域）を、Canvas 上の横位置に変換する。
 * ステレオでは L（ch0）を左右反転し、低域が中央（L/R の境界）側に寄るようにする。
 * モノラルは反転しない。
 */
export function spectrumX(ch: number, x: number, channelCount: 1 | 2): number {
  const mirrored = channelCount === 2 && ch === 0;
  return ch * SPECTRUM_WIDTH + (mirrored ? SPECTRUM_WIDTH - 1 - x : x);
}

/** 表示するチャンネル数。3ch 以上でも先頭の L・R だけを表示する。 */
export function displayChannelCount(numberOfChannels: number): 1 | 2 {
  return numberOfChannels >= 2 ? 2 : 1;
}

export function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatTimestamp(time: number): string {
  const sec = Math.floor(time);
  return `[${formatTime(sec)}](#t=${sec}) `;
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
