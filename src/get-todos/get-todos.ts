class TodoParser {
  // List of strings that include the Markdown content
  private lines: string[];

  // Boolean that encodes whether nested items should be rolled over
  private withChildren: boolean;

  constructor(lines: string[], withChildren: boolean) {
    this.lines = lines;
    this.withChildren = withChildren;
  }

  // Returns true if string s is a todo-item
  private isTodo(s: string): boolean {
    const r = /\s*- \[ \].*/g;
    return r.test(s);
  }

  // Returns true if string s is a completed todo-item
  private isCompletedTodo(s: string): boolean {
    const r = /\s*- \[x\].*/g;
    return r.test(s);
  }

  // Returns true if line after line-number `l` is a nested item
  private hasChildren(l: number): boolean {
    if (l + 1 >= this.lines.length) {
      return false;
    }
    const indCurr = this.getIndentation(l);
    const indNext = this.getIndentation(l + 1);
    if (indNext > indCurr) {
      return true;
    }
    return false;
  }

  private getNumChildren(parentLinum: number): number {
    if (parentLinum + 1 >= this.lines.length) {
      return 0;
    }

    let numChildren = 0;

    for (let l = parentLinum + 1; l < this.lines.length; l++) {
      if (this.isChildof(parentLinum, l)) {
        numChildren++;
      } else {
        break;
      }
    }

    return numChildren;
  }

  // Returns a list of strings that are the nested items after line `parentLinum`
  private getChildren(parentLinum: number): Array<string> {
    const children = [];
    let nextLinum = parentLinum + 1;
    while (this.isChildof(parentLinum, nextLinum)) {
      if (this.isCompletedTodo(this.lines[nextLinum])) {
        if (this.hasChildren(nextLinum)) {
          nextLinum += this.getNumChildren(nextLinum);
        }
      } else {
        children.push(this.lines[nextLinum]);
      }
      nextLinum++;
    }
    return children;
  }

  // Returns true if line `linum` has more indentation than line `parentLinum`
  private isChildof(parentLinum: number, linum: number): boolean {
    if (parentLinum >= this.lines.length || linum >= this.lines.length) {
      return false;
    }
    const parentIndentation = this.getIndentation(parentLinum);
    const currIndentation = this.getIndentation(linum);
    return currIndentation > parentIndentation;
  }

  // Returns the number of whitespace-characters at beginning of string at line `l`
  private getIndentation(l: number) {
    if (this.lines[l].trim().length < 1) {
      return 0;
    }
    return this.lines[l].search(/\S/);
  }

  // Returns a list of strings that represents all the todos along with there potential children
  public getTodos() {
    let todos: string[] = [];
    for (let l = 0; l < this.lines.length; l++) {
      const line = this.lines[l];
      if (this.isTodo(line)) {
        todos.push(line);
        if (this.withChildren && this.hasChildren(l)) {
          const cs = this.getChildren(l);
          todos = [...todos, ...cs];
          l += this.getNumChildren(l);
        }
      } else {
        l += this.getNumChildren(l);
      }
    }
    return todos;
  }
}

type GetTodosProps = {
  lines: string[];
  withChildren?: boolean;
};

// Utility-function that acts as a thin wrapper around `TodoParser`
export const getTodos = ({
  lines,
  withChildren = false,
}: GetTodosProps): string[] => {
  const todoParser = new TodoParser(lines, withChildren);
  return todoParser.getTodos();
};
