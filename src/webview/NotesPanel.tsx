import { useRef, useEffect } from "preact/hooks";
import { memo } from "preact/compat";
import type { RefObject } from "preact";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { PX_PER_SEC } from "./utils";
import type { AudioNoteBlock } from "./types";

function setMarkdownContent(el: HTMLElement, text: string): void {
  const raw = marked.parse(text.trim(), { async: false }) as string;
  const sanitized = DOMPurify.sanitize(raw);
  const parsed = new DOMParser().parseFromString(sanitized, "text/html");
  const nodes = Array.from(parsed.body.childNodes).map(n => n.cloneNode(true));
  el.replaceChildren(...nodes);
}

interface NoteBlockProps {
  block: AudioNoteBlock;
  onSeek: (time: number) => void;
}

function NoteBlock({ block, onSeek }: NoteBlockProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) setMarkdownContent(contentRef.current, block.text);
  }, [block.text]);

  const className = block.end !== null ? "note-block note-block--range" : "note-block";
  const style: Record<string, string> = { top: `${block.t * PX_PER_SEC}px` };
  if (block.end !== null) {
    style.minHeight = `${(block.end - block.t) * PX_PER_SEC}px`;
  }

  return (
    <div
      className={className}
      style={style}
      onClick={(e) => {
        if ((e.target as Element).closest("a")) return;
        onSeek(block.t);
      }}
    >
      <div ref={contentRef} />
    </div>
  );
}

interface Props {
  blocks: AudioNoteBlock[];
  duration: number;
  notesPanelRef: RefObject<HTMLDivElement>;
  onSeek: (time: number) => void;
}

export const NotesPanel = memo(function NotesPanel({ blocks, duration, notesPanelRef, onSeek }: Props) {
  const innerStyle = { height: `${Math.ceil(duration * PX_PER_SEC) + 120}px` };
  return (
    <div id="notes-panel" ref={notesPanelRef}>
      <div id="notes-inner" style={innerStyle}>
        {blocks.map((block) => (
          <NoteBlock key={block.t} block={block} onSeek={onSeek} />
        ))}
      </div>
    </div>
  );
});
