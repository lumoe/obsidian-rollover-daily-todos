import { expect, test } from "vitest";
import { getTodos } from "./get-todos";

test("single todo element should return itself", () => {
  // GIVEN
  const lines = ["- [ ] tada"];

  // WHEN
  const result = getTodos({ lines });

  // THEN
  const todos = ["- [ ] tada"];
  expect(result).toStrictEqual(todos);
});

test("single incomplete element should return itself", () => {
  // GIVEN
  const lines = ["- [/] tada"];

  // WHEN
  const result = getTodos({ lines });

  // THEN
  const todos = ["- [/] tada"];
  expect(result).toStrictEqual(todos);
});

test("single done todo element should not return itself", () => {
  // GIVEN
  const lines = ["- [x] tada"];

  // WHEN
  const result = getTodos({ lines });

  // THEN
  const todos = [];
  expect(result).toStrictEqual(todos);
});

test("single canceled todo element should not return itself", () => {
  // GIVEN
  const lines = ["- [-] tada"];

  // WHEN
  const result = getTodos({ lines });

  // THEN
  const todos = [];
  expect(result).toStrictEqual(todos);
});

test("get todos with children", function () {
  // GIVEN
  const lines = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
    "- this isn't copied",
  ];

  // WHEN
  const todos = getTodos({ lines: lines, withChildren: true });

  // THEN
  const result = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos (with alternate symbols) with children", function () {
  // GIVEN
  const lines = [
    "+ [ ] TODO",
    "    + [ ] Next",
    "    * some stuff",
    "* [ ] Another one",
    "    - [ ] More children",
    "    + another child",
    "- this isn't copied",
  ];

  // WHEN
  const todos = getTodos({ lines: lines, withChildren: true });

  // THEN
  const result = [
    "+ [ ] TODO",
    "    + [ ] Next",
    "    * some stuff",
    "* [ ] Another one",
    "    - [ ] More children",
    "    + another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos (with alternate symbols and partially checked todos) with children", function () {
  // GIVEN
  const lines = [
    "+ [x] Completed TODO",
    "    + [ ] Next",
    "    * some stuff",
    "* [ ] Another one",
    "    - [x] Completed child",
    "    + another child",
    "- this isn't copied",
  ];

  // WHEN
  const todos = getTodos({ lines: lines, withChildren: true });

  // THEN
  const result = [
    "    + [ ] Next",
    "* [ ] Another one",
    "    - [x] Completed child",
    "    + another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos (with custom ✅ done status and 🟣 not-done child status) with children", function () {
  // GIVEN
  const lines = [
    "+ [✅] Completed TODO",
    "    + [🟣] Next",
    "    * some stuff",
    "* [🟣] Another one",
    "    - [✅] Completed child",
    "    + another child",
    "- this isn't copied",
  ];

  // WHEN
  const todos = getTodos({
    lines: lines,
    withChildren: true,
    doneStatusMarkers: "✅",
  });

  // THEN
  const result = [
    "    + [🟣] Next",
    "* [🟣] Another one",
    "    - [✅] Completed child",
    "    + another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos (with default dash prefix and finished todos) with children", function () {
  // GIVEN
  const lines = [
    "- [x] Completed TODO",
    "    - [ ] Next",
    "    * some stuff",
    "- [ ] Another one",
    "    - [x] Completed child",
    "    + another child",
    "* this isn't copied",
  ];

  // WHEN
  const todos = getTodos({ lines: lines, withChildren: true });

  // THEN
  const result = [
    "    - [ ] Next",
    "- [ ] Another one",
    "    - [x] Completed child",
    "    + another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos without children", () => {
  // GIVEN
  const lines = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
    "- this isn't copied",
  ];

  // WHEN
  const todos = getTodos({ lines });

  // THEN
  const result = [
    "- [ ] TODO",
    "    - [ ] Next",
    "- [ ] Another one",
    "    - [ ] More children",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos without children (with 🟣 not-done child status)", () => {
  // GIVEN
  const lines = [
    "- [ ] TODO",
    "    - [🟣] Next",
    "    - some stuff",
    "- [🟣] Another one",
    "    - [ ] More children",
    "    - another child",
    "- this isn't copied",
  ];

  // WHEN
  const todos = getTodos({ lines });

  // THEN
  const result = [
    "- [ ] TODO",
    "    - [🟣] Next",
    "- [🟣] Another one",
    "    - [ ] More children",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos with correct alternate checkbox children", function () {
  // GIVEN
  const lines = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - [x] Completed task",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] Another child",
    "    - [/] More children",
    "    - another child",
    "- this isn't copied",
  ];

  // WHEN
  const todos = getTodos({ lines: lines, withChildren: true });

  // THEN
  const result = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - [x] Completed task",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] Another child",
    "    - [/] More children",
    "    - another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos with children doesn't fail if child at end of list", () => {
  // GIVEN
  const lines = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
  ];

  // WHEN
  const todos = getTodos({ lines, withChildren: true });

  // THEN
  const result = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos with nested children also adds nested children", () => {
  // GIVEN
  const lines = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "        - some stuff",
    "        - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
  ];

  // WHEN
  const todos = getTodos({ lines, withChildren: true });

  // THEN
  const result = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "        - some stuff",
    "        - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos doesn't add intermediate other elements", () => {
  // GIVEN
  const lines = [
    "# Some title",
    "",
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "",
    "## Some title",
    "",
    "Some text",
    "...that continues here",
    "",
    "- Here is a bullet item",
    "- Here is another bullet item",
    "1. Here is a numbered list item",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
  ];

  // WHEN
  const todos = getTodos({ lines, withChildren: true });

  // THEN
  const result = [
    "- [ ] TODO",
    "    - [ ] Next",
    "    - some stuff",
    "- [ ] Another one",
    "    - [ ] More children",
    "    - another child",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos supports custom done status markers", () => {
  // GIVEN
  const lines = [
    "- [ ] Incomplete task",
    "- [x] Completed task (x)",
    "- [X] Completed task (X)",
    "- [-] Completed task (-)",
    "- [C] Task with custom status (C)",
    "- [?] Task with custom status (?)",
  ];

  // WHEN - only consider 'C' and '?' as done
  const todos = getTodos({ lines, doneStatusMarkers: "C?" });

  // THEN - x, X, and - should be considered incomplete now
  const result = [
    "- [ ] Incomplete task",
    "- [x] Completed task (x)",
    "- [X] Completed task (X)",
    "- [-] Completed task (-)",
  ];
  expect(todos).toStrictEqual(result);
});

test("get todos supports custom status marker edge cases (exclusion)", () => {
  // GIVEN
  const lines = [
    "- [ ] Normal task",
    // Emojis and symbols
    "- [✅] Checkmark emoji",
    "- [❌] Cross emoji",
    "- [✔️] Heavy checkmark",
    "- [✓] Checkmark symbol",
    "- [✗] Ballot X",
    "- [👍] Thumbs up",
    // Control and non-printable characters
    "- [\u0000] Null",
    "- [\u0007] Bell",
    "- [\u0008] Backspace",
    "- [\u001B] Escape",
    // Combining characters
    "- [a\u0300] Letter with accent",
    "- [e\u0301] Letter with acute",
    // Regex special characters
    "- [.] Dot",
    "- [*] Star",
    "- [+] Plus",
    "- [?] Question",
    "- [(] Open paren",
    "- [)] Close paren",
    "- [[] Open bracket",
    "- []] Close bracket",
    "- [{] Open brace",
    "- [}] Close brace",
    "- [^] Caret",
    "- [$] Dollar",
    "- [|] Pipe",
    "- [\\] Backslash",
    "- [/] Forward slash",
    // Simple accented characters (should be valid)
    "- [à] Simple accented character",
    "- [é] Simple accented character 2",
  ];

  // WHEN - using all types of characters as done markers
  const todos = getTodos({
    lines,
    doneStatusMarkers:
      "✅❌✔️✓✗👍\u0000\u0007\u0008\u001B\u202Ea\u0300e\u0301.*+?()[]{}\\^$|/àé",
  });

  // THEN - only the normal task should be returned
  const result = ["- [ ] Normal task"];
  expect(todos).toStrictEqual(result);
});

test("get todos supports custom status marker edge cases (inclusion)", () => {
  // GIVEN
  const lines = [
    "- [ ] Normal task",
    // Emojis and symbols
    "- [✅] Checkmark emoji",
    "- [❌] Cross emoji",
    "- [✔️] Heavy checkmark",
    "- [✓] Checkmark symbol",
    "- [✗] Ballot X",
    "- [👍] Thumbs up",
    // Control and non-printable characters
    "- [\u0000] Null",
    "- [\u0007] Bell",
    "- [\u0008] Backspace",
    "- [\u001B] Escape",
    // Combining characters
    "- [a\u0300] Letter with accent",
    "- [e\u0301] Letter with acute",
    // Regex special characters
    "- [.] Dot",
    "- [*] Star",
    "- [+] Plus",
    "- [?] Question",
    "- [(] Open paren",
    "- [)] Close paren",
    "- [[] Open bracket",
    "- []] Close bracket",
    "- [{] Open brace",
    "- [}] Close brace",
    "- [^] Caret",
    "- [$] Dollar",
    "- [|] Pipe",
    "- [\\] Backslash",
    "- [/] Forward slash",
    // Simple accented characters (should be valid)
    "- [à] Simple accented character",
    "- [é] Simple accented character 2",
  ];

  // WHEN - only consider 'C' as done
  const todos = getTodos({ lines, doneStatusMarkers: "C" });

  // THEN - only the normal task should be returned
  const result = [
    "- [ ] Normal task",
    // Emojis and symbols
    "- [✅] Checkmark emoji",
    "- [❌] Cross emoji",
    "- [✔️] Heavy checkmark",
    "- [✓] Checkmark symbol",
    "- [✗] Ballot X",
    "- [👍] Thumbs up",
    // Control and non-printable characters
    "- [\u0000] Null",
    "- [\u0007] Bell",
    "- [\u0008] Backspace",
    "- [\u001B] Escape",
    // Combining characters
    "- [a\u0300] Letter with accent",
    "- [e\u0301] Letter with acute",
    // Regex special characters
    "- [.] Dot",
    "- [*] Star",
    "- [+] Plus",
    "- [?] Question",
    "- [(] Open paren",
    "- [)] Close paren",
    "- [[] Open bracket",
    "- []] Close bracket",
    "- [{] Open brace",
    "- [}] Close brace",
    "- [^] Caret",
    "- [$] Dollar",
    "- [|] Pipe",
    "- [\\] Backslash",
    "- [/] Forward slash",
    // Simple accented characters (should be valid)
    "- [à] Simple accented character",
    "- [é] Simple accented character 2",
  ];
  expect(todos).toStrictEqual(result);
});

test("does not match bullet patterns embedded mid-line (e.g. inside template literals in code blocks)", () => {
  const lines = [
    "```js",
    "const items = [];",
    "const md = items.map(t => `- [ ] ${t}`).join('\\n');",
    "    const indented = `    - [ ] ${x}`;",
    "```",
    "Some prose mentioning - [ ] inline should also not match.",
    "- [ ] this is a real todo",
  ];
  const todos = getTodos({ lines, withChildren: true });
  expect(todos).toStrictEqual(["- [ ] this is a real todo"]);
});

test("(#165/#170) ignoreBlockquotes=false (default): blockquoted bullet lines still roll over", () => {
  const lines = [
    "- [ ] one",
    "> - [ ] two (in callout body)",
    "> [!tip]",
    "> - [ ] three (in callout body)",
  ];
  const todos = getTodos({ lines });
  expect(todos).toStrictEqual([
    "- [ ] one",
    "> - [ ] two (in callout body)",
    "> - [ ] three (in callout body)",
  ]);
});

test("(#165) ignoreBlockquotes=true: blockquoted todos are skipped", () => {
  const lines = [
    "- [ ] one",
    "> - [ ] two (in callout body)",
    "> [!tip]",
    ">  - [ ] three (deeply indented blockquote)",
    "    > - [ ] four (indented before the >)",
    "- [ ] five",
  ];
  const todos = getTodos({ lines, ignoreBlockquotes: true });
  expect(todos).toStrictEqual(["- [ ] one", "- [ ] five"]);
});

test("(#165) ignoreBlockquotes does not affect children walk for non-blockquoted parents", () => {
  const lines = [
    "- [ ] parent",
    "    - some text",
    "    - [ ] indented child todo",
  ];
  const todos = getTodos({
    lines,
    withChildren: true,
    ignoreBlockquotes: true,
  });
  expect(todos).toStrictEqual([
    "- [ ] parent",
    "    - some text",
    "    - [ ] indented child todo",
  ]);
});

test("(#125) skipCompletedChildren=false (default): completed todo children are still rolled with parent", () => {
  const lines = [
    "- [ ] parent",
    "    - [x] done child",
    "    - [ ] open child",
  ];
  const todos = getTodos({ lines, withChildren: true });
  expect(todos).toStrictEqual([
    "- [ ] parent",
    "    - [x] done child",
    "    - [ ] open child",
  ]);
});

test("(#125) skipCompletedChildren=true: completed todo children are dropped, non-todo children remain", () => {
  const lines = [
    "- [ ] parent",
    "    - [x] done child",
    "    - some note",
    "    - [ ] open child",
  ];
  const todos = getTodos({
    lines,
    withChildren: true,
    skipCompletedChildren: true,
  });
  expect(todos).toStrictEqual([
    "- [ ] parent",
    "    - some note",
    "    - [ ] open child",
  ]);
});

test("(#125/#170) skipCompletedChildren=true recognizes completed blockquoted children", () => {
  const lines = [
    "- [ ] parent",
    "    > - [x] done child in callout",
    "        > - [ ] grandchild that should be dropped",
    "    - [ ] open child",
  ];
  const todos = getTodos({
    lines,
    withChildren: true,
    skipCompletedChildren: true,
  });
  expect(todos).toStrictEqual(["- [ ] parent", "    - [ ] open child"]);
});

test("(#125) skipCompletedChildren=true: also drops descendants of a completed child", () => {
  const lines = [
    "- [ ] parent",
    "    - [x] done child",
    "        - [ ] grandchild that would otherwise survive",
    "        - sub-note",
    "    - [ ] open child",
  ];
  const todos = getTodos({
    lines,
    withChildren: true,
    skipCompletedChildren: true,
  });
  expect(todos).toStrictEqual(["- [ ] parent", "    - [ ] open child"]);
});

test("(#125) respects custom done markers", () => {
  const lines = [
    "- [ ] parent",
    "    - [✅] done with custom marker",
    "    - [ ] open child",
  ];
  const todos = getTodos({
    lines,
    withChildren: true,
    skipCompletedChildren: true,
    doneStatusMarkers: "✅",
  });
  expect(todos).toStrictEqual(["- [ ] parent", "    - [ ] open child"]);
});

test("should not match malformed todos", () => {
  const lines = [
    "- [ ] valid todo",
    "- [x] done", // done, should NOT match
    // Malformed, should not match
    "- [] empty",
    "- [  ] multiple spaces",
    "- [✅\u200B\u0300] multiple special",
    "- [.*+?()] multiple regexp",
    "- [a\u0300\u200B] multimple combining",
    // Grapheme modifiers, not valid on their own
    "- [\u202E] RTL override",
    "- [\u200B] Zero-width space",
    "- [\u200C] Zero-width non-joiner",
    "- [\u200D] Zero-width joiner",
  ];
  const todos = getTodos({ lines });
  expect(todos).toStrictEqual(["- [ ] valid todo"]);
});
