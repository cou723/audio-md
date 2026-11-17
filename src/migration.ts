export function migrateLegacyAudioLine(line: string): string | null {
  if (!line.startsWith("@audio ")) return null;

  const audioPath = line.slice(7).trim();
  if (!audioPath) return null;

  // JSON の文字列は YAML でも有効。特殊文字を含むパスを文字列のまま保つ。
  return `---\naudio: ${JSON.stringify(audioPath)}\n---`;
}
