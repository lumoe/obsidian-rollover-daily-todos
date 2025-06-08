import { expect, test, describe } from "vitest";
import { getTodos } from "./get-todos"; // We'll still need this for the final todo extraction
import { filterLinesByExcludedHeadings } from "./index";

// This is the function we'd ideally test, combining filtering and todo extraction
function getFinalTodosForRollover(lines, settings) {
    // Use the imported filterLinesByExcludedHeadings
    const filteredLines = filterLinesByExcludedHeadings(lines, settings.excludedHeadings);
    return getTodos({
        lines: filteredLines,
        withChildren: settings.rolloverChildren,
        doneStatusMarkers: settings.doneStatusMarkers,
    });
}

describe("Rollover Heading Exclusions", () => {
  const baseSettings = {
    rolloverChildren: false,
    doneStatusMarkers: "xX-",
    excludedHeadings: [], // Changed from "" to []
  };

  test("should return all todos if no headings are excluded", () => {
    const lines = [
      "# Section 1",
      "- [ ] Task 1 under Section 1",
      "## Subsection 1.1",
      "- [ ] Task 2 under Subsection 1.1",
      "# Section 2",
      "- [ ] Task 3 under Section 2",
    ];
    const settings = { ...baseSettings, excludedHeadings: [] }; // Explicitly empty
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual([
      "- [ ] Task 1 under Section 1",
      "- [ ] Task 2 under Subsection 1.1",
      "- [ ] Task 3 under Section 2",
    ]);
  });

  test("should exclude todos under a single specified heading", () => {
    const lines = [
      "# Section To Include",
      "- [ ] Task A",
      "## Section To Exclude",
      "- [ ] Task B (should be excluded)",
      "- [ ] Task C (should be excluded)",
      "# Another Section To Include",
      "- [ ] Task D",
    ];
    const settings = { ...baseSettings, excludedHeadings: ["Section To Exclude"] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Task A", "- [ ] Task D"]);
  });

  test("should handle case-insensitivity for excluded headings", () => {
    const lines = [
      "# Section To Include",
      "- [ ] Task A",
      "## sEcTiOn To ExClUdE", // Note mixed case
      "- [ ] Task B (should be excluded)",
      "# Another Section To Include",
      "- [ ] Task D",
    ];
    // The input to filterLinesByExcludedHeadings is already normalized by settings UI or loadSettings
    // but filterLinesByExcludedHeadings itself also does .toLowerCase()
    const settings = { ...baseSettings, excludedHeadings: ["Section To Exclude"] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Task A", "- [ ] Task D"]);
  });

  test("should handle array of excluded headings with spaces needing trim", () => {
    const lines = [
      "# Important",
      "- [ ] Important Task",
      "## Meetings",
      "- [ ] Meeting Task (excluded)",
      "# Personal",
      "- [ ] Personal Task (excluded)",
      "## Coding",
      "- [ ] Coding Task",
    ];
    // filterLinesByExcludedHeadings will trim these
    const settings = { ...baseSettings, excludedHeadings: ["  Meetings  ", " Personal  "] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Important Task", "- [ ] Coding Task"]);
  });

  test("hierarchical exclusion: excluding a parent heading should exclude children todos", () => {
    const lines = [
      "# Parent Excluded",
      "- [ ] Task 1 (excluded)",
      "## Child Section 1",
      "- [ ] Task 2 (excluded)",
      "### Grandchild Section",
      "- [ ] Task 3 (excluded)",
      "# Parent Included",
      "- [ ] Task 4 (included)",
      "## Child Section 2 (Still under included parent)",
      "- [ ] Task 5 (included)",
    ];
    const settings = { ...baseSettings, excludedHeadings: ["Parent Excluded"] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Task 4 (included)", "- [ ] Task 5 (included)"]);
  });

  test("hierarchical exclusion: excluding a child heading but not parent", () => {
    const lines = [
      "# Parent Included",
      "- [ ] Task 1 (included)",
      "## Child Excluded",
      "- [ ] Task 2 (excluded)",
      "### Grandchild under Child Excluded",
      "- [ ] Task 3 (excluded)",
      "## Another Child Included",
      "- [ ] Task 4 (included)",
    ];
    const settings = { ...baseSettings, excludedHeadings: ["Child Excluded"] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Task 1 (included)", "- [ ] Task 4 (included)"]);
  });

  test("todos before any heading should be included", () => {
    const lines = [
      "- [ ] Orphan Task 1",
      "# Section 1 (Excluded)",
      "- [ ] Task under excluded section",
      "- [ ] Orphan Task 2 (after excluded section, but no new heading)",
    ];
    const settings = { ...baseSettings, excludedHeadings: ["Section 1"] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Orphan Task 1"]);
  });

  test("todos after an excluded section, under a new non-excluded heading, should be included", () => {
    const lines = [
      "# Section 1 (Excluded)",
      "- [ ] Task A (excluded)",
      "## Subsection 1.1 (Excluded)",
      "- [ ] Task B (excluded)",
      "# Section 2 (Included)",
      "- [ ] Task C (included)",
      "## Subsection 2.1 (Included)",
      "- [ ] Task D (included)",
    ];
    const settings = { ...baseSettings, excludedHeadings: ["Section 1"] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Task C (included)", "- [ ] Task D (included)"]);
  });

  test("empty excludedHeadings array should include all", () => {
    const lines = [
      "# Section 1",
      "- [ ] Task 1",
      "## Section To Exclude (but not in settings)",
      "- [ ] Task 2",
    ];
    const settings = { ...baseSettings, excludedHeadings: [] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Task 1", "- [ ] Task 2"]);
  });

  test("excludedHeadings with empty or whitespace-only strings should effectively include all", () => {
    const lines = [
      "# Section 1",
      "- [ ] Task 1",
      "## Section To Exclude (but not effectively in settings)",
      "- [ ] Task 2",
    ];
    // filterLinesByExcludedHeadings filters out empty strings after trimming
    const settings = { ...baseSettings, excludedHeadings: [" ", "   ", ""] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual(["- [ ] Task 1", "- [ ] Task 2"]);
  });

   test("complex nesting and multiple exclusions", () => {
    const lines = [
      "# Alpha (Include)",
      "- [ ] Alpha Task 1",
      "## Bravo (Exclude)",
      "- [ ] Bravo Task 1 (Excluded)",
      "### Charlie (Still Excluded, child of Bravo)",
      "- [ ] Charlie Task 1 (Excluded)",
      "## Delta (Include, sibling of Bravo, breaks Bravo's exclusion for itself)",
      "- [ ] Delta Task 1",
      "# Echo (Exclude)",
      "- [ ] Echo Task 1 (Excluded)",
      "## Foxtrot (Still Excluded, child of Echo)",
      "- [ ] Foxtrot Task 1 (Excluded)",
      "# Golf (Include)",
      "- [ ] Golf Task 1",
    ];
    const settings = { ...baseSettings, excludedHeadings: ["Bravo", "Echo"] };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual([
      "- [ ] Alpha Task 1",
      "- [ ] Delta Task 1",
      "- [ ] Golf Task 1",
    ]);
  });

  test("todos with children option enabled under excluded heading", () => {
    const lines = [
        "# Excluded Section",
        "- [ ] Parent todo (excluded)",
        "  - Child item 1 (excluded)",
        "  - [ ] Child todo 1 (excluded)",
        "# Included Section",
        "- [ ] Parent todo 2 (included)",
        "  - Child item 2 (included)",
        "  - [ ] Child todo 2 (included)",
    ];
    const settings = { ...baseSettings, excludedHeadings: ["Excluded Section"], rolloverChildren: true };
    const result = getFinalTodosForRollover(lines, settings);
    expect(result).toStrictEqual([
        "- [ ] Parent todo 2 (included)",
        "  - Child item 2 (included)",
        "  - [ ] Child todo 2 (included)",
    ]);
  });

});
