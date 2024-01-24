class TodoParser {
  // Support all unordered list bullet symbols as per spec (https://daringfireball.net/projects/markdown/syntax#list)
  bulletSymbols = ["-", "*", "+"];

  // List of strings that include the Markdown content
  #lines;

  // Boolean that encodes whether nested items should be rolled over
  #withChildren;

  // Boolean that encodes whether sub-headings of nested items should be rolled over. Only relevant when #withChildren is true.
  #withSubheadings;

  // Boolean that encodes whether bullets should be rolled over.
  #withBullets;

  // Boolean that encodes whether children should have existing filters applied
  #filterChildren;

  // Boolean that encodes whether completed children should be rolled over. Only relevant when #withChildren is true and #filterChildren is true.
  #withCompletedChildren;

  constructor(lines, withChildren, withSubheadings, withBullets, filterChildren, withCompletedChildren) {
    this.#lines = lines;
    this.#withChildren = withChildren;
    this.#withSubheadings = withChildren && withSubheadings;
    this.#withBullets = withBullets;
    this.#filterChildren = filterChildren;
    this.#withCompletedChildren = withCompletedChildren;
  }

  // Returns true if string s is a todo-item
  #isTodo(s) {
    const r = new RegExp(`\\s*[${this.bulletSymbols.join("")}] \\[[^xX-]\\].*`, "g"); // /\s*[-*+] \[[^xX-]\].*/g;
    return r.test(s);
  }

  // Returns true if the string is a completed todo-item
  #isCompletedTodo(s) {
    const r = new RegExp(`\\s*[${this.bulletSymbols.join("")}] \\[[xX-]\\].*`, "g"); // /\s*[-*+] \[[^xX-]\].*/g;
    return r.test(s);
  }

  // Returns true if the string is a bulleted list item (optionally included as a todo-item)
  #isBullet(s) {
    const r = new RegExp(`\\s*[${this.bulletSymbols.join("")}] (?!\\[[^xX]]).*`, "g"); // /\s*[-*+] \[[^xX-]\].*/g;
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

    if (this.#withBullets) {
      return this.#isBullet(line);
    }

    return this.#withSubheadings && this.#isHeading(line);
  }

  // Returns a list of strings that represents all the todos along with there potential children
  getTodos() {
    let todos = [];
    for (let l = 0; l < this.#lines.length; l++) {
      const line = this.#lines[l];
      if (this.#isTodo(line) || (l !== 0 && this.#withSubheadings && this.#isHeading(line)) || (this.#withBullets && this.#isBullet(line))) {
        todos.push(line);
        if (this.#withChildren && this.#hasChildren(l)) {
          const cs = this.#getChildren(l).filter(c => {
            if (!this.#withCompletedChildren && this.#isCompletedTodo(c)) {
              return false;
            }
            return (!this.#filterChildren || this.isRelevant(c));
          });
          todos = [...todos, ...cs];
          l += cs.length;
        }
      }
    }
    return todos;
  }
}

// Utility-function that acts as a thin wrapper around `TodoParser`
export const getTodos = ({ lines, withChildren = false , withSubHeadings = false, withBullets = false, filterChildren = false, withCompletedChildren = true}) => {
  const todoParser = new TodoParser(lines, withChildren, withSubHeadings, withBullets, filterChildren, withCompletedChildren);
  return todoParser.getTodos();
};
