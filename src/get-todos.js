class TodoParser {
  // Support all unordered list bullet symbols as per spec (https://daringfireball.net/projects/markdown/syntax#list)
  bulletSymbols = ["-", "*", "+"];

  // List of strings that include the Markdown content
  #lines;

  // Boolean that encodes whether nested items should be rolled over
  #withChildren;

  // Boolean that encodes whether sub-headings of nested items should be rolled over. Only relevant when #withChildren is true.
  #withSubheadings;

  constructor(lines, withChildren, withSubheadings) {
    this.#lines = lines;
    this.#withChildren = withChildren;
    this.#withSubheadings = withChildren && withSubheadings;
  }

  // Returns true if string s is a todo-item
  #isTodo(s) {
    const r = new RegExp(`\\s*[${this.bulletSymbols.join("")}] \\[[^xX-]].*`, "g"); // /\s*[-*+] \[[^xX-]\].*/g;
    return r.test(s);
  }

  // Returns true if the string is a heading
  #isHeading(s) {
    const h = new RegExp(`\\s*#+.*`, "g");
    return h.test(s);
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

  isRelevant(line) {
    if (this.#isTodo(line)) {
      return true;
    }
    return this.#withSubheadings && this.#isHeading(line);
  }

  // Returns a list of strings that represents all the todos along with there potential children
  getTodos() {
    let todos = [];
    for (let l = 0; l < this.#lines.length; l++) {
      const line = this.#lines[l];
      if (this.#isTodo(line) || (l !== 0 && this.#withSubheadings && this.#isHeading(line))) {
        todos.push(line);
        if (this.#withChildren && this.#hasChildren(l)) {
          const cs = this.#getChildren(l).filter(c => this.isRelevant(c));
          todos = [...todos, ...cs];
          l += cs.length;
        }
      }
    }
    return todos;
  }
}

// Utility-function that acts as a thin wrapper around `TodoParser`
export const getTodos = ({ lines, withChildren = false , withSubHeadings = false}) => {
  const todoParser = new TodoParser(lines, withChildren, withSubHeadings);
  return todoParser.getTodos();
};
