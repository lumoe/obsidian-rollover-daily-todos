import { expect, test, describe } from "vitest";
import {
  getTodosBySection,
  findMatchingHeading,
  buildSectionRoutedContent,
  SECTION_ROUTING_INTERNALS,
} from "./section-routing";

const { NO_HEADING } = SECTION_ROUTING_INTERNALS;

describe("getTodosBySection", () => {
  test("groups todos by their preceding heading", () => {
    const lines = [
      "# Plan",
      "- [ ] one",
      "- [ ] two",
      "## Habits",
      "- [ ] meditate",
      "## Notes",
      "some text — not a todo",
    ];
    const sections = getTodosBySection({ lines });
    expect([...sections.keys()]).toStrictEqual(["plan", "habits"]);
    expect(sections.get("plan").todos).toStrictEqual([
      "- [ ] one",
      "- [ ] two",
    ]);
    expect(sections.get("habits").todos).toStrictEqual(["- [ ] meditate"]);
    expect(sections.get("plan").headingLine).toBe("# Plan");
  });

  test("todos before the first heading land in the NO_HEADING bucket", () => {
    const lines = ["- [ ] orphan", "# Later", "- [ ] under heading"];
    const sections = getTodosBySection({ lines });
    expect(sections.get(NO_HEADING).todos).toStrictEqual(["- [ ] orphan"]);
    expect(sections.get("later").todos).toStrictEqual(["- [ ] under heading"]);
  });

  test("done todos are excluded (uses getTodos under the hood)", () => {
    const lines = ["# Plan", "- [x] done", "- [ ] open"];
    const sections = getTodosBySection({ lines });
    expect(sections.get("plan").todos).toStrictEqual(["- [ ] open"]);
  });

  test("withChildren rolls the children along under the same section", () => {
    const lines = [
      "# Plan",
      "- [ ] parent",
      "    - some note",
      "    - [ ] sub",
    ];
    const sections = getTodosBySection({ lines, withChildren: true });
    expect(sections.get("plan").todos).toStrictEqual([
      "- [ ] parent",
      "    - some note",
      "    - [ ] sub",
    ]);
  });

  test("heading text comparison is whitespace-trimmed and case-folded", () => {
    const lines = ["##   In Progress  ", "- [ ] x"];
    const sections = getTodosBySection({ lines });
    expect([...sections.keys()]).toStrictEqual(["in progress"]);
  });

  test("merges multiple appearances of the same heading", () => {
    const lines = [
      "## Foo",
      "- [ ] one",
      "## Other",
      "- [ ] other-todo",
      "## Foo",
      "- [ ] two",
    ];
    const sections = getTodosBySection({ lines });
    expect(sections.get("foo").todos).toStrictEqual(["- [ ] one", "- [ ] two"]);
  });

  test("horizontal rules end the current source section", () => {
    const lines = [
      "## Foo",
      "- [ ] under foo",
      "---",
      "- [ ] after divider",
      "## Bar",
      "- [ ] under bar",
    ];
    const sections = getTodosBySection({ lines });
    expect(sections.get("foo").todos).toStrictEqual(["- [ ] under foo"]);
    expect(sections.get(NO_HEADING).todos).toStrictEqual([
      "- [ ] after divider",
    ]);
    expect(sections.get("bar").todos).toStrictEqual(["- [ ] under bar"]);
  });
});

describe("findMatchingHeading", () => {
  test("matches across heading levels and case", () => {
    const lines = ["# Title", "## Plan", "### plan"];
    expect(findMatchingHeading(lines, "plan")).toBe("## Plan");
  });

  test("returns null when no match", () => {
    expect(findMatchingHeading(["# Other"], "missing")).toBe(null);
  });

  test("ignores extra whitespace inside headings", () => {
    expect(findMatchingHeading(["##   Things to do  "], "things to do")).toBe(
      "##   Things to do  "
    );
  });
});

describe("buildSectionRoutedContent", () => {
  test("routes each section bucket under its matching heading in today's note", () => {
    const yesterday = [
      "## Plan",
      "- [ ] yesterday plan",
      "## Habits",
      "- [ ] yesterday habit",
    ];
    const todaysContent = [
      "## Plan",
      "- [ ] today plan template",
      "## Habits",
      "## Notes",
    ].join("\n");

    const todosBySection = getTodosBySection({ lines: yesterday });
    const { content } = buildSectionRoutedContent({
      dailyNoteContent: todaysContent,
      todosBySection,
      leadingNewLine: false,
    });

    // both buckets should land under their matching heading on today's side
    expect(content).toContain("- [ ] yesterday plan");
    expect(content).toContain("- [ ] yesterday habit");

    // ordering: each rolled-over line is under the right heading
    const lines = content.split("\n");
    const planIdx = lines.findIndex((l) => l === "## Plan");
    const habitsIdx = lines.findIndex((l) => l === "## Habits");
    const notesIdx = lines.findIndex((l) => l === "## Notes");
    const yPlanIdx = lines.findIndex((l) => l === "- [ ] yesterday plan");
    const yHabitIdx = lines.findIndex((l) => l === "- [ ] yesterday habit");
    expect(yPlanIdx).toBeGreaterThan(planIdx);
    expect(yPlanIdx).toBeLessThan(habitsIdx);
    expect(yHabitIdx).toBeGreaterThan(habitsIdx);
    expect(yHabitIdx).toBeLessThan(notesIdx);
  });

  test("appends unmatched buckets to end (with no fallback heading)", () => {
    const yesterday = [
      "## Foo",
      "- [ ] foo todo",
      "## NotInToday",
      "- [ ] orphan",
    ];
    const todaysContent = "## Foo\n";
    const todosBySection = getTodosBySection({ lines: yesterday });
    const { content, unmatchedTodoCount } = buildSectionRoutedContent({
      dailyNoteContent: todaysContent,
      todosBySection,
    });
    expect(unmatchedTodoCount).toBe(1);
    expect(content).toContain("- [ ] foo todo");
    expect(content).toContain("- [ ] orphan");
    // orphan should be after foo todo
    expect(content.indexOf("- [ ] orphan")).toBeGreaterThan(
      content.indexOf("- [ ] foo todo")
    );
  });

  test("NO_HEADING bucket is appended (or routed to fallback heading)", () => {
    const yesterday = ["- [ ] orphan", "## Foo", "- [ ] foo todo"];
    const todaysContent = "## Bucket\n";
    const todosBySection = getTodosBySection({ lines: yesterday });
    const { content } = buildSectionRoutedContent({
      dailyNoteContent: todaysContent,
      todosBySection,
      fallbackHeading: "## Bucket",
      leadingNewLine: false,
    });
    expect(content).toContain("## Bucket\n- [ ] orphan");
    // foo todo had no match, so it also lands under the fallback
    expect(content).toContain("- [ ] foo todo");
  });

  test("dedupes against existing today lines when skipExistingTodos is on", () => {
    const yesterday = ["## Plan", "- [ ] one", "- [ ] two"];
    const todaysContent = "## Plan\n- [ ] one\n";
    const todosBySection = getTodosBySection({ lines: yesterday });
    const { content } = buildSectionRoutedContent({
      dailyNoteContent: todaysContent,
      todosBySection,
      skipExistingTodos: true,
      appendBelowExistingTasks: true,
    });
    // should only have one occurrence of "- [ ] one"
    const matches = content.match(/- \[ \] one/g) || [];
    expect(matches.length).toBe(1);
    expect(content).toContain("- [ ] two");
  });
});
