class TodoParser {
  // Support all unordered list bullet symbols as per spec (https://daringfireball.net/projects/markdown/syntax#list)
  bulletSymbols = ["-", "*", "+"];

  // List of strings that include the Markdown content
  #lines;

  // Boolean that encodes whether nested items should be rolled over
  #withChildren;

  // string that defines the searched heading or none
  #dailyNoteHeading;

  constructor(lines, withChildren, dailyNoteHeading) {
    this.#lines = lines;
    this.#withChildren = withChildren;
    this.#dailyNoteHeading = dailyNoteHeading;
  }

  // Returns true if string s is a todo-item
  #isTodo(s) {
    const r = new RegExp(
      `\\s*[${this.bulletSymbols.join("")}] \\[[^xX-]\\].*`,
      "g"
    ); // /\s*[-*+] \[[^xX-]\].*/g;
    return r.test(s);
  }

  // Returns true if the line is a todo item under the correct heading
  #isChildOfHeading(line) {
    // if not set its valid under every heading
    if (this.#dailyNoteHeading === "none") {
      return true;
    }

    let currentHeading = null;

    // Regex to detect headings (e.g., ## or ###)
    const headingRegex = /^#{1,}\s*(.+)/;

    // Find the index of the current line
    const lineIndex = this.#lines.indexOf(line);

    // Iterate backwards from the current line to find the closest heading
    for (let i = lineIndex; i >= 0; i--) {
      const prevLine = this.#lines[i];
      const headingMatch = prevLine.match(headingRegex);

      if (headingMatch) {
        // If a heading is found, set it as the current heading and stop
        currentHeading = headingMatch[1].trim();
        break;
      }
    }

    // Check if the current heading matches the target heading
    return currentHeading === this.#dailyNoteHeading;
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
      if (this.#isTodo(line) && this.#isChildOfHeading(line)) {
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
}

// Utility-function that acts as a thin wrapper around `TodoParser`
export const getTodos = ({ lines, dailyNoteHeading, withChildren = false }) => {
  const todoParser = new TodoParser(lines, withChildren, dailyNoteHeading);
  return todoParser.getTodos();
};
