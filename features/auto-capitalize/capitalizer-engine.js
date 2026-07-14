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
    // sentenceStartInitial (default true) lets per-node callers carry sentence
    // state across text nodes — see fixTextNodes.
    function fixBlockText(text, caretOffset, sentenceStartInitial, opts) {
      return fixBlockDetailed(text, caretOffset, sentenceStartInitial, opts).text;
    }

    // Full-detail variant: returns { text, caret } where `caret` is the caret's
    // EXACT position in the rewritten text, tracked through the token walk (a
    // blanket "shift by total length change" moved the caret even when the
    // change happened after it — QA-proven drift). opts.skipFirstWord /
    // opts.skipLastWord force those words to pass through verbatim — used by
    // fixTextNodes when a word straddles a text-node boundary (a leading
    // fragment like "im" of "important" must never be contraction-"fixed").
    function fixBlockDetailed(text, caretOffset, sentenceStartInitial, opts) {
      const options = opts || {};
      const tokens = tokenize(text);
      const skipLast = isUnfinishedLastWord(tokens, caretOffset, text.length) || !!options.skipLastWord;
      const skipFirst = !!options.skipFirstWord;
      const trackCaret = typeof caretOffset === 'number' && caretOffset >= 0;

      let sentenceStart = sentenceStartInitial !== false;
      let output = '';
      let outCaret = null;
      let inPos = 0;
      let firstWordSeen = false;
      let i = 0;

      // Every append goes through emit() so the caret can be mapped exactly:
      // inside an unchanged token it keeps its offset; inside a replaced token
      // it clamps to the replacement's length.
      function emit(origToken, replacement) {
        if (trackCaret && outCaret === null && caretOffset >= inPos && caretOffset <= inPos + origToken.length) {
          outCaret = output.length + Math.min(caretOffset - inPos, replacement.length);
        }
        output += replacement;
        inPos += origToken.length;
      }

      while (i < tokens.length) {
        const token = tokens[i];

        if (isWord(token)) {
          const isFirstWord = !firstWordSeen;
          firstWordSeen = true;

          if ((skipLast && i === tokens.length - 1) || (skipFirst && isFirstWord)) {
            emit(token, token);
            sentenceStart = false;
            i++;
            continue;
          }

          const phraseMatch = getPhraseMatch(tokens, i, skipLast);
          if (phraseMatch) {
            phraseMatch.wordIndexes.forEach(function (wordIndex, pos) {
              while (i < wordIndex) {
                emit(tokens[i], tokens[i]);
                i++;
              }
              let replacement = phraseMatch.replacementWords[pos] || tokens[wordIndex];
              if (sentenceStart && pos === 0 && /^[a-z]/.test(replacement)) {
                replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
              }
              emit(tokens[wordIndex], replacement);
              sentenceStart = false;
              i++;
            });
            continue;
          }

          emit(token, fixWord(token, sentenceStart));
          sentenceStart = false;
        } else {
          emit(token, token);
          if (/[.!?]/.test(token)) sentenceStart = true;
        }
        i++;
      }
      if (trackCaret && outCaret === null) outCaret = output.length;
      return { text: output, caret: outCaret };
    }

    // Per-text-node rewrite (audit fix 2026-07-14). The old whole-block rewrite
    // concatenated every text node's content into the first node and blanked the
    // rest, destroying inline formatting (links/bold/italic) and — when the block
    // resolved to the whole editor — flattening multi-line drafts into one line.
    // Rewriting each node separately can never corrupt structure; the trade-off
    // is that words/phrases split across inline elements are no longer matched
    // (and, deliberately, never "fixed": a word FRAGMENT at a node seam — e.g.
    // "im" of "im|portant" split by bold — passes through verbatim, because
    // contraction-fixing a fragment injects characters into the user's word).
    // `values` are the text nodes' strings in document order; caretNodeIndex /
    // caretOffsetInNode locate the user's caret. Returns { changed, newValues,
    // caretOffset } where caretOffset is the caret's exact new position within
    // its node's rewritten text (null when no caret node was given).
    function fixTextNodes(values, caretNodeIndex, caretOffsetInNode) {
      const wordEdge = /[A-Za-z0-9+#/-]/;
      const newValues = [];
      let sentenceStart = true;
      let changed = false;
      let newCaretOffset = caretNodeIndex >= 0 && typeof caretOffsetInNode === 'number' ? caretOffsetInNode : null;
      const vals = values || [];
      vals.forEach(function (value, i) {
        const text = String(value == null ? '' : value);
        const isCaretNode = i === caretNodeIndex;
        const prev = i > 0 ? String(vals[i - 1] == null ? '' : vals[i - 1]) : '';
        const next = i < vals.length - 1 ? String(vals[i + 1] == null ? '' : vals[i + 1]) : '';
        const opts = {
          skipFirstWord: !!(prev && wordEdge.test(prev.charAt(prev.length - 1)) && text && wordEdge.test(text.charAt(0))),
          skipLastWord: !!(next && wordEdge.test(next.charAt(0)) && text && wordEdge.test(text.charAt(text.length - 1)))
        };
        const res = fixBlockDetailed(text, isCaretNode ? caretOffsetInNode : -1, sentenceStart, opts);
        if (res.text !== text) {
          changed = true;
          if (isCaretNode) newCaretOffset = res.caret;
        }
        newValues.push(res.text);
        sentenceStart = sentenceStartAfter(text, sentenceStart);
      });
      return { changed, newValues, caretOffset: newCaretOffset };
    }

    return { fixBlockText, fixTextNodes, addCustomWord };
  }

  // Walk a text's tokens the same way fixBlockText does and return whether the
  // NEXT text would begin at a sentence start — used to carry sentence state
  // across sibling text nodes so a node beginning mid-sentence isn't wrongly
  // treated as a sentence start.
  function sentenceStartAfter(text, initial) {
    let flag = initial !== false;
    for (const token of tokenize(String(text == null ? '' : text))) {
      if (isWord(token)) flag = false;
      else if (/[.!?]/.test(token)) flag = true;
    }
    return flag;
  }

  const api = { createCapitalizer, titleCaseCustomWord, tokenize, sentenceStartAfter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).capitalizerEngine = api;
})();
