class TodoParser {
  // Support all unordered list bullet symbols as per spec (https://daringfireball.net/projects/markdown/syntax#list)
  bulletSymbols = ["-", "*", "+"];

  // Default completed status markers
  doneStatusMarkers = ["x", "X", "-"];

  // List of strings that include the Markdown content
  #lines;

  // Boolean that encodes whether nested items should be rolled over
  #withChildren;

  // (#165) Boolean: when true, lines whose first non-whitespace char is `>`
  // (i.e. blockquotes / callouts like `> [!tip]`) are not treated as todos.
  #ignoreBlockquotes;

  // (#125) When true, completed-todo children (and their descendants) are
  // dropped during the children walk. Non-todo children (text/sub-bullets)
  // are unaffected. Only meaningful when #withChildren is true.
  #skipCompletedChildren;

  // Parse content with segmentation to allow for Unicode grapheme clusters
  #parseIntoChars(content, contentType = "content") {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
      return Array.from(segmenter.segment(content), (s) => s.segment);
    } else {
      console.error(
        `Intl.Segmenter not available, falling back to Array.from() for ${contentType}`
      );
      return Array.from(content);
    }
  }

  constructor(
    lines,
    withChildren,
    doneStatusMarkers,
    ignoreBlockquotes,
    skipCompletedChildren
  ) {
    this.#lines = lines;
    this.#withChildren = withChildren;
    this.#ignoreBlockquotes = !!ignoreBlockquotes;
    this.#skipCompletedChildren = !!skipCompletedChildren;
    if (doneStatusMarkers) {
      this.doneStatusMarkers = this.#parseIntoChars(
        doneStatusMarkers,
        "done status markers"
      );
    }
  }

  // Returns true if the line is a checkbox whose content is a done marker.
  // (Distinct from #isTodo which is true only for *incomplete* todos.)
  #isDoneTodo(s) {
    if (this.#ignoreBlockquotes && /^\s*>/.test(s)) {
      return false;
    }
    const match = s.match(/^\s*(?:>\s*)*[*+\-] \[(.+?)\]/);
    if (!match) return false;
    const contentChars = this.#parseIntoChars(match[1], "checkbox content");
    if (contentChars.length !== 1) return false;
    return contentChars.some((c) => this.doneStatusMarkers.includes(c));
  }

  // Returns true if string s is a todo-item
  #isTodo(s) {
    // (#165) optionally skip blockquoted / callout lines (those whose first
    // non-whitespace char is `>`)
    if (this.#ignoreBlockquotes && /^\s*>/.test(s)) {
      return false;
    }

    // (cluster A / PR #170) anchor to start of line so bullet patterns
    // embedded in code blocks / template literals are not matched. Allow
    // Markdown blockquote prefixes so PR #165 can control callout behavior
    // through the ignoreBlockquotes setting instead of dropping them always.
    const match = s.match(/^\s*(?:>\s*)*[*+\-] \[(.+?)\]/);
    if (!match) return false;

    const checkboxContent = match[1];

    const contentChars = this.#parseIntoChars(
      checkboxContent,
      "checkbox content"
    );

    // Valid checkbox content must be exactly one grapheme cluster
    if (contentChars.length !== 1) {
      return false;
    }

    // Exclude grapheme modifiers that are not valid as standalone content
    const graphemeModifiers = ["‮", "​", "‌", "‍"];
    const hasGraphemeModifier = contentChars.some((char) =>
      graphemeModifiers.includes(char)
    );
    if (hasGraphemeModifier) {
      return false;
    }

    const hasDoneMarker = contentChars.some((char) =>
      this.doneStatusMarkers.includes(char)
    );
    return !hasDoneMarker;
  }

  // Returns true if line after line-number `l` is a nested item
  #hasChildren(l) {
    if (l + 1 >= this.#lines.length) return false;
    const indCurr = this.#getIndentation(l);
    const indNext = this.#getIndentation(l + 1);
    return indNext > indCurr;
  }

  // Returns { children, consumed } — children is the list of nested items to
  // include after line `parentLinum`; consumed is the number of source lines
  // actually walked (which can exceed children.length when skipping).
  #getChildren(parentLinum) {
    const children = [];
    let nextLinum = parentLinum + 1;
    while (this.#isChildOf(parentLinum, nextLinum)) {
      const line = this.#lines[nextLinum];
      if (this.#skipCompletedChildren && this.#isDoneTodo(line)) {
        // (#125) drop this completed child *and its descendants*
        const completedChildIndent = this.#getIndentation(nextLinum);
        nextLinum++;
        while (
          nextLinum < this.#lines.length &&
          this.#getIndentation(nextLinum) > completedChildIndent
        ) {
          nextLinum++;
        }
        continue;
      }
      children.push(line);
      nextLinum++;
    }
    return { children, consumed: nextLinum - parentLinum - 1 };
  }

  #isChildOf(parentLinum, linum) {
    if (parentLinum >= this.#lines.length || linum >= this.#lines.length) {
      return false;
    }
    return this.#getIndentation(linum) > this.#getIndentation(parentLinum);
  }

  #getIndentation(l) {
    return this.#lines[l].search(/\S/);
  }

  getTodos() {
    let todos = [];
    for (let l = 0; l < this.#lines.length; l++) {
      const line = this.#lines[l];
      if (this.#isTodo(line)) {
        todos.push(line);
        if (this.#withChildren && this.#hasChildren(l)) {
          const { children, consumed } = this.#getChildren(l);
          todos = [...todos, ...children];
          l += consumed;
        }
      }
    }
    return todos;
  }
}

export const getTodos = ({
  lines,
  withChildren = false,
  doneStatusMarkers = null,
  ignoreBlockquotes = false,
  skipCompletedChildren = false,
}) => {
  const todoParser = new TodoParser(
    lines,
    withChildren,
    doneStatusMarkers,
    ignoreBlockquotes,
    skipCompletedChildren
  );
  return todoParser.getTodos();
};
