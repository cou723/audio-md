import { useRef, useEffect } from "preact/hooks";
import type { RefObject } from "preact";
import { useBridge } from "./BridgeContext";
import { PX_PER_SEC, formatTime } from "./utils";

function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer): void {
  const h = canvas.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1e1e1e";
  ctx.fillRect(0, 0, 160, h);

  const channelData = buffer.getChannelData(0);
  const samplesPerPx = channelData.length / h;
  ctx.strokeStyle = "#4ec9b0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y < h; y++) {
    const s0 = Math.floor(y * samplesPerPx);
    const s1 = Math.floor((y + 1) * samplesPerPx);
    let peak = 0;
    for (let i = s0; i < s1; i++) {
      const v = Math.abs(channelData[i] ?? 0);
      if (v > peak) peak = v;
    }
    const hw = peak * 76;
    ctx.moveTo(80 - hw, y + 0.5);
    ctx.lineTo(80 + hw, y + 0.5);
  }
  ctx.stroke();

  const duration = buffer.duration;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "10px monospace";
  for (let sec = 0; sec <= duration; sec += 5) {
    const y = sec * PX_PER_SEC;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(160, y);
    ctx.stroke();
    ctx.fillText(formatTime(sec), 2, y + 10);
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
  const dragRef = useRef<{ startY: number; button: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const inner = waveInnerRef.current;
    if (!canvas || !inner) return;
    const h = Math.ceil(duration * PX_PER_SEC);
    canvas.height = h;
    canvas.width = 160;
    inner.style.height = `${h}px`;
  }, [duration]);

  useEffect(() => {
    if (audioBuffer && canvasRef.current) drawWaveform(canvasRef.current, audioBuffer);
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
        const sec = Math.floor(startTime);
        text = `[${formatTime(sec)}](#t=${sec}) `;
      }
      bridge.postMessage({ type: "insertTimestamp", text });
    }

    dragRef.current = null;
  };

  return (
    <div id="wave-panel" ref={wavePanelRef}>
      <div id="wave-inner" ref={waveInnerRef}>
        <canvas
          id="wave-canvas"
          ref={canvasRef}
          width={160}
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
