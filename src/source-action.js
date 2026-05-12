// Pure helpers for what to do with the *source* (yesterday's) note after a
// rollover. Three modes:
//
//   "none"   — leave the source untouched (default, safest)
//   "delete" — splice the rolled lines out of the source (legacy
//              `deleteOnComplete: true` behaviour)
//   "mark"   — rewrite the checkbox content of each rolled todo line on the
//              source side to a configurable marker (e.g. `[>]` for the
//              bullet-journal "forwarded" convention). Non-todo children of
//              rolled parents are left as-is.
//
// Covers #153, #106, #128, #142 and the core "mark instead of delete" part of
// #48. It does not add strikethrough/backlink transformations.

const CHECKBOX_RE = /^(\s*(?:>\s*)*[*+\-] \[).+?(\])/;

/**
 * @param {object} args
 * @param {string} args.content — the source file's current content
 * @param {string[]} args.todos — the lines that were rolled (verbatim)
 * @param {"none"|"delete"|"mark"} args.action
 * @param {string} [args.marker=">"] — single-grapheme marker used by "mark" mode
 * @returns {{ content: string, changed: boolean }}
 */
export function applySourceAction({ content, todos, action, marker = ">" }) {
  if (!action || action === "none" || !todos || todos.length === 0) {
    return { content, changed: false };
  }

  const lines = content.split("\n");
  const todoSet = new Set(todos);

  if (action === "delete") {
    const filtered = lines.filter((l) => !todoSet.has(l));
    const newContent = filtered.join("\n");
    return { content: newContent, changed: newContent !== content };
  }

  if (action === "mark") {
    let changed = false;
    const newLines = lines.map((line) => {
      if (!todoSet.has(line)) return line;
      // only transform actual checkbox lines — children that came along as
      // plain text or sub-bullets are left alone
      if (!CHECKBOX_RE.test(line)) return line;
      const replaced = line.replace(CHECKBOX_RE, `$1${marker}$2`);
      if (replaced !== line) changed = true;
      return replaced;
    });
    return { content: newLines.join("\n"), changed };
  }

  return { content, changed: false };
}

// Resolves the legacy `deleteOnComplete` boolean and the new
// `onRolloverSourceAction` setting into a single concrete action. Used during
// settings load + at rollover time.
export function resolveSourceAction(settings) {
  if (
    settings.onRolloverSourceAction === "none" ||
    settings.onRolloverSourceAction === "delete" ||
    settings.onRolloverSourceAction === "mark"
  ) {
    return settings.onRolloverSourceAction;
  }
  // legacy users: deleteOnComplete=true => "delete", else "none"
  return settings.deleteOnComplete ? "delete" : "none";
}

export function migrateSourceActionSettings(settings, storedSettings = {}) {
  if (
    storedSettings.onRolloverSourceAction === undefined &&
    storedSettings.deleteOnComplete === true
  ) {
    return { ...settings, onRolloverSourceAction: "delete" };
  }
  return settings;
}

export function ensureMarkerInDoneStatusMarkers(settings) {
  if (resolveSourceAction(settings) !== "mark") return settings;

  const marker = settings.rolloverSourceMarker || ">";
  const doneStatusMarkers = settings.doneStatusMarkers || "";
  if (doneStatusMarkers.includes(marker)) return settings;

  return {
    ...settings,
    doneStatusMarkers: `${doneStatusMarkers}${marker}`,
  };
}
