import { Schema } from "effect";

export const AudioMDBlockSchema = Schema.Struct({
  t: Schema.Number,
  end: Schema.NullOr(Schema.Number),
  text: Schema.String,
});

export const AudioMDDocumentSchema = Schema.Struct({
  audioPath: Schema.String,
  blocks: Schema.Array(AudioMDBlockSchema),
});

export type AudioMDBlock = Schema.Schema.Type<typeof AudioMDBlockSchema>;
export type AudioMDDocument = Schema.Schema.Type<typeof AudioMDDocumentSchema>;

const TIMESTAMP_RE = /^\[([^\]]*)\]\(#t=(\d+)(?:,(\d+))?\)/;

export function parseAudioMD(content: string): AudioMDDocument {
  const lines = content.split("\n");

  let audioPath = "";
  const blocks: AudioMDBlock[] = [];
  let current: { t: number; end: number | null; lines: string[] } | null = null;

  for (const [i, line] of lines.entries()) {
    if (i === 0 && line.startsWith("@audio ")) {
      audioPath = line.slice(7).trim();
      continue;
    }

    const match = line.match(TIMESTAMP_RE);
    if (match) {
      if (current) {
        blocks.push({ t: current.t, end: current.end, text: current.lines.join("\n").trimEnd() });
      }
      const t = parseInt(match[2]!, 10);
      const end = match[3] !== undefined ? parseInt(match[3], 10) : null;
      current = { t, end, lines: [line.slice(match[0].length)] };
    } else if (current !== null) {
      current.lines.push(line);
    }
  }

  if (current) {
    blocks.push({ t: current.t, end: current.end, text: current.lines.join("\n").trimEnd() });
  }

  return { audioPath, blocks };
}
