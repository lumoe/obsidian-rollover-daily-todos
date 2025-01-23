class TodoParser {
  // Support all unordered list bullet symbols as per spec (https://daringfireball.net/projects/markdown/syntax#list)
  bulletSymbols = ["-", "*", "+"];

  // List of strings that include the Markdown content
  #lines;

  // Booleans that encode configurations
  #withChildren;
  #preserveNonBulletPoints;

  constructor(lines, withChildren, preserveNonBulletPoints) {
    this.#lines = lines;
    this.#withChildren = withChildren;
    this.#preserveNonBulletPoints = preserveNonBulletPoints;
  }

  // Returns true if string s is an unfinished todo-item
  #isUnfinishedTodo(s) {
    const r = new RegExp(`\\s*[${this.bulletSymbols.join("")}] \\[[^xX-]\\].*`, "g"); // /\s*[-*+] \[[^xX-]\].*/g;
    return r.test(s);
  }

  // Returns true if string is is a finished todo-item
  #isFinishedTodo(s) {
    const r = new RegExp(`\\s*[${this.bulletSymbols.join("")}] \\[[xX-]\\].*`, "g"); // /\s*[-*+] \[[xX-]\].*/g;
    return r.test(s);
  }

  // Returns true if line after line-number `l` is a nested item
  #hasChildren(l) {
    if (l + 1 >= this.#lines.length) {
      return false;
    }
    const indCurr = this.#getIndentation(l);
    const indNext = this.#getIndentation(l + 1);
    return (indNext > indCurr);
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

  // Returns a list of strings that represents all the todos along with their potential children
  // and (optionally) non-bullet point lines based on the preserveNonBulletPoints setting
  getTodos() {
    let todos = [];
    for (let l = 0; l < this.#lines.length; l++) {
      const line = this.#lines[l];
      if (this.#isUnfinishedTodo(line)) {
        todos.push(line);
        if (this.#withChildren && this.#hasChildren(l)) {
          const cs = this.#getChildren(l);
          todos = [...todos, ...cs];
          l += cs.length;
        }
      } else if (this.#preserveNonBulletPoints && this.#getIndentation(l) === 0 && !this.#isFinishedTodo(line)) {
        todos.push(line);
      }
    }
    return todos;
  }
}

// Utility-function that acts as a thin wrapper around `TodoParser`
export const getTodos = ({ lines, withChildren = false, preserveNonBulletPoints = false }) => {
  const todoParser = new TodoParser(lines, withChildren, preserveNonBulletPoints);
  return todoParser.getTodos();
};
