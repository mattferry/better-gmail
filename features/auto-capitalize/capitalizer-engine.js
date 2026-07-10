(function () {
  'use strict';

  // Pure text engine for auto-capitalize (no DOM) — sentence capitalization,
  // standalone "i", contractions, dictionary proper-nouns/acronyms, and multi-word
  // phrase matching, with the caret-aware "don't touch the word still being typed"
  // rule. Ported from Mehul S.'s "Gmail Auto Capitalizer" v4 block engine;
  // extracted here so it is unit-testable under node (see test/).

  const BLOCKED_WORDS = new Set([
    'a', 'an', 'and', 'am', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'go',
    'has', 'have', 'he', 'her', 'his', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'no',
    'not', 'of', 'on', 'or', 'our', 'she', 'so', 'that', 'the', 'then', 'they', 'this',
    'to', 'was', 'we', 'when', 'where', 'who', 'why', 'will', 'with', 'want', 'you',
    'your', 'rest', 'meet', 'flight'
  ]);

  const CONTRACTION_MAP = new Map([
    ['lets', "let's"], ['dont', "don't"], ['doesnt', "doesn't"],
    ['didnt', "didn't"], ['cant', "can't"], ['couldnt', "couldn't"],
    ['shouldnt', "shouldn't"], ['wouldnt', "wouldn't"], ['wont', "won't"],
    ['im', "I'm"], ['ive', "I've"], ['ill', "I'll"],
    ['youre', "you're"], ['youve', "you've"], ['theyre', "they're"],
    ['weve', "we've"], ['thats', "that's"], ['whats', "what's"]
  ]);

  function titleCaseCustomWord(value) {
    return value
      .trim()
      .split(/\s+/)
      .map(function (word) {
        if (!word) return word;
        if (/[A-Z]/.test(word.slice(1))) return word;               // mixed case — keep as typed
        if (word === word.toUpperCase() && word.length > 1) return word; // acronym — keep
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  function tokenize(text) {
    return text.match(/[A-Za-z0-9+#/-]+|[^A-Za-z0-9+#/-]+/g) || [];
  }

  function isWord(token) {
    return /^[A-Za-z0-9+#/-]+$/.test(token);
  }

  function isWhitespace(token) {
    return /^\s+$/.test(token);
  }

  // Build a capitalizer over a word list (single words + multi-word phrases).
  function createCapitalizer(words) {
    const WORD_MAP = new Map();
    const PHRASE_MAP = new Map();

    (words || []).forEach(function (entry) {
      if (typeof entry !== 'string' || !entry.trim()) return;
      const clean = entry.trim();
      const key = clean.toLowerCase();
      if (clean.includes(' ')) {
        PHRASE_MAP.set(key, clean);
      } else if (!BLOCKED_WORDS.has(key)) {
        WORD_MAP.set(key, clean);
      }
    });

    // Normalize then register a user-added word/phrase; returns the stored form,
    // or null when empty/blocked.
    function addCustomWord(value) {
      if (!value || typeof value !== 'string') return null;
      const fixed = titleCaseCustomWord(value);
      const key = fixed.toLowerCase();
      if (!fixed || BLOCKED_WORDS.has(key)) return null;
      if (fixed.includes(' ')) PHRASE_MAP.set(key, fixed);
      else WORD_MAP.set(key, fixed);
      return fixed;
    }

    function getNextWordIndex(tokens, startIndex) {
      for (let i = startIndex; i < tokens.length; i++) {
        if (isWord(tokens[i])) return i;
        if (!isWhitespace(tokens[i])) return -1;
      }
      return -1;
    }

    function getPhraseMatch(tokens, startIndex, skipLast) {
      const wordIndexes = [];
      let searchFrom = startIndex;

      for (let count = 0; count < 4; count++) {
        const wordIndex = count === 0 ? startIndex : getNextWordIndex(tokens, searchFrom);
        if (wordIndex === -1) break;
        if (skipLast && wordIndex === tokens.length - 1) break;
        if (!isWord(tokens[wordIndex])) break;

        wordIndexes.push(wordIndex);
        searchFrom = wordIndex + 1;

        if (wordIndexes.length >= 2) {
          const phrase = wordIndexes.map(function (idx) { return tokens[idx]; }).join(' ');
          const match = PHRASE_MAP.get(phrase.toLowerCase());
          if (match) {
            return { wordIndexes: wordIndexes.slice(), replacementWords: match.split(/\s+/) };
          }
        }
      }
      return null;
    }

    function isUnfinishedLastWord(tokens, caretOffset, textLength) {
      if (caretOffset !== textLength) return false;
      const last = tokens[tokens.length - 1];
      return !!(last && isWord(last));
    }

    function fixWord(word, sentenceStart) {
      const lower = word.toLowerCase();
      let fixed = word;

      if (CONTRACTION_MAP.has(lower)) {
        fixed = CONTRACTION_MAP.get(lower);
      } else if (lower === 'i') {
        fixed = 'I';
      } else if (!BLOCKED_WORDS.has(lower) && WORD_MAP.has(lower)) {
        fixed = WORD_MAP.get(lower);
      }

      if (sentenceStart && /^[a-z]/.test(fixed)) {
        fixed = fixed.charAt(0).toUpperCase() + fixed.slice(1);
      }
      return fixed;
    }

    // Rewrite one block of text. caretOffset marks where the user's caret sits so
    // the word still being typed (caret at end of text) is left alone.
    function fixBlockText(text, caretOffset) {
      const tokens = tokenize(text);
      const skipLast = isUnfinishedLastWord(tokens, caretOffset, text.length);

      let sentenceStart = true;
      let output = '';
      let i = 0;

      while (i < tokens.length) {
        const token = tokens[i];

        if (isWord(token)) {
          if (skipLast && i === tokens.length - 1) {
            output += token;
            i++;
            continue;
          }

          const phraseMatch = getPhraseMatch(tokens, i, skipLast);
          if (phraseMatch) {
            phraseMatch.wordIndexes.forEach(function (wordIndex, pos) {
              while (i < wordIndex) {
                output += tokens[i];
                i++;
              }
              let replacement = phraseMatch.replacementWords[pos] || tokens[wordIndex];
              if (sentenceStart && pos === 0 && /^[a-z]/.test(replacement)) {
                replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
              }
              output += replacement;
              sentenceStart = false;
              i++;
            });
            continue;
          }

          output += fixWord(token, sentenceStart);
          sentenceStart = false;
        } else {
          output += token;
          if (/[.!?]/.test(token)) sentenceStart = true;
        }
        i++;
      }
      return output;
    }

    return { fixBlockText, addCustomWord };
  }

  const api = { createCapitalizer, titleCaseCustomWord, tokenize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).capitalizerEngine = api;
})();
