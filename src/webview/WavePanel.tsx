import { useRef, useEffect } from "preact/hooks";
import type { RefObject } from "preact";
import { useBridge } from "./BridgeContext";
import { computeSpectrogram, levelToRgb } from "./spectrogram";
import { PX_PER_SEC, SPECTRUM_WIDTH, displayChannelCount, formatTime, spectrumX, formatTimestamp } from "./utils";

const CHANNEL_LABELS = ["L", "R"] as const;

function drawSpectrogram(canvas: HTMLCanvasElement, buffer: AudioBuffer): void {
  const h = canvas.height;
  const channelCount = displayChannelCount(buffer.numberOfChannels);
  const totalWidth = SPECTRUM_WIDTH * channelCount;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, totalWidth, h);

  // チャンネルごとに計算し、1枚の画像の左右に並べる（ch0 が左、ch1 が右）。
  // 左は周波数軸を反転し、低域が中央に寄る（左: 高→低 | 右: 低→高）。
  const image = ctx.createImageData(totalWidth, h);
  for (let ch = 0; ch < channelCount; ch++) {
    const levels = computeSpectrogram(buffer.getChannelData(ch), buffer.sampleRate, h, SPECTRUM_WIDTH);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < SPECTRUM_WIDTH; x++) {
        const [r, g, b] = levelToRgb(levels[y * SPECTRUM_WIDTH + x]!);
        const o = (y * totalWidth + spectrumX(ch, x, channelCount)) * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);

  const duration = buffer.duration;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "10px monospace";
  for (let sec = 0; sec <= duration; sec += 5) {
    const y = sec * PX_PER_SEC;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(totalWidth, y);
    ctx.stroke();
    for (let ch = 0; ch < channelCount; ch++) {
      ctx.fillText(formatTime(sec), ch * SPECTRUM_WIDTH + 2, y + 10);
    }
  }

  if (channelCount === 2) {
    // どちらが L/R か分かるよう、境界線とラベルを描く。
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.moveTo(SPECTRUM_WIDTH + 0.5, 0);
    ctx.lineTo(SPECTRUM_WIDTH + 0.5, h);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    CHANNEL_LABELS.forEach((label, ch) => ctx.fillText(label, (ch + 1) * SPECTRUM_WIDTH - 14, 24));
  }
}

interface Props {
  duration: number;
  audioBuffer: AudioBuffer | null;
  currentTime: number;
  wavePanelRef: RefObject<HTMLDivElement>;
  onSeek: (time: number) => void;
}

export function WavePanel({ duration, audioBuffer, currentTime, wavePanelRef, onSeek }: Props) {
  const bridge = useBridge();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveInnerRef = useRef<HTMLDivElement>(null);
  const width = SPECTRUM_WIDTH * displayChannelCount(audioBuffer?.numberOfChannels ?? 1);
  const dragRef = useRef<{ startY: number; button: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const inner = waveInnerRef.current;
    if (!canvas || !inner) return;
    const h = Math.ceil(duration * PX_PER_SEC);
    canvas.height = h;
    inner.style.height = `${h}px`;
  }, [duration]);

  useEffect(() => {
    if (audioBuffer && canvasRef.current) drawSpectrogram(canvasRef.current, audioBuffer);
  }, [audioBuffer]);

  const handleMouseDown = (e: MouseEvent) => {
    dragRef.current = { startY: e.offsetY, button: e.button };
  };

  const handleMouseUp = (e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.button !== e.button) {
      dragRef.current = null;
      return;
    }
    const startTime = drag.startY / PX_PER_SEC;
    const endY = e.offsetY;
    const endTime = endY / PX_PER_SEC;
    const isDrag = Math.abs(endY - drag.startY) >= 5;

    if (e.button === 0) {
      onSeek(endTime);
    } else if (e.button === 2) {
      let text: string;
      if (isDrag) {
        const a = Math.floor(Math.min(startTime, endTime));
        const b = Math.floor(Math.max(startTime, endTime));
        text = `[${formatTime(a)}-${formatTime(b)}](#t=${a},${b}) `;
      } else {
        text = formatTimestamp(startTime);
      }
      bridge.postMessage({ type: "insertTimestamp", text });
    }

    dragRef.current = null;
  };

  return (
    <div id="wave-panel" ref={wavePanelRef} style={{ width: `${width}px` }}>
      <div id="wave-inner" ref={waveInnerRef} style={{ width: `${width}px` }}>
        <canvas
          id="wave-canvas"
          ref={canvasRef}
          width={width}
          height={0}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div id="playhead" style={{ top: `${currentTime * PX_PER_SEC}px` }} />
      </div>
    </div>
  );
}
