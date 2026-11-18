import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import type { RefObject } from "preact";
import { scrollToPlayhead } from "./utils";
import { executePlayerCommand, isPlayerCommandMessage } from "./playerCommands";
import { clampVolume, isSettingsMessage } from "./volume";
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
  volume: number;
  setVolume: (vol: number) => void;
  commitVolume: (vol: number) => void;
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
  const [volume, setVolumeState] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 音声ファイルの読み込み前に届いた設定値も、後から作る Audio へ適用するため ref に持つ。
  const volumeRef = useRef(1);
  const animFrameRef = useRef<number | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);
  const currentAudioUriRef = useRef<string | null>(null);
  const audioCtxRef = useRef(new AudioContext());
  const audioAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bridge.onMessage((raw: unknown) => {
      if (isPlayerCommandMessage(raw)) {
        executePlayerCommand(raw.command, audioRef.current, {
          seek,
          togglePlay,
          insertTimestamp: text => bridge.postMessage({ type: "insertTimestamp", text }),
        });
        return;
      }
      if (isSettingsMessage(raw)) {
        setVolume(raw.volume);
        return;
      }
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
    if (audio.paused) {
      void audio.play().catch(err => {
        console.error("Audio playback failed:", String(err));
        setErrorMessage("音声を再生できませんでした");
      });
    } else { audio.pause(); }
  }, []);

  const seek = useCallback((time: number): void => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(time) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const target = Math.max(0, Math.min(audio.duration, time));
    audio.currentTime = target;
    setCurrentTime(target);
    const panel = wavePanelRef.current;
    if (panel) scrollToPlayhead(panel, target);
  }, []);

  // 画面と Audio への反映のみ。設定ファイルへの保存は commitVolume で行う。
  const setVolume = useCallback((vol: number): void => {
    const clamped = clampVolume(vol);
    volumeRef.current = clamped;
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  // スライダーを放した時点で一度だけ保存する。ドラッグ中の連続入力で settings.json を書き換えないため。
  const commitVolume = useCallback((vol: number): void => {
    bridge.postMessage({ type: "setVolume", volume: clampVolume(vol) });
  }, [bridge]);

  function loadAudio(uri: string, audioPath: string): void {
    const prevAudio = audioRef.current;
    audioRef.current = null;
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
        audioEl.volume = volumeRef.current;
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

  return { playState, currentTime, duration, errorMessage, audioBuffer, doc, audioRef, togglePlay, seek, volume, setVolume, commitVolume };
}
