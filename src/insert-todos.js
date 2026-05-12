// Pure helpers for inserting rolled-over todos into today's daily-note content.
// No Obsidian deps — everything operates on strings.

/**
 * Returns true if every line in `todos` is present (verbatim) in `content`.
 * Used as a post-write verification step before the destructive
 * deleteOnComplete branch runs (see issue #162).
 */
export function verifyTodosPresent(content, todos) {
  if (!todos || todos.length === 0) return true;
  const lines = new Set(content.split(/\r?\n/));
  return todos.every((t) => lines.has(t));
}

const HORIZONTAL_RULE = /^[\s>]*-{3,}\s*$/;
const LIST_ITEM = /^\s*[*+\-] /;

function appendToEnd(content, todos) {
  let result = content;
  // (#115) ensure trailing newline before the rolled block so the last
  // existing line isn't merged with the first rolled todo
  if (result.length > 0 && !result.endsWith("\n")) result += "\n";
  result += todos.join("\n");
  // (#115) ensure trailing newline after so subsequent typing doesn't
  // extend the last rolled todo line
  if (!result.endsWith("\n")) result += "\n";
  return result;
}

function insertUnderHeading(lines, heading, todos, opts) {
  const idx = lines.findIndex((l) => l === heading);
  if (idx === -1) return null;

  let insertAt = idx + 1;

  // (#101) skip a horizontal-rule line if one immediately follows the heading,
  // so todos are placed below the rule rather than between heading and rule
  if (
    opts.skipHorizontalRule &&
    insertAt < lines.length &&
    HORIZONTAL_RULE.test(lines[insertAt])
  ) {
    insertAt++;
  }

  // (#132) when requested, walk past any existing list under the heading and
  // append the new todos at the end of that list (rather than directly below
  // the heading)
  let placedBelowExistingList = false;
  if (opts.appendBelowExistingTasks) {
    let walk = insertAt;
    let sawList = false;
    while (walk < lines.length) {
      const l = lines[walk];
      if (LIST_ITEM.test(l)) {
        sawList = true;
        walk++;
      } else if (l.trim() === "" && sawList) {
        // a blank line *between* list items still counts as part of the list
        // run; only break out if we hit a non-list, non-blank line afterwards
        const next = lines[walk + 1];
        if (next !== undefined && LIST_ITEM.test(next)) {
          walk++;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    if (sawList) {
      insertAt = walk;
      placedBelowExistingList = true;
    }
  }

  const newLines = lines.slice();
  // when extending an existing list (#132) we want a clean continuation, no
  // leading blank line; otherwise honour the leadingNewLine setting
  const block =
    opts.leadingNewLine && !placedBelowExistingList ? ["", ...todos] : todos;
  newLines.splice(insertAt, 0, ...block);
  return newLines.join("\n");
}

// (#130) drop todos whose trimmed body already appears in the target content
function dedupAgainstExisting(todos, existingContent) {
  const existingLines = new Set(
    existingContent.split("\n").map((l) => l.trim())
  );
  return todos.filter((t) => !existingLines.has(t.trim()));
}

/**
 * Returns the new content for today's daily note after inserting `todos`.
 *
 * @param {object} args
 * @param {string} args.dailyNoteContent
 * @param {string[]} args.todos
 * @param {string} [args.templateHeading="none"] heading text (e.g. "## Tasks") or "none"
 * @param {boolean} [args.leadingNewLine=true] add blank line between heading and todos
 * @param {boolean} [args.appendBelowExistingTasks=false] place todos at the end of the existing list under the heading (#132)
 * @param {boolean} [args.skipHorizontalRule=true] place todos below a `---` rule that follows the heading (#101)
 * @param {boolean} [args.skipExistingTodos=false] drop todos whose trimmed text already appears in today's note (#130)
 * @returns {{ content: string, templateHeadingFound: boolean, todosInserted: number, todosSkipped: number }}
 */
export function buildNewDailyNoteContent({
  dailyNoteContent,
  todos,
  templateHeading = "none",
  leadingNewLine = true,
  appendBelowExistingTasks = false,
  skipHorizontalRule = true,
  skipExistingTodos = false,
}) {
  const originalCount = todos ? todos.length : 0;
  if (skipExistingTodos && todos && todos.length > 0) {
    todos = dedupAgainstExisting(todos, dailyNoteContent);
  }
  const todosSkipped = originalCount - (todos ? todos.length : 0);

  if (!todos || todos.length === 0) {
    return {
      content: dailyNoteContent,
      templateHeadingFound: false,
      todosInserted: 0,
      todosSkipped,
    };
  }

  if (templateHeading && templateHeading !== "none") {
    const lines = dailyNoteContent.split("\n");
    const newContent = insertUnderHeading(lines, templateHeading, todos, {
      leadingNewLine,
      appendBelowExistingTasks,
      skipHorizontalRule,
    });
    if (newContent !== null) {
      return {
        content: newContent,
        templateHeadingFound: true,
        todosInserted: todos.length,
        todosSkipped,
      };
    }
  }

  return {
    content: appendToEnd(dailyNoteContent, todos),
    templateHeadingFound: false,
    todosInserted: todos.length,
    todosSkipped,
  };
}
