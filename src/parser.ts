export interface AudioNoteBlock {
  t: number;
  end: number | null;
  text: string;
}

export interface AudioNoteDocument {
  audioPath: string;
  blocks: AudioNoteBlock[];
}

const TIMESTAMP_RE = /^\[([^\]]*)\]\(#t=(\d+)(?:,(\d+))?\)/;

export function parseAudioNote(content: string): AudioNoteDocument {
  const lines = content.split('\n');

  let audioPath = '';
  const firstLine = lines[0]?.trim() ?? '';
  const audioMatch = firstLine.match(/^@audio\s+(.+)$/);
  if (audioMatch) {
    audioPath = audioMatch[1].trim();
  }

  const blocks: AudioNoteBlock[] = [];
  let currentBlock: AudioNoteBlock | null = null;
  let preamble = '';
  let hasSeen = false;

  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && audioMatch) continue;

    const line = lines[i];
    const tsMatch = line.match(TIMESTAMP_RE);

    if (tsMatch) {
      if (!hasSeen && preamble.trim()) {
        blocks.push({ t: 0, end: null, text: preamble.trimEnd() });
      }
      hasSeen = true;
      if (currentBlock) {
        currentBlock.text = currentBlock.text.trimEnd();
        blocks.push(currentBlock);
      }
      const t = parseInt(tsMatch[2], 10);
      const end = tsMatch[3] != null ? parseInt(tsMatch[3], 10) : null;
      const rest = line.slice(tsMatch[0].length);
      currentBlock = { t, end, text: rest };
    } else if (!hasSeen) {
      preamble += line + '\n';
    } else if (currentBlock) {
      currentBlock.text += '\n' + line;
    }
  }

  if (!hasSeen && preamble.trim()) {
    blocks.push({ t: 0, end: null, text: preamble.trimEnd() });
  }
  if (currentBlock) {
    currentBlock.text = currentBlock.text.trimEnd();
    blocks.push(currentBlock);
  }

  return { audioPath, blocks };
}
