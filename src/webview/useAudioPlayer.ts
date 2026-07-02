import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import type { RefObject } from "preact";
import { scrollToPlayhead } from "./utils";
import type { PlatformBridge, AudioMDDocument, InitMessage } from "./types";

export interface AudioPlayerState {
  playState: "playing" | "paused" | "ended";
  currentTime: number;
  duration: number;
  errorMessage: string | null;
  audioBuffer: AudioBuffer | null;
  doc: AudioMDDocument | null;
  audioRef: RefObject<HTMLAudioElement | null>;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
}

export function useAudioPlayer(
  bridge: PlatformBridge,
  wavePanelRef: RefObject<HTMLDivElement>
): AudioPlayerState {
  const [playState, setPlayState] = useState<"playing" | "paused" | "ended">("paused");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [doc, setDoc] = useState<AudioMDDocument | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const currentAudioUriRef = useRef<string | null>(null);
  const audioCtxRef = useRef(new AudioContext());
  const audioAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bridge.onMessage((raw: unknown) => {
      const msg = raw as InitMessage & { type: string };
      if (msg.type !== "init") return;
      const { document: newDoc, audioUri } = msg;
      setDoc(newDoc);
      if (!audioUri) {
        setErrorMessage("音声ファイルが見つかりません: " + newDoc.audioPath);
        return;
      }
      setErrorMessage(null);
      if (audioUri !== currentAudioUriRef.current) {
        currentAudioUriRef.current = audioUri;
        loadAudio(audioUri, newDoc.audioPath);
      }
    });
    bridge.postMessage({ type: "ready" });
    return () => { audioCtxRef.current.close(); };
  }, []);

  const togglePlay = useCallback((): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { audio.play(); } else { audio.pause(); }
  }, []);

  const seek = useCallback((time: number): void => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
    const panel = wavePanelRef.current;
    if (panel) scrollToPlayhead(panel, time);
  }, []);

  const setVolume = useCallback((vol: number): void => {
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  function loadAudio(uri: string, audioPath: string): void {
    const prevAudio = audioRef.current;
    if (prevAudio) { prevAudio.pause(); prevAudio.src = ""; }
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioAbortRef.current) {
      audioAbortRef.current.abort();
      audioAbortRef.current = null;
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    setAudioBuffer(null);
    setDuration(0);
    setCurrentTime(0);
    setPlayState("paused");

    fetch(uri)
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        currentBlobUrlRef.current = blobUrl;
        const audioEl = new Audio(blobUrl);
        audioRef.current = audioEl;

        const ac = new AbortController();
        audioAbortRef.current = ac;
        const { signal } = ac;

        audioEl.addEventListener("error", () => {
          if (currentBlobUrlRef.current === blobUrl) {
            URL.revokeObjectURL(blobUrl);
            currentBlobUrlRef.current = null;
          }
          setErrorMessage("音声ファイルを読み込めませんでした: " + audioPath);
        }, { signal });

        audioEl.addEventListener("loadedmetadata", () => {
          setDuration(audioEl.duration);
          startPlaybackLoop(audioEl, signal);
          blob.arrayBuffer()
            .then(buf => audioCtxRef.current.decodeAudioData(buf))
            .then(buffer => setAudioBuffer(buffer))
            .catch(err => {
              console.error("decodeAudioData failed:", String(err));
              setErrorMessage("波形データのデコードに失敗しました");
            });
        }, { signal });

        audioEl.addEventListener("play", () => setPlayState("playing"), { signal });
        audioEl.addEventListener("pause", () => setPlayState("paused"), { signal });
        audioEl.addEventListener("ended", () => setPlayState("ended"), { signal });
      })
      .catch(() => setErrorMessage("音声ファイルを読み込めませんでした: " + audioPath));
  }

  function startPlaybackLoop(audioEl: HTMLAudioElement, signal: AbortSignal): void {
    function tick(): void {
      const cur = audioEl.currentTime;
      setCurrentTime(cur);
      const panel = wavePanelRef.current;
      if (panel) scrollToPlayhead(panel, cur);
      animFrameRef.current = requestAnimationFrame(tick);
    }

    audioEl.addEventListener("play", () => {
      if (animFrameRef.current === null) animFrameRef.current = requestAnimationFrame(tick);
    }, { signal });
    audioEl.addEventListener("pause", () => {
      if (animFrameRef.current !== null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    }, { signal });
    audioEl.addEventListener("ended", () => {
      if (animFrameRef.current !== null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    }, { signal });
  }

  return { playState, currentTime, duration, errorMessage, audioBuffer, doc, audioRef, togglePlay, seek, setVolume };
}
