// Section-aware rollover: parse yesterday's note into heading-keyed buckets,
// then insert each bucket under the matching heading in today's note (case-
// insensitive, level-agnostic). Buckets with no matching heading in today's
// note (and the implicit "no source heading" bucket) are appended at the end.
//
// Covers heading-preservation requests #143, #37, #33, #164. It is related
// to, but does not fully close, source-filter requests #68, #54, #126, #150.
// Adapted from PR #167.

import { getTodos } from "./get-todos";
import { buildNewDailyNoteContent } from "./insert-todos";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const HORIZONTAL_RULE_RE = /^\s*-{3,}\s*$/;
// "no source heading" bucket key — Map keys are sentinel-checked with ===
const NO_HEADING = Symbol("no-heading");

/**
 * Group todos by the heading they live under in `lines`. Returns a Map keyed
 * by the *heading text* (without the leading `#`s, lower-cased and trimmed)
 * with values `{ headingLine, todos[] }`. Todos before any heading land in a
 * special bucket keyed by NO_HEADING.
 *
 * @returns {Map}
 */
export function getTodosBySection({
  lines,
  withChildren = false,
  doneStatusMarkers = null,
  ignoreBlockquotes = false,
  skipCompletedChildren = false,
}) {
  const sections = new Map();
  let currentKey = NO_HEADING;
  let currentHeadingLine = null;
  let segmentStart = 0;

  const flush = (endIdx) => {
    if (segmentStart >= endIdx) return;
    const segment = lines.slice(segmentStart, endIdx);
    const todos = getTodos({
      lines: segment,
      withChildren,
      doneStatusMarkers,
      ignoreBlockquotes,
      skipCompletedChildren,
    });
    if (todos.length === 0) return;
    const existing = sections.get(currentKey);
    if (existing) {
      existing.todos.push(...todos);
    } else {
      sections.set(currentKey, {
        headingLine: currentHeadingLine,
        todos,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) {
      flush(i);
      currentKey = m[2].trim().toLowerCase();
      currentHeadingLine = lines[i];
      segmentStart = i + 1;
    } else if (HORIZONTAL_RULE_RE.test(lines[i])) {
      flush(i);
      currentKey = NO_HEADING;
      currentHeadingLine = null;
      segmentStart = i + 1;
    }
  }
  flush(lines.length);

  return sections;
}

// Find a heading line in `lines` whose text matches `headingText` (case-
// insensitive, ignoring the leading `#`s). Returns the matched line as it
// appears in the file (so `buildNewDailyNoteContent` can splice on it), or
// null if no match.
export function findMatchingHeading(lines, headingTextLower) {
  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m && m[2].trim().toLowerCase() === headingTextLower) return line;
  }
  return null;
}

/**
 * Build today's content by routing each section bucket from `todosBySection`
 * to the matching heading in today's note. Unmatched buckets and the
 * NO_HEADING bucket are appended at the end (or under `fallbackHeading` if
 * provided). Returns { content, matchedSections, unmatchedSections }.
 */
export function buildSectionRoutedContent({
  dailyNoteContent,
  todosBySection,
  fallbackHeading = "none",
  leadingNewLine = true,
  appendBelowExistingTasks = false,
  skipHorizontalRule = true,
  skipExistingTodos = false,
}) {
  let content = dailyNoteContent;
  const unmatched = [];
  const matched = [];

  for (const [key, bucket] of todosBySection) {
    if (key === NO_HEADING) {
      unmatched.push(...bucket.todos);
      continue;
    }
    const todayLines = content.split("\n");
    const matchLine = findMatchingHeading(todayLines, key);
    if (matchLine) {
      const result = buildNewDailyNoteContent({
        dailyNoteContent: content,
        todos: bucket.todos,
        templateHeading: matchLine,
        leadingNewLine,
        appendBelowExistingTasks,
        skipHorizontalRule,
        skipExistingTodos,
      });
      content = result.content;
      matched.push(matchLine);
    } else {
      unmatched.push(...bucket.todos);
    }
  }

  if (unmatched.length > 0) {
    const result = buildNewDailyNoteContent({
      dailyNoteContent: content,
      todos: unmatched,
      templateHeading: fallbackHeading,
      leadingNewLine,
      appendBelowExistingTasks,
      skipHorizontalRule,
      skipExistingTodos,
    });
    content = result.content;
  }

  return {
    content,
    matchedSections: matched,
    unmatchedTodoCount: unmatched.length,
  };
}

export const SECTION_ROUTING_INTERNALS = { NO_HEADING };
