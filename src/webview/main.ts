import { marked } from "marked";
import DOMPurify from "dompurify";

export interface PlatformBridge {
  onMessage: (handler: (msg: unknown) => void) => void;
  postMessage: (msg: unknown) => void;
}

interface AudioNoteBlock {
  t: number;
  end: number | null;
  text: string;
}

interface AudioNoteDocument {
  audioPath: string;
  blocks: AudioNoteBlock[];
}

interface InitMessage {
  type: "init";
  document: AudioNoteDocument;
  audioUri: string;
}

const PX_PER_SEC = 80;

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function syncScroll(source: Element, target: Element): void {
  const ratio = source.scrollTop / (source.scrollHeight - source.clientHeight);
  target.scrollTop = ratio * (target.scrollHeight - target.clientHeight);
}

export function init(bridge: PlatformBridge): void {
  (["log", "warn", "error"] as const).forEach(level => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      bridge.postMessage({ type: "log", level, args: args.map(String) });
    };
  });

  const playBtn = document.getElementById("play-btn")!;
  const timeDisplay = document.getElementById("time-display")!;
  const fileLabel = document.getElementById("file-label")!;
  const wavePanel = document.getElementById("wave-panel")!;
  const waveInner = document.getElementById("wave-inner")!;
  const waveCanvas = document.getElementById("wave-canvas") as HTMLCanvasElement;
  const notesPanel = document.getElementById("notes-panel")!;
  const notesInner = document.getElementById("notes-inner")!;
  const errorBanner = document.getElementById("error-banner")!;
  const playhead = document.getElementById("playhead")!;
  const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;;

  const audioCtx = new AudioContext();
  let audio: HTMLAudioElement | null = null;
  let animFrameId: number | null = null;
  let isSyncing = false;
  let dragStartY: number | null = null;
  let dragStartButton: number | null = null;
  let currentAudioUri: string | null = null;
  let currentBlobUrl: string | null = null;

  wavePanel.addEventListener("scroll", () => {
    if (isSyncing) return;
    isSyncing = true;
    syncScroll(wavePanel, notesPanel);
    isSyncing = false;
  });

  notesPanel.addEventListener("scroll", () => {
    if (isSyncing) return;
    isSyncing = true;
    syncScroll(notesPanel, wavePanel);
    isSyncing = false;
  });

  playBtn.addEventListener("click", () => {
    if (!audio) return;
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  });

  volumeSlider.addEventListener("input", () => {
    if (!audio) return;
    audio.volume = parseFloat(volumeSlider.value);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      if (!audio) return;
      if (audio.paused) { audio.play(); } else { audio.pause(); }
    }
  });

  waveCanvas.addEventListener("mousedown", e => {
    dragStartY = e.offsetY;
    dragStartButton = e.button;
  });

  waveCanvas.addEventListener("mouseup", e => {
    if (dragStartY === null || dragStartButton !== e.button) {
      dragStartY = null;
      dragStartButton = null;
      return;
    }
    const startTime = dragStartY / PX_PER_SEC;
    const endY = e.offsetY;
    const endTime = endY / PX_PER_SEC;
    const isDrag = Math.abs(endY - dragStartY) >= 5;

    if (e.button === 0) {
      if (audio) {
        audio.currentTime = endTime;
        playhead.style.top = `${endTime * PX_PER_SEC}px`;
        if (!isNaN(audio.duration)) {
          timeDisplay.textContent = `${formatTime(Math.floor(endTime))} / ${formatTime(Math.floor(audio.duration))}`;
        }
      }
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

    dragStartY = null;
    dragStartButton = null;
  });

  waveCanvas.addEventListener("contextmenu", e => {
    e.preventDefault();
  });

  bridge.onMessage((raw: unknown) => {
    const msg = raw as { type: string } & Record<string, unknown>;
    if (msg.type === "init") handleInit(msg as unknown as InitMessage);
  });

  bridge.postMessage({ type: "ready" });

  function handleInit(msg: InitMessage): void {
    const { document: doc, audioUri } = msg;
    fileLabel.textContent = doc.audioPath ? (doc.audioPath.split("/").pop() ?? "") : "";
    renderNotes(doc.blocks);

    if (!audioUri) {
      showError("音声ファイルが見つかりません: " + doc.audioPath);
      return;
    }
    if (audioUri !== currentAudioUri) {
      currentAudioUri = audioUri;
      loadAudio(audioUri, doc.audioPath);
    }
  }

  function loadAudio(uri: string, audioPath: string): void {
    if (audio) { audio.pause(); audio.src = ""; }
    if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }

    fetch(uri)
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        currentBlobUrl = blobUrl;
        const audioEl = new Audio(blobUrl);
        audio = audioEl;

        audioEl.addEventListener("error", () => {
          if (currentBlobUrl === blobUrl) {
            URL.revokeObjectURL(blobUrl);
            currentBlobUrl = null;
          }
          showError("音声ファイルを読み込めませんでした: " + audioPath);
        });
        audioEl.addEventListener("loadedmetadata", () => {
          const duration = audioEl.duration;
          timeDisplay.textContent = `0:00 / ${formatTime(Math.floor(duration))}`;
          setContentHeight(duration);
          startPlaybackLoop(audioEl);

          blob.arrayBuffer()
            .then(buf => audioCtx.decodeAudioData(buf))
            .then(buffer => {
              drawWaveform(waveCanvas, buffer);
            })
            .catch(err => {
              console.error("decodeAudioData failed:", String(err));
              showError("波形データのデコードに失敗しました");
            });
        });
        audioEl.addEventListener("play", () => { playBtn.textContent = "⏸"; });
        audioEl.addEventListener("pause", () => { playBtn.textContent = "▶"; });
        audioEl.addEventListener("ended", () => { playBtn.textContent = "▶"; });
      })
      .catch(() => showError("音声ファイルを読み込めませんでした: " + audioPath));
  }

  function setContentHeight(duration: number): void {
    const h = Math.ceil(duration * PX_PER_SEC);
    waveInner.style.height = `${h}px`;
    notesInner.style.height = `${h + 120}px`;
    waveCanvas.height = h;
    waveCanvas.width = 160;
  }

  function drawWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer): void {
    const h = canvas.height;
    const duration = buffer.duration;

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
        const v = Math.abs(channelData[i]);
        if (v > peak) peak = v;
      }
      const hw = peak * 76;
      ctx.moveTo(80 - hw, y + 0.5);
      ctx.lineTo(80 + hw, y + 0.5);
    }
    ctx.stroke();

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

  function renderNotes(blocks: AudioNoteBlock[]): void {
    notesInner.replaceChildren();
    for (const block of blocks) {
      const el = document.createElement("div");
      el.className = block.end !== null ? "note-block note-block--range" : "note-block";
      el.style.top = `${block.t * PX_PER_SEC}px`;
      if (block.end !== null) {
        el.style.minHeight = `${(block.end - block.t) * PX_PER_SEC}px`;
      }
      el.innerHTML = DOMPurify.sanitize(marked.parse(block.text.trim(), { async: false }));
      el.addEventListener("click", (e) => {
        if ((e.target as Element).closest("a")) return;
        if (!audio) return;
        audio.currentTime = block.t;
        const py = block.t * PX_PER_SEC;
        playhead.style.top = `${py}px`;
        if (!isNaN(audio.duration)) {
          timeDisplay.textContent = `${formatTime(block.t)} / ${formatTime(Math.floor(audio.duration))}`;
        }
        const viewportCenter = wavePanel.scrollTop + wavePanel.clientHeight / 2;
        if (Math.abs(py - viewportCenter) > wavePanel.clientHeight * 0.3) {
          wavePanel.scrollTop = py - wavePanel.clientHeight / 2;
        }
      });
      notesInner.appendChild(el);
    }
  }

  function startPlaybackLoop(audioEl: HTMLAudioElement): void {
    if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }

    function tick(): void {
      const cur = audioEl.currentTime;
      const dur = audioEl.duration;
      const py = cur * PX_PER_SEC;
      const scrollTop = wavePanel.scrollTop;
      const clientHeight = wavePanel.clientHeight;
      timeDisplay.textContent = `${formatTime(Math.floor(cur))} / ${formatTime(Math.floor(dur))}`;
      playhead.style.top = `${py}px`;
      const viewportCenter = scrollTop + clientHeight / 2;
      if (Math.abs(py - viewportCenter) > clientHeight * 0.3) {
        wavePanel.scrollTop = py - clientHeight / 2;
      }
      animFrameId = requestAnimationFrame(tick);
    }

    audioEl.addEventListener("play", () => {
      if (animFrameId === null) animFrameId = requestAnimationFrame(tick);
    });
    audioEl.addEventListener("pause", () => {
      if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    });
    audioEl.addEventListener("ended", () => {
      if (animFrameId !== null) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    });
  }

  function showError(message: string): void {
    errorBanner.textContent = message;
    errorBanner.style.display = "block";
  }
}
