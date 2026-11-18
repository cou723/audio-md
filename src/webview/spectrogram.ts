// スペクトログラム計算。DOM に依存しない純粋関数だけを置く（テスト可能にするため）。

export const FFT_SIZE = 2048;
export const FREQ_MIN_HZ = 50;
// 声や環境音の確認が主用途のため、上限は 12kHz 程度に抑える。
// 12kHz 以上は低域より情報が少なく、対数軸の幅を無駄に消費する。
export const FREQ_MAX_HZ = 12000;
// これより小さい成分は無音として扱う。話し声の各周波数ビンは概ね -90〜-30 dBFS に収まる。
export const DB_FLOOR = -90;
export const DB_CEIL = -10;

/** 実数入力の radix-2 FFT。re/im を破壊的に更新する。長さは 2 の冪であること。 */
function fft(re: Float32Array, im: Float32Array, cos: Float32Array, sin: Float32Array, rev: Uint32Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    const j = rev[i]!;
    if (j > i) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step]!;
        const wi = -sin[k * step]!;
        const a = start + k;
        const b = a + half;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
}

/** 描画列 x (0..width-1) に対応する周波数。対数軸。 */
export function columnFrequency(x: number, width: number, maxHz: number): number {
  const ratio = width > 1 ? x / (width - 1) : 0;
  return FREQ_MIN_HZ * Math.pow(maxHz / FREQ_MIN_HZ, ratio);
}

/**
 * 行 = 時間（rows 行で全体を等分）、列 = 周波数（対数軸）のレベルを 0〜1 で返す。
 * 返り値は rows * width の行優先配列。
 */
export function computeSpectrogram(samples: Float32Array, sampleRate: number, rows: number, width: number): Float32Array {
  const out = new Float32Array(rows * width);
  if (rows === 0 || samples.length === 0) return out;

  const n = FFT_SIZE;
  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  const window = new Float32Array(n);
  let windowSum = 0;
  for (let i = 0; i < n; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    windowSum += window[i]!;
  }

  // 各列が参照する FFT ビン位置（小数）。低域は隣接ビンを線形補間して滑らかにする。
  const maxHz = Math.min(FREQ_MAX_HZ, sampleRate / 2);
  const binPos = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    binPos[x] = Math.min((columnFrequency(x, width, maxHz) * n) / sampleRate, n / 2 - 1);
  }

  const re = new Float32Array(n);
  const im = new Float32Array(n);
  const mag = new Float32Array(n / 2);
  const samplesPerRow = samples.length / rows;
  // 振幅 A の正弦波が 0 dBFS になるよう、窓の総和の半分で正規化する。
  const norm = windowSum / 2;

  for (let row = 0; row < rows; row++) {
    const start = Math.floor((row + 0.5) * samplesPerRow) - n / 2;
    for (let i = 0; i < n; i++) {
      re[i] = (samples[start + i] ?? 0) * window[i]!;
      im[i] = 0;
    }
    fft(re, im, cos, sin, rev);
    for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k]!, im[k]!) / norm;

    for (let x = 0; x < width; x++) {
      const pos = binPos[x]!;
      const k = Math.floor(pos);
      const frac = pos - k;
      const m = mag[k]! * (1 - frac) + mag[Math.min(k + 1, n / 2 - 1)]! * frac;
      const db = 20 * Math.log10(m + 1e-12);
      out[row * width + x] = Math.min(1, Math.max(0, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
    }
  }
  return out;
}

// 暗い背景（#1e1e1e）から明るい色へ繋がる配色（inferno 風）。
const COLOR_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [30, 30, 30],
  [40, 11, 84],
  [120, 28, 109],
  [212, 72, 66],
  [250, 169, 32],
  [252, 255, 164],
];

/** レベル 0〜1 を RGB に変換する。 */
export function levelToRgb(level: number): [number, number, number] {
  const scaled = Math.min(1, Math.max(0, level)) * (COLOR_STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), COLOR_STOPS.length - 2);
  const f = scaled - i;
  const a = COLOR_STOPS[i]!;
  const b = COLOR_STOPS[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
