interface PlatformBridge {
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

const PX_PER_SEC = 80;

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function buildTimestampSyntax(startSec: number, endSec: number | null): string {
  if (endSec !== null) {
    return `[${formatTime(startSec)}-${formatTime(endSec)}](#t=${Math.round(startSec)},${Math.round(endSec)}) `;
  }
  return `[${formatTime(startSec)}](#t=${Math.round(startSec)}) `;
}

export function init(
  container: HTMLElement,
  bridge: PlatformBridge,
  doc: AudioNoteDocument,
  audioUri: string
) {
  container.innerHTML = '';

  // --- Toolbar ---
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const playBtn = document.createElement('button');
  playBtn.className = 'play-btn';
  playBtn.textContent = '▶';

  const timeDisplay = document.createElement('span');
  timeDisplay.className = 'time-display';
  timeDisplay.textContent = '0:00 / 0:00';

  const fileLabel = document.createElement('span');
  fileLabel.className = 'file-label';
  fileLabel.textContent = doc.audioPath || '';

  toolbar.appendChild(playBtn);
  toolbar.appendChild(timeDisplay);
  toolbar.appendChild(fileLabel);

  // --- Main area ---
  const mainArea = document.createElement('div');
  mainArea.className = 'main-area';

  // Left: waveform panel
  const wavePanel = document.createElement('div');
  wavePanel.className = 'wave-panel';

  const canvas = document.createElement('canvas');
  canvas.className = 'wave-canvas';
  canvas.width = 160;
  canvas.height = 100;

  const playhead = document.createElement('div');
  playhead.className = 'playhead';

  wavePanel.appendChild(canvas);
  wavePanel.appendChild(playhead);

  // Right: note panel
  const notePanel = document.createElement('div');
  notePanel.className = 'note-panel';

  const noteInner = document.createElement('div');
  noteInner.className = 'note-inner';
  notePanel.appendChild(noteInner);

  mainArea.appendChild(wavePanel);
  mainArea.appendChild(notePanel);

  container.appendChild(toolbar);
  container.appendChild(mainArea);

  // --- Error banner ---
  const errorBanner = document.createElement('div');
  errorBanner.className = 'error-banner';
  errorBanner.style.display = 'none';
  container.insertBefore(errorBanner, mainArea);

  function showError(msg: string) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
  }

  // --- Audio ---
  const audio = new Audio();
  let audioDuration = 0;
  let waveformData: Float32Array | null = null;
  let animFrameId = 0;

  if (audioUri) {
    audio.src = audioUri;
    audio.addEventListener('error', () => {
      showError(`Audio file not found or cannot be decoded: ${doc.audioPath}`);
    });

    audio.addEventListener('loadedmetadata', () => {
      audioDuration = audio.duration;
      timeDisplay.textContent = `0:00 / ${formatTime(audioDuration)}`;
      setupCanvas();
      renderNotes();
      loadWaveform();
    });
  } else {
    showError('No audio file specified.');
  }

  // --- Canvas / waveform ---
  function setupCanvas() {
    const totalHeight = Math.ceil(audioDuration * PX_PER_SEC);
    canvas.height = totalHeight;
    canvas.width = wavePanel.clientWidth || 160;
    noteInner.style.height = totalHeight + 'px';
    drawGrid();
  }

  function drawGrid() {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px monospace';
    ctx.lineWidth = 1;

    for (let t = 0; t <= audioDuration; t += 5) {
      const y = t * PX_PER_SEC;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
      ctx.fillText(formatTime(t), 2, y + 10);
    }

    if (waveformData) {
      drawWaveform(ctx);
    }
  }

  function drawWaveform(ctx: CanvasRenderingContext2D) {
    if (!waveformData) return;
    const w = canvas.width;
    const h = canvas.height;
    const mid = w / 2;

    ctx.strokeStyle = 'rgba(100,200,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let py = 0; py < h; py++) {
      const idx = Math.floor((py / h) * waveformData.length);
      const amp = waveformData[idx] ?? 0;
      const x = mid + amp * (mid - 4);
      if (py === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.stroke();
  }

  async function loadWaveform() {
    try {
      const response = await fetch(audioUri);
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();

      const audioCtx = new AudioContext();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Downmix to mono
      let channelData = buffer.getChannelData(0);
      if (buffer.numberOfChannels > 1) {
        const ch1 = buffer.getChannelData(1);
        const mixed = new Float32Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
          mixed[i] = (channelData[i] + ch1[i]) / 2;
        }
        channelData = mixed;
      }

      const totalHeight = canvas.height;
      const peaks = new Float32Array(totalHeight);
      const samplesPerPixel = Math.ceil(channelData.length / totalHeight);
      for (let py = 0; py < totalHeight; py++) {
        let max = 0;
        const start = py * samplesPerPixel;
        const end = Math.min(start + samplesPerPixel, channelData.length);
        for (let i = start; i < end; i++) {
          const v = Math.abs(channelData[i]);
          if (v > max) max = v;
        }
        peaks[py] = max;
      }
      waveformData = peaks;

      const ctx = canvas.getContext('2d');
      if (ctx) drawGrid();
    } catch (e) {
      console.error('decodeAudioData failed:', e);
      showError('Failed to decode audio data.');
    }
  }

  // --- Notes ---
  function renderNotes() {
    noteInner.innerHTML = '';
    for (const block of doc.blocks) {
      const el = document.createElement('div');
      el.className = 'note-block';
      el.style.setProperty('--t', String(block.t));
      el.textContent = block.text;
      noteInner.appendChild(el);
    }
  }

  // --- Playback ---
  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
      playBtn.textContent = '⏸';
    } else {
      audio.pause();
      playBtn.textContent = '▶';
    }
  });

  audio.addEventListener('ended', () => {
    playBtn.textContent = '▶';
    cancelAnimationFrame(animFrameId);
  });

  function tick() {
    const current = audio.currentTime;
    timeDisplay.textContent = `${formatTime(current)} / ${formatTime(audioDuration)}`;

    const playheadY = current * PX_PER_SEC;
    playhead.style.top = playheadY + 'px';

    // Auto-scroll
    const viewportCenter = wavePanel.scrollTop + wavePanel.clientHeight / 2;
    if (Math.abs(playheadY - viewportCenter) > wavePanel.clientHeight * 0.3) {
      wavePanel.scrollTop = playheadY - wavePanel.clientHeight / 2;
    }

    if (!audio.paused) animFrameId = requestAnimationFrame(tick);
  }

  audio.addEventListener('play', () => {
    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(tick);
  });

  audio.addEventListener('pause', () => {
    cancelAnimationFrame(animFrameId);
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.paused) {
      timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audioDuration)}`;
      const playheadY = audio.currentTime * PX_PER_SEC;
      playhead.style.top = playheadY + 'px';
    }
  });

  // --- Waveform click / drag ---
  let mousedownY = 0;
  let mousedownTime = 0;
  let isDragging = false;

  canvas.addEventListener('mousedown', e => {
    mousedownY = e.offsetY + wavePanel.scrollTop;
    mousedownTime = mousedownY / PX_PER_SEC;
    isDragging = false;
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', e => {
    if (e.buttons !== 1) return;
    const currentY = e.offsetY + wavePanel.scrollTop;
    if (Math.abs(currentY - mousedownY) >= 5) {
      isDragging = true;
    }
  });

  canvas.addEventListener('mouseup', e => {
    const mouseupY = e.offsetY + wavePanel.scrollTop;
    const mouseupTime = mouseupY / PX_PER_SEC;

    if (isDragging) {
      const startSec = Math.min(mousedownTime, mouseupTime);
      const endSec = Math.max(mousedownTime, mouseupTime);
      const syntax = buildTimestampSyntax(startSec, endSec);
      bridge.postMessage({ type: 'insertTimestamp', syntax });
    } else {
      // Point click: seek + insert
      audio.currentTime = mousedownTime;
      const syntax = buildTimestampSyntax(mousedownTime, null);
      bridge.postMessage({ type: 'insertTimestamp', syntax });
    }
    isDragging = false;
  });

  // --- Scroll sync ---
  let isSyncing = false;

  wavePanel.addEventListener('scroll', () => {
    if (isSyncing) return;
    isSyncing = true;
    const ratio = wavePanel.scrollTop / Math.max(1, wavePanel.scrollHeight - wavePanel.clientHeight);
    notePanel.scrollTop = ratio * Math.max(1, notePanel.scrollHeight - notePanel.clientHeight);
    isSyncing = false;
  });

  notePanel.addEventListener('scroll', () => {
    if (isSyncing) return;
    isSyncing = true;
    const ratio = notePanel.scrollTop / Math.max(1, notePanel.scrollHeight - notePanel.clientHeight);
    wavePanel.scrollTop = ratio * Math.max(1, wavePanel.scrollHeight - wavePanel.clientHeight);
    isSyncing = false;
  });

  // bridge messages (not used from host currently, but required by interface)
  bridge.onMessage((_msg: unknown) => {});
}
