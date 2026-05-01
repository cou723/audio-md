import { useRef } from "preact/hooks";
import { useBridge } from "./BridgeContext";
import { Toolbar } from "./Toolbar";
import { WavePanel } from "./WavePanel";
import { NotesPanel } from "./NotesPanel";
import { ErrorBanner } from "./ErrorBanner";
import { useAudioPlayer } from "./useAudioPlayer";
import { useScrollSync } from "./useScrollSync";
import { useKeyboardShortcut } from "./useKeyboardShortcut";

export function App() {
  const bridge = useBridge();
  const wavePanelRef = useRef<HTMLDivElement>(null);
  const notesPanelRef = useRef<HTMLDivElement>(null);

  const player = useAudioPlayer(bridge, wavePanelRef);
  useScrollSync(wavePanelRef, notesPanelRef);
  useKeyboardShortcut(" ", player.togglePlay);

  const fileName = player.doc?.audioPath.split("/").pop() ?? "";

  return (
    <>
      <Toolbar
        playState={player.playState}
        currentTime={player.currentTime}
        duration={player.duration}
        fileName={fileName}
        onPlay={player.togglePlay}
        onVolumeChange={player.setVolume}
      />
      <ErrorBanner message={player.errorMessage} />
      <div id="main-area">
        <WavePanel
          duration={player.duration}
          audioBuffer={player.audioBuffer}
          currentTime={player.currentTime}
          wavePanelRef={wavePanelRef}
          onSeek={player.seek}
        />
        <NotesPanel
          blocks={player.doc?.blocks ?? []}
          duration={player.duration}
          notesPanelRef={notesPanelRef}
          onSeek={player.seek}
        />
      </div>
    </>
  );
}
