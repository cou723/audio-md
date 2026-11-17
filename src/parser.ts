import { Schema } from "effect";
import { parse } from "yaml";

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
const FRONT_MATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function extractAudioPath(content: string): { audioPath: string; body: string } {
  const match = content.match(FRONT_MATTER_RE);
  if (!match) return { audioPath: "", body: content };

  try {
    const frontMatter: unknown = parse(match[1] ?? "");
    const audioPath =
      typeof frontMatter === "object" &&
      frontMatter !== null &&
      "audio" in frontMatter &&
      typeof frontMatter.audio === "string"
        ? frontMatter.audio
        : "";
    return { audioPath, body: content.slice(match[0].length) };
  } catch {
    return { audioPath: "", body: content.slice(match[0].length) };
  }
}

export function parseAudioMD(content: string): AudioMDDocument {
  const { audioPath, body } = extractAudioPath(content);
  const lines = body.split("\n");

  const blocks: AudioMDBlock[] = [];
  let current: { t: number; end: number | null; lines: string[] } | null = null;

  for (const line of lines) {
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
