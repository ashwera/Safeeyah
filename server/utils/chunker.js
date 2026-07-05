function chunkByAyah(rawText) {
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strategy 1 — "surah:ayah" at the start of a line (e.g. "2:3" or "15:1 [Arabic]")
  // Handles both: reference on its own line (14.pdf) and reference + Arabic on same line (15.pdf)
  const parts = text
    .split(/\n(?=\d+:\d+)/)
    .map((p) => p.trim())
    .filter((p) => /^\d+:\d+/.test(p));
  if (parts.length > 0) return parts;

  // Strategy 2 — numbered verses: "1. text", "1) text", or "(1) text"
  const versePattern = /(?:^|\n)(?:\(\d+\)|\d+[.)]) /g;
  const verseMatches = [...text.matchAll(versePattern)];
  if (verseMatches.length > 1) {
    const chunks = [];
    for (let i = 0; i < verseMatches.length; i++) {
      const start = verseMatches[i].index;
      const end = verseMatches[i + 1]?.index ?? text.length;
      const chunk = text.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  // Strategy 3 — one non-empty line per ayah
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 1) return lines;

  // Strategy 4 — sentence-boundary splitting (fallback for dense/unstructured text)
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if (current.length + s.length > 300 && current.length > 0) {
      chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Builds the string that gets embedded — "Quran 2:3 - {translation only}".
// Arabic text is kept out of the embedding (poor signal for English queries)
// but stays in the raw chunk metadata so the LLM can quote it.
function extractEmbedText(chunk) {
  const lines = chunk.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  // Reference may be alone ("14:1") or share a line with Arabic ("15:1 ￿￿￿")
  const refMatch = lines[0]?.match(/^(\d+:\d+)/);
  if (!refMatch) return chunk;

  const ref = refMatch[1];
  const translationLines = lines
    .slice(1) // skip first line (reference + possibly Arabic)
    .filter((l) =>
      !/[؀-ۿ�]/.test(l) && // skip Arabic script and garbled replacement chars
      !l.startsWith("—") &&       // skip translator attribution (— Dr. Mustafa...)
      !l.startsWith("–")
    );
  const translation = translationLines.join(" ").trim();
  return `Quran ${ref} - ${translation}`;
}

export { chunkByAyah, extractEmbedText };
