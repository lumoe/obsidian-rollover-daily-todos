import { expect, test, describe } from "vitest";
import { buildNewDailyNoteContent, verifyTodosPresent } from "./insert-todos";

const todos = ["- [ ] one", "- [ ] two"];

describe("appending to end of file (no template heading)", () => {
  test("preserves a trailing newline if already present", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "existing\n",
      todos,
      templateHeading: "none",
    });
    expect(content).toBe("existing\n- [ ] one\n- [ ] two\n");
  });

  test("(#115) adds a trailing newline if missing before the appended block", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "existing", // no trailing \n
      todos,
      templateHeading: "none",
    });
    expect(content).toBe("existing\n- [ ] one\n- [ ] two\n");
  });

  test("(#115) ensures a trailing newline after the appended block", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "",
      todos,
      templateHeading: "none",
    });
    expect(content.endsWith("\n")).toBe(true);
  });

  test("when no todos, content is returned unchanged", () => {
    const { content, todosInserted } = buildNewDailyNoteContent({
      dailyNoteContent: "existing",
      todos: [],
      templateHeading: "## Foo",
    });
    expect(content).toBe("existing");
    expect(todosInserted).toBe(0);
  });
});

describe("inserting under a template heading", () => {
  test("matches existing behaviour: leadingNewLine=true puts a blank line between heading and todos", () => {
    const { content, templateHeadingFound } = buildNewDailyNoteContent({
      dailyNoteContent: "## Foo\nbar",
      todos,
      templateHeading: "## Foo",
      leadingNewLine: true,
    });
    expect(templateHeadingFound).toBe(true);
    expect(content).toBe("## Foo\n\n- [ ] one\n- [ ] two\nbar");
  });

  test("matches existing behaviour: leadingNewLine=false puts todos directly after heading", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "## Foo\nbar",
      todos,
      templateHeading: "## Foo",
      leadingNewLine: false,
    });
    expect(content).toBe("## Foo\n- [ ] one\n- [ ] two\nbar");
  });

  test("returns templateHeadingFound=false when heading is not present", () => {
    const { content, templateHeadingFound } = buildNewDailyNoteContent({
      dailyNoteContent: "no heading here\n",
      todos,
      templateHeading: "## Foo",
    });
    expect(templateHeadingFound).toBe(false);
    // falls back to appending at end
    expect(content).toBe("no heading here\n- [ ] one\n- [ ] two\n");
  });
});

describe("(#101) horizontal-rule handling", () => {
  test("places todos *below* a --- rule that immediately follows the heading", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "## Foo\n---\nbar",
      todos,
      templateHeading: "## Foo",
      leadingNewLine: true,
    });
    expect(content).toBe("## Foo\n---\n\n- [ ] one\n- [ ] two\nbar");
  });

  test("can be disabled with skipHorizontalRule=false", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "## Foo\n---\nbar",
      todos,
      templateHeading: "## Foo",
      leadingNewLine: false,
      skipHorizontalRule: false,
    });
    expect(content).toBe("## Foo\n- [ ] one\n- [ ] two\n---\nbar");
  });

  test("does not skip an arbitrary line that just contains a couple of dashes", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "## Foo\n--\nbar", // only 2 dashes — not a rule
      todos,
      templateHeading: "## Foo",
      leadingNewLine: false,
    });
    expect(content).toBe("## Foo\n- [ ] one\n- [ ] two\n--\nbar");
  });
});

describe("(#162) verifyTodosPresent — guard for the deletion path", () => {
  test("returns true when every todo line is present in content", () => {
    const content = "preamble\n- [ ] one\n- [ ] two\nepilogue";
    expect(verifyTodosPresent(content, ["- [ ] one", "- [ ] two"])).toBe(true);
  });

  test("returns false when any todo line is missing", () => {
    const content = "preamble\n- [ ] one\nepilogue";
    expect(verifyTodosPresent(content, ["- [ ] one", "- [ ] two"])).toBe(false);
  });

  test("returns true for an empty todo list (nothing to verify)", () => {
    expect(verifyTodosPresent("anything", [])).toBe(true);
    expect(verifyTodosPresent("anything", null)).toBe(true);
  });

  test("handles CRLF line endings", () => {
    const content = "a\r\n- [ ] x\r\nb";
    expect(verifyTodosPresent(content, ["- [ ] x"])).toBe(true);
  });

  test("requires verbatim line match — partial match is not enough", () => {
    const content = "- [ ] one and a half";
    expect(verifyTodosPresent(content, ["- [ ] one"])).toBe(false);
  });
});

describe("(#132) append below existing tasks", () => {
  test("places new todos at the end of the existing list under the heading", () => {
    const dailyNoteContent = [
      "## Foo",
      "- [ ] existing one",
      "- [ ] existing two",
      "",
      "other text",
    ].join("\n");

    const { content } = buildNewDailyNoteContent({
      dailyNoteContent,
      todos,
      templateHeading: "## Foo",
      appendBelowExistingTasks: true,
    });

    expect(content).toBe(
      [
        "## Foo",
        "- [ ] existing one",
        "- [ ] existing two",
        "- [ ] one",
        "- [ ] two",
        "",
        "other text",
      ].join("\n")
    );
  });

  test("falls back to leadingNewLine behaviour when no existing tasks under the heading", () => {
    const { content } = buildNewDailyNoteContent({
      dailyNoteContent: "## Foo\nplain text",
      todos,
      templateHeading: "## Foo",
      appendBelowExistingTasks: true,
      leadingNewLine: true,
    });
    expect(content).toBe("## Foo\n\n- [ ] one\n- [ ] two\nplain text");
  });

  test("(#130) skipExistingTodos drops todos whose text already exists in today's note", () => {
    const dailyNoteContent = [
      "## Foo",
      "- [ ] one", // already there
      "",
      "other",
    ].join("\n");

    const result = buildNewDailyNoteContent({
      dailyNoteContent,
      todos: ["- [ ] one", "- [ ] two"],
      templateHeading: "## Foo",
      skipExistingTodos: true,
      appendBelowExistingTasks: true,
    });

    expect(result.todosSkipped).toBe(1);
    expect(result.todosInserted).toBe(1);
    expect(result.content).toBe(
      ["## Foo", "- [ ] one", "- [ ] two", "", "other"].join("\n")
    );
  });

  test("(#130) skipExistingTodos compares trimmed lines (whitespace tolerant)", () => {
    const result = buildNewDailyNoteContent({
      dailyNoteContent: "    - [ ] one  \nother",
      todos: ["- [ ] one"],
      templateHeading: "none",
      skipExistingTodos: true,
    });
    expect(result.todosSkipped).toBe(1);
    expect(result.todosInserted).toBe(0);
    expect(result.content).toBe("    - [ ] one  \nother");
  });

  test("(#130) skipExistingTodos disabled — duplicates are inserted (back-compat)", () => {
    const result = buildNewDailyNoteContent({
      dailyNoteContent: "- [ ] one\n",
      todos: ["- [ ] one"],
      templateHeading: "none",
      skipExistingTodos: false,
    });
    expect(result.todosSkipped).toBe(0);
    expect(result.todosInserted).toBe(1);
    expect(result.content).toBe("- [ ] one\n- [ ] one\n");
  });

  test("works in combination with horizontal-rule skipping", () => {
    const dailyNoteContent = [
      "## Foo",
      "---",
      "- [ ] existing one",
      "",
      "more text",
    ].join("\n");

    const { content } = buildNewDailyNoteContent({
      dailyNoteContent,
      todos,
      templateHeading: "## Foo",
      appendBelowExistingTasks: true,
    });

    expect(content).toBe(
      [
        "## Foo",
        "---",
        "- [ ] existing one",
        "- [ ] one",
        "- [ ] two",
        "",
        "more text",
      ].join("\n")
    );
  });
});
