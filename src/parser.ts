import { Schema } from "effect";

export const SoundStampBlockSchema = Schema.Struct({
  t: Schema.Number,
  end: Schema.NullOr(Schema.Number),
  text: Schema.String,
});

export const SoundStampDocumentSchema = Schema.Struct({
  audioPath: Schema.String,
  blocks: Schema.Array(SoundStampBlockSchema),
});

export type SoundStampBlock = Schema.Schema.Type<typeof SoundStampBlockSchema>;
export type SoundStampDocument = Schema.Schema.Type<typeof SoundStampDocumentSchema>;

const TIMESTAMP_RE = /^\[([^\]]*)\]\(#t=(\d+)(?:,(\d+))?\)/;

export function parseSoundStamp(content: string): SoundStampDocument {
  const lines = content.split("\n");

  let audioPath = "";
  const blocks: SoundStampBlock[] = [];
  let current: { t: number; end: number | null; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0 && line.startsWith("@audio ")) {
      audioPath = line.slice(7).trim();
      continue;
    }

    const match = line.match(TIMESTAMP_RE);
    if (match) {
      if (current) {
        blocks.push({ t: current.t, end: current.end, text: current.lines.join("\n").trimEnd() });
      }
      const t = parseInt(match[2], 10);
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
