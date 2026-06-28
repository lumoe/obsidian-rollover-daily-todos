class TodoParser {
  // Support all unordered list bullet symbols as per spec (https://daringfireball.net/projects/markdown/syntax#list)
  bulletSymbols = ["-", "*", "+"];

  // Default completed status markers
  doneStatusMarkers = ["x", "X", "-"];

  // List of strings that include the Markdown content
  #lines;

  // Boolean that encodes whether nested items should be rolled over
  #withChildren;

  // Parse content with segmentation to allow for Unicode grapheme clusters
  #parseIntoChars(content, contentType = "content") {
    // Use Intl.Segmenter to properly split grapheme clusters if available,
    // otherwise fall back to Array.from. The fallback should not trigger in
    // Obsidian since it uses Electron which supports Intl.Segmenter.
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
      return Array.from(segmenter.segment(content), (s) => s.segment);
    } else {
      // Array.from() splits surrogate pairs correctly but not complex grapheme clusters
      // (e.g., 👨‍👩‍👧‍👦 would be split incorrectly) and fail to match.
      console.error(
        `Intl.Segmenter not available, falling back to Array.from() for ${contentType}`
      );
      return Array.from(content);
    }
  }

  constructor(lines, withChildren, doneStatusMarkers) {
    this.#lines = lines;
    this.#withChildren = withChildren;
    if (doneStatusMarkers) {
      this.doneStatusMarkers = this.#parseIntoChars(
        doneStatusMarkers,
        "done status markers"
      );
    }
  }

  // Returns the single status marker of a well-formed checkbox line, or null
  // if the line is not a valid checkbox todo-item
  #checkboxMarker(s) {
    const match = s.match(/\s*[*+-] \[(.+?)\]/);
    if (!match) return null;

    const contentChars = this.#parseIntoChars(match[1], "checkbox content");

    // A valid marker is exactly one grapheme cluster and not a bare modifier
    if (contentChars.length !== 1) return null;
    const graphemeModifiers = ["\u202E", "\u200B", "\u200C", "\u200D"];
    if (graphemeModifiers.includes(contentChars[0])) return null;

    return contentChars[0];
  }

  // Returns true if string s is an unfinished todo-item
  #isTodo(s) {
    const marker = this.#checkboxMarker(s);
    return marker !== null && !this.doneStatusMarkers.includes(marker);
  }

  // Returns true if string s is a completed todo-item
  #isCompletedTodo(s) {
    const marker = this.#checkboxMarker(s);
    return marker !== null && this.doneStatusMarkers.includes(marker);
  }

  // Returns true if line after line-number `l` is a nested item
  #hasChildren(l) {
    if (l + 1 >= this.#lines.length) {
      return false;
    }
    const indCurr = this.#getIndentation(l);
    const indNext = this.#getIndentation(l + 1);
    if (indNext > indCurr) {
      return true;
    }
    return false;
  }

  // Returns a list of strings that are the nested items after line `parentLinum`
  #getChildren(parentLinum) {
    const children = [];
    let nextLinum = parentLinum + 1;
    while (this.#isChildOf(parentLinum, nextLinum)) {
      children.push(this.#lines[nextLinum]);
      nextLinum++;
    }
    return children;
  }

  // Returns true if line `linum` has more indentation than line `parentLinum`
  #isChildOf(parentLinum, linum) {
    if (parentLinum >= this.#lines.length || linum >= this.#lines.length) {
      return false;
    }
    return this.#getIndentation(linum) > this.#getIndentation(parentLinum);
  }

  // Returns the number of whitespace-characters at beginning of string at line `l`
  #getIndentation(l) {
    return this.#lines[l].search(/\S/);
  }

  // Returns a list of strings that represents all the todos along with there potential children
  getTodos() {
    let todos = [];
    for (let l = 0; l < this.#lines.length; l++) {
      const line = this.#lines[l];
      if (this.#isTodo(line)) {
        todos.push(line);
        if (this.#withChildren && this.#hasChildren(l)) {
          const cs = this.#getChildren(l);
          todos = [...todos, ...cs];
          l += cs.length;
        }
      }
    }
    return todos;
  }

  // Returns true if the line at `l` is empty or whitespace-only
  #isBlank(l) {
    return this.#getIndentation(l) === -1;
  }

  // Returns the index one past the last line nested under line `l`. A blank
  // line is absorbed into the subtree only when a more-indented line follows
  // it, so a stray blank line cannot detach a completed parent from a nested
  // open todo. Trailing blank lines are excluded.
  #getSubtreeEnd(l) {
    const parentIndentation = this.#getIndentation(l);
    let lastNested = l;
    for (let i = l + 1; i < this.#lines.length; i++) {
      if (this.#isBlank(i)) continue;
      if (this.#getIndentation(i) <= parentIndentation) break;
      lastNested = i;
    }
    return lastNested + 1;
  }

  #subtreeHasOpenTodo(start, end) {
    for (let i = start; i < end; i++) {
      if (this.#isTodo(this.#lines[i])) return true;
    }
    return false;
  }

  // Returns the lines with every completed todo-subtree that has no remaining
  // open todo removed. A completed todo with an open descendant is kept so the
  // open item retains its context, while fully-completed branches beneath it
  // are still pruned.
  getLinesWithCompletedTodosPruned() {
    const keep = new Array(this.#lines.length).fill(true);

    for (let l = 0; l < this.#lines.length; ) {
      if (!this.#isCompletedTodo(this.#lines[l])) {
        l++;
        continue;
      }

      const end = this.#getSubtreeEnd(l);
      if (this.#subtreeHasOpenTodo(l + 1, end)) {
        // Descend into the subtree to prune its fully-completed branches
        l++;
        continue;
      }

      for (let i = l; i < end; i++) keep[i] = false;
      l = end;
    }

    return this.#lines.filter((_, i) => keep[i]);
  }
}

// Utility-function that acts as a thin wrapper around `TodoParser`
export const getTodos = ({
  lines,
  withChildren = false,
  doneStatusMarkers = null,
}) => {
  const todoParser = new TodoParser(lines, withChildren, doneStatusMarkers);
  return todoParser.getTodos();
};

// Utility-function that removes completed todo-subtrees with no open todo left
export const pruneCompletedTodos = ({ lines, doneStatusMarkers = null }) => {
  const todoParser = new TodoParser(lines, false, doneStatusMarkers);
  return todoParser.getLinesWithCompletedTodosPruned();
};
