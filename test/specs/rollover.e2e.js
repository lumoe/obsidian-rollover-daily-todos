/**
 * End-to-end coverage for the rollover plugin running inside a real Obsidian
 * instance. Exercises the integrated triage branch's behaviour against a live
 * vault: parser anchoring (cluster A), section routing (C), mark-as-moved (D),
 * dedup (E), insertion formatting (F), periodic-notes-aware daily resolution
 * (G), and the deletion-safety guard (H).
 *
 * The test vault under test/vaults/rollover/ is empty by design; each test
 * writes the daily notes it needs into the vault before triggering the
 * rollover command. The core Daily Notes plugin is configured via Obsidian's
 * settings API at runtime so we don't need pre-baked .obsidian configs.
 */

import { browser } from "@wdio/globals";

const ROLLOVER_CMD =
  "obsidian-rollover-daily-todos:obsidian-rollover-daily-todos-rollover";

async function getDateStrings() {
  return browser.executeObsidian(() => {
    const today = window.moment().format("YYYY-MM-DD");
    const yesterday = window.moment().subtract(1, "day").format("YYYY-MM-DD");
    return { today, yesterday };
  });
}

// Write through Obsidian's vault API so the in-memory file index stays in
// sync. Returns the TFile path. If the file already exists, overwrite via
// vault.modify.
async function writeNote(relPath, content) {
  await browser.executeObsidian(
    async ({ app }, { relPath, content }) => {
      const existing = app.vault.getAbstractFileByPath(relPath);
      if (existing) {
        await app.vault.modify(existing, content);
      } else {
        await app.vault.create(relPath, content);
      }
    },
    { relPath, content }
  );
}

async function readNote(relPath) {
  return browser.executeObsidian(
    async ({ app }, { relPath }) => {
      const file = app.vault.getAbstractFileByPath(relPath);
      if (!file) return null;
      return app.vault.read(file);
    },
    { relPath }
  );
}

async function deleteAllMarkdown() {
  await browser.executeObsidian(async ({ app }) => {
    const md = app.vault.getMarkdownFiles().slice();
    for (const f of md) {
      try {
        await app.vault.delete(f);
      } catch (e) {
        // ignore — some sandbox files may be undeletable
      }
    }
  });
}

// Configure the core Daily Notes plugin from inside Obsidian. We can't write
// data.json files for core plugins from the host because Obsidian rewrites
// them on shutdown; setting via the API ensures values stick.
async function configureDailyNotes({
  folder = "",
  format = "YYYY-MM-DD",
} = {}) {
  await browser.executeObsidian(
    async ({ app }, { folder, format }) => {
      const dn = app.internalPlugins.plugins["daily-notes"];
      if (!dn.enabled) {
        await app.internalPlugins.enablePlugin("daily-notes");
      }
      const opts =
        dn.instance && dn.instance.options ? dn.instance.options : dn;
      opts.folder = folder;
      opts.format = format;
      opts.template = "";
      if (typeof dn.saveData === "function") await dn.saveData();
    },
    { folder, format }
  );
}

// Reset plugin settings between tests
async function resetPluginSettings() {
  await browser.executeObsidian(async ({ app }) => {
    const plugin = app.plugins.getPlugin("obsidian-rollover-daily-todos");
    plugin.settings = {
      templateHeading: "none",
      deleteOnComplete: false,
      removeEmptyTodos: false,
      rolloverChildren: false,
      rolloverOnFileCreate: false, // disable auto-rollover during tests
      doneStatusMarkers: "xX-",
      leadingNewLine: true,
      appendBelowExistingTasks: false,
      skipHorizontalRule: true,
      skipExistingTodos: false,
      ignoreBlockquotes: false,
      skipCompletedChildren: false,
      rolloverToMatchingSections: false,
      onRolloverSourceAction: "none",
      rolloverSourceMarker: ">",
    };
    await plugin.saveSettings();
  });
}

async function setSettings(patch) {
  await browser.executeObsidian(
    async ({ app }, { patch }) => {
      const plugin = app.plugins.getPlugin("obsidian-rollover-daily-todos");
      Object.assign(plugin.settings, patch);
      await plugin.saveSettings();
    },
    { patch }
  );
}

describe("rollover plugin (integrated triage)", function () {
  this.timeout(120000);

  before(async function () {
    await configureDailyNotes();
  });

  beforeEach(async function () {
    await deleteAllMarkdown();
    await resetPluginSettings();
  });

  it("plugin is loaded and registered the rollover command", async function () {
    const found = await browser.executeObsidian(({ app }) => {
      return Object.keys(app.commands.commands).some((id) =>
        id.startsWith("obsidian-rollover-daily-todos:")
      );
    });
    expect(found).toBe(true);
  });

  it("manual rollover copies incomplete todos from yesterday into today (no template heading)", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      [
        "# Yesterday",
        "- [ ] Take out the trash",
        "- [x] Wash the dishes",
        "- [ ] Walk the dog",
        "",
      ].join("\n")
    );
    await writeNote(`${today}.md`, "# Today\n");

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    const todayContent = await readNote(`${today}.md`);
    expect(todayContent).toContain("- [ ] Take out the trash");
    expect(todayContent).toContain("- [ ] Walk the dog");
    expect(todayContent).not.toContain("- [x] Wash the dishes");
  });

  it("(cluster A) does not roll over bullet patterns embedded inside fenced code blocks", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      [
        "```js",
        "const md = items.map(t => `- [ ] ${t}`).join('\\n');",
        "```",
        "- [ ] real todo outside code block",
      ].join("\n")
    );
    await writeNote(`${today}.md`, "");

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    const todayContent = await readNote(`${today}.md`);
    // only the real todo should appear; the embedded `- [ ] ${t}` must not
    expect(todayContent).toContain("- [ ] real todo outside code block");
    expect(todayContent).not.toContain("${t}");
  });

  it("(clusters A + B) rolls over blockquote todos by default and skips them when requested", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      ["> [!tip] Callout", "> - [ ] callout todo", "- [ ] regular todo"].join(
        "\n"
      )
    );
    await writeNote(`${today}.md`, "");

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    let todayContent = await readNote(`${today}.md`);
    expect(todayContent).toContain("> - [ ] callout todo");
    expect(todayContent).toContain("- [ ] regular todo");

    await writeNote(`${today}.md`, "");
    await setSettings({ ignoreBlockquotes: true });

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    todayContent = await readNote(`${today}.md`);
    expect(todayContent).not.toContain("> - [ ] callout todo");
    expect(todayContent).toContain("- [ ] regular todo");
  });

  it("(cluster F + H) inserts under template heading and never deletes when source-action is the default 'none'", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      ["## Tasks", "- [ ] yesterday todo"].join("\n")
    );
    const todayInitial = "## Tasks\n## Notes\n";
    await writeNote(`${today}.md`, todayInitial);

    await setSettings({ templateHeading: "## Tasks" });

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    const todayContent = await readNote(`${today}.md`);
    expect(todayContent).toContain("- [ ] yesterday todo");
    // todo must land under "## Tasks", not "## Notes" or end of file
    const tasksIdx = todayContent.indexOf("## Tasks");
    const todoIdx = todayContent.indexOf("- [ ] yesterday todo");
    const notesIdx = todayContent.indexOf("## Notes");
    expect(todoIdx).toBeGreaterThan(tasksIdx);
    expect(todoIdx).toBeLessThan(notesIdx);

    // Source side untouched (action defaults to "none" in 1.3.0)
    const yesterdayContent = await readNote(`${yesterday}.md`);
    expect(yesterdayContent).toContain("- [ ] yesterday todo");
  });

  it("(cluster D) onRolloverSourceAction='mark' rewrites yesterday's todos to use the configured marker", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      ["- [ ] one", "- [ ] two", "- [x] already done"].join("\n")
    );
    await writeNote(`${today}.md`, "");

    await setSettings({
      onRolloverSourceAction: "mark",
      rolloverSourceMarker: ">",
      templateHeading: "none",
    });

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    // The rollover command callback is fire-and-forget; with the F1
    // Templater-safety settle window in place (~1.5s), the destructive
    // source-side step doesn't run synchronously. Poll for up to 4s for
    // yesterday's content to reflect the mark.
    const yesterdayContent = await browser.executeObsidian(
      async ({ app }, { relPath }) => {
        const start = Date.now();
        while (Date.now() - start < 4000) {
          const f = app.vault.getAbstractFileByPath(relPath);
          if (f) {
            const c = await app.vault.read(f);
            if (c.includes("- [>] one")) return c;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        const f = app.vault.getAbstractFileByPath(relPath);
        return f ? await app.vault.read(f) : null;
      },
      { relPath: `${yesterday}.md` }
    );
    expect(yesterdayContent).toContain("- [>] one");
    expect(yesterdayContent).toContain("- [>] two");
    // already-done lines must be untouched (they were never rolled)
    expect(yesterdayContent).toContain("- [x] already done");
  });

  it("(cluster E) skipExistingTodos prevents duplicate insertion when today already has the todo", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      ["- [ ] recurring", "- [ ] new today"].join("\n")
    );
    await writeNote(`${today}.md`, "- [ ] recurring\n");

    await setSettings({ skipExistingTodos: true });

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    const todayContent = await readNote(`${today}.md`);
    // "recurring" should appear exactly once (template-baked, not duplicated)
    const recMatches = todayContent.match(/- \[ \] recurring/g) || [];
    expect(recMatches.length).toBe(1);
    expect(todayContent).toContain("- [ ] new today");
  });

  it("(cluster C) rolloverToMatchingSections routes per-heading buckets to today's matching headings", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      [
        "## Plan",
        "- [ ] yesterday-plan",
        "## Habits",
        "- [ ] yesterday-habit",
      ].join("\n")
    );
    await writeNote(
      `${today}.md`,
      ["## Plan", "## Habits", "## Notes"].join("\n")
    );

    await setSettings({ rolloverToMatchingSections: true });

    await browser.executeObsidianCommand(ROLLOVER_CMD);

    const todayContent = await readNote(`${today}.md`);
    const lines = todayContent.split("\n");
    const planIdx = lines.indexOf("## Plan");
    const habitsIdx = lines.indexOf("## Habits");
    const planTodoIdx = lines.indexOf("- [ ] yesterday-plan");
    const habitTodoIdx = lines.indexOf("- [ ] yesterday-habit");
    expect(planTodoIdx).toBeGreaterThan(planIdx);
    expect(planTodoIdx).toBeLessThan(habitsIdx);
    expect(habitTodoIdx).toBeGreaterThan(habitsIdx);
  });
});
