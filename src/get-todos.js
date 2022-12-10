const isTodo = (s) => {
  const r = /\s*- \[ \].*/g;
  return r.test(s);
};

const hasChildren = (linum, lines) => {
  if (linum + 1 >= lines.length) {
    return false;
  }
  const indCurr = getIndentation(linum, lines);
  const indNext = getIndentation(linum + 1, lines);
  if (indNext > indCurr) {
    return true;
  }
  return false;
};

const getChildren = (parentLinum, lines) => {
  const children = [];
  let nextLinum = parentLinum + 1;
  while (isChildof(parentLinum, nextLinum, lines)) {
    children.push(lines[nextLinum]);
    nextLinum++;
  }
  return children;
};

const isChildof = (parentLinum, linum, lines) => {
  if (parentLinum >= lines.length || linum >= lines.length) {
    return false;
  }
  return getIndentation(linum, lines) > getIndentation(parentLinum, lines);
};

const getIndentation = (linum, lines) => {
  return lines[linum].search(/\S/);
};

export const getTodos = ({ lines, withChildren = false }) => {
  let todos = [];
  for (let linum = 0; linum < lines.length; linum++) {
    const line = lines[linum];
    if (isTodo(line)) {
      todos.push(line);
      if (withChildren && hasChildren(linum, lines)) {
        const cs = getChildren(linum, lines);
        cs.forEach((c) => {
          todos.push(c);
          linum++;
        });
      }
    }
  }
  return todos;
};
