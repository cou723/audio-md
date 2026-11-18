import { describe, expect, it } from "vitest";
import { displayChannelCount, spectrumX, SPECTRUM_WIDTH } from "../src/webview/utils";
import { columnFrequency, computeSpectrogram, FREQ_MAX_HZ, levelToRgb } from "../src/webview/spectrogram";

const SAMPLE_RATE = 44100;
const WIDTH = 160;

function sine(freq: number, seconds: number, amplitude = 0.01): Float32Array {
  const out = new Float32Array(Math.floor(SAMPLE_RATE * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return out;
}

function peakColumn(levels: Float32Array, row: number): number {
  let best = 0;
  for (let x = 1; x < WIDTH; x++) {
    if (levels[row * WIDTH + x]! > levels[row * WIDTH + best]!) best = x;
  }
  return best;
}

describe("spectrogram", () => {
  it.each([200, 1000, 4000])("%sHz の正弦波は対応する周波数列でピークになる", (freq) => {
    const levels = computeSpectrogram(sine(freq, 2), SAMPLE_RATE, 160, WIDTH);
    const x = peakColumn(levels, 80);
    const hz = columnFrequency(x, WIDTH, FREQ_MAX_HZ);
    expect(Math.abs(Math.log2(hz / freq))).toBeLessThan(0.1);
    expect(levels[80 * WIDTH + x]!).toBeGreaterThan(0.5);
  });

  it("無音は全て 0 になる", () => {
    const levels = computeSpectrogram(new Float32Array(SAMPLE_RATE), SAMPLE_RATE, 80, WIDTH);
    expect(Math.max(...levels)).toBe(0);
  });

  it("時間方向の行は音の出る区間だけが明るくなる", () => {
    const samples = new Float32Array(SAMPLE_RATE * 2);
    samples.set(sine(1000, 1), 0); // 前半 1 秒だけ鳴らす
    const levels = computeSpectrogram(samples, SAMPLE_RATE, 200, WIDTH);
    const x = peakColumn(levels, 50);
    expect(levels[50 * WIDTH + x]!).toBeGreaterThan(0.5);
    expect(levels[150 * WIDTH + x]!).toBe(0);
  });

  it("サンプリングレートが低い音声は上限をナイキスト周波数に切り詰める", () => {
    const levels = computeSpectrogram(new Float32Array(16000).fill(0.1), 16000, 10, WIDTH);
    expect(levels).toHaveLength(10 * WIDTH);
  });

  it("レベルが範囲外でも色が有効な RGB に収まる", () => {
    expect(levelToRgb(-1)).toEqual(levelToRgb(0));
    expect(levelToRgb(2)).toEqual(levelToRgb(1));
  });
});

describe("displayChannelCount", () => {
  it.each([[1, 1], [2, 2], [6, 2]] as const)("%sch は %s 列で表示する", (channels, expected) => {
    expect(displayChannelCount(channels)).toBe(expected);
  });

  it("L だけ鳴る音源は R 側が無音になる", () => {
    const left = computeSpectrogram(sine(1000, 1, 0.01), SAMPLE_RATE, 40, WIDTH);
    const right = computeSpectrogram(new Float32Array(SAMPLE_RATE), SAMPLE_RATE, 40, WIDTH);
    expect(Math.max(...left)).toBeGreaterThan(0.5);
    expect(Math.max(...right)).toBe(0);
  });
});

describe("spectrumX", () => {
  it("ステレオでは L の周波数軸を反転し、低域が中央に寄る", () => {
    expect(spectrumX(0, 0, 2)).toBe(SPECTRUM_WIDTH - 1); // L の最低域は左列の右端（中央側）
    expect(spectrumX(0, SPECTRUM_WIDTH - 1, 2)).toBe(0); // L の最高域は左端
    expect(spectrumX(1, 0, 2)).toBe(SPECTRUM_WIDTH); // R の最低域は右列の左端（中央側）
    expect(spectrumX(1, SPECTRUM_WIDTH - 1, 2)).toBe(SPECTRUM_WIDTH * 2 - 1);
  });

  it("モノラルは反転しない", () => {
    expect(spectrumX(0, 0, 1)).toBe(0);
    expect(spectrumX(0, SPECTRUM_WIDTH - 1, 1)).toBe(SPECTRUM_WIDTH - 1);
  });
});
