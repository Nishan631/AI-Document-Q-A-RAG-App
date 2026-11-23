/**
 * Chunking Engine for AI Document RAG
 * 
 * Slices extracted page text into pieces of ~500-800 words (tokens)
 * with a configurable overlap (~100 words) to avoid splitting sentences in half.
 * Crucially preserves the source pageNumber for citation linking.
 */

export const createChunksFromPages = (
  pages,
  options = { chunkSizeWords: 600, overlapWords: 100 }
) => {
  const { chunkSizeWords = 600, overlapWords = 100 } = options;
  const chunks = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageNum = page.pageNumber;
    const pageText = (page.text || '').trim();

    if (!pageText) continue;

    // Split text into sentences/paragraphs to preserve semantic coherence
    const sentences = splitIntoSentences(pageText);
    let currentChunkWords = [];
    let currentWordCount = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;

      const sentenceWords = sentence.split(/\s+/).filter(Boolean);

      // If adding this sentence exceeds chunk size and we already have words
      if (currentWordCount + sentenceWords.length > chunkSizeWords && currentChunkWords.length > 0) {
        const chunkText = currentChunkWords.join(' ');
        chunks.push({
          chunkIndex: globalChunkIndex++,
          pageNumber: pageNum,
          text: chunkText,
          wordCount: currentWordCount,
        });

        // Slide window by keeping the last `overlapWords`
        const overlapSlice = currentChunkWords.slice(-overlapWords);
        currentChunkWords = [...overlapSlice, ...sentenceWords];
        currentWordCount = currentChunkWords.length;
      } else {
        currentChunkWords.push(...sentenceWords);
        currentWordCount += sentenceWords.length;
      }
    }

    // Push the remaining words for this page
    if (currentChunkWords.length > 0) {
      const chunkText = currentChunkWords.join(' ');
      chunks.push({
        chunkIndex: globalChunkIndex++,
        pageNumber: pageNum,
        text: chunkText,
        wordCount: currentWordCount,
      });
    }
  }

  return chunks;
};

/**
 * Splits string by sentence boundaries (.!?) or newlines without destroying punctuation
 */
function splitIntoSentences(text) {
  // Normalize double newlines into distinct separators
  const paragraphs = text.split(/\n\s*\n/);
  const result = [];

  for (const paragraph of paragraphs) {
    // Regex matching sentence endings followed by space or end of line
    const matchedSentences = paragraph.match(/[^.!?\n]+[.!?]+(?:\s+|$)|[^.!?\n]+$/g);
    if (matchedSentences) {
      for (const s of matchedSentences) {
        if (s.trim()) result.push(s.trim());
      }
    } else if (paragraph.trim()) {
      result.push(paragraph.trim());
    }
  }

  return result;
}
