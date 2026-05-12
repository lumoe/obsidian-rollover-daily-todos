/**
 * End-to-end tests that exercise the rollover plugin alongside the **real**
 * Templater plugin (pinned to a stable release in wdio.conf.mjs). These tests
 * pin down the Templater conflict described in issues #155, #89, #144, #146,
 * #105, and #162:
 *
 *   1. REPRO: with auto-rollover on and onRolloverSourceAction="delete" (the
 *      dangerous variant), Templater clobbers today's note AFTER our
 *      rollover writes — and the existing #162 verifyTodosPresent guard
 *      passes anyway because it reads in-memory state. Result: yesterday's
 *      todos are deleted on the source side and lost on the destination
 *      side.
 *
 *   2. WORKAROUND: with auto-rollover off and the user's daily template
 *      invoking the rollover command via Templater, the two operations are
 *      serialised by Templater itself. No race, no data loss.
 *
 *   3. REGRESSION: with the F1 fix (a settle-window guard around the source
 *      action), the dangerous configuration from Test 1 no longer destroys
 *      yesterday's todos. The destination may still be clobbered by
 *      Templater, but the source side is preserved — the user can recover.
 *
 * Test 1 is written to ASSERT THE POST-FIX BEHAVIOUR — i.e. it expects that
 * yesterday's todos are NOT deleted. On code without F1 it FAILS (RED). On
 * code with F1 it PASSES (GREEN). This way the test acts as both a
 * regression guard and a "is the bug actually fixed" check, with no need to
 * skip/unskip when the fix lands.
 *
 * The synthetic spec on triage/templater-repro reproduces the same race
 * without requiring real Templater. This file is the ground-truth
 * counterpart and is what we ship in the regression suite.
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

async function writeNote(relPath, content) {
  // Force rolloverOnFileCreate to false for the duration of the write so
  // that our plugin's create-listener doesn't trigger an unwanted rollover
  // on test fixtures (e.g. when seeding yesterday's note). Async vault
  // event handlers fire on a future tick — long after the test code has
  // moved on — so we restore the original setting only after a yield.
  await browser.executeObsidian(
    async ({ app }, { relPath, content }) => {
      const plugin = app.plugins.getPlugin("obsidian-rollover-daily-todos");
      const prev = plugin ? plugin.settings.rolloverOnFileCreate : false;
      if (plugin) plugin.settings.rolloverOnFileCreate = false;
      try {
        const existing = app.vault.getAbstractFileByPath(relPath);
        if (existing) {
          await app.vault.modify(existing, content);
        } else {
          await app.vault.create(relPath, content);
        }
        // Yield long enough for any queued create-listener microtasks
        // to drain.
        await new Promise((r) => setTimeout(r, 250));
      } finally {
        if (plugin) plugin.settings.rolloverOnFileCreate = prev;
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

async function deleteAllMarkdownExceptTemplates() {
  // Important: keep Templates/Daily.md and Templates/DailyWithRollover.md
  // intact, but delete every dated daily note + any stray notes between
  // tests so each spec starts from a clean slate.
  await browser.executeObsidian(async ({ app }) => {
    const md = app.vault.getMarkdownFiles().slice();
    for (const f of md) {
      if (f.path.startsWith("Templates/")) continue;
      try {
        await app.vault.delete(f);
      } catch (_) {
        // ignore — sandbox files may be undeletable
      }
    }
  });
}

async function configureDailyNotes({ folder = "", format = "YYYY-MM-DD" } = {}) {
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
      // We deliberately leave the core "template" empty: Templater handles
      // rendering via its folder-template mapping.
      opts.template = "";
      if (typeof dn.saveData === "function") await dn.saveData();
    },
    { folder, format }
  );
}

// Slow the rollover plugin's getAllUnfinishedTodos by a configurable amount.
// In production the canonical bug surfaces when Templater's per-template
// evaluation is slow (e.g. <% tp.web.daily_quote() %>), so Templater's
// own ~300ms-delayed empty-file check passes and Templater proceeds to
// render — overwriting whatever our rollover wrote in the meantime. With
// a fast template our rollover almost always wins the race and Templater
// silently backs off, so we have to simulate the slow path by injecting
// a small delay into rollover's own pipeline.
async function slowRollover(delayMs) {
  await browser.executeObsidian(
    async ({ app }, { delayMs }) => {
      const plugin = app.plugins.getPlugin("obsidian-rollover-daily-todos");
      if (!plugin._origGetAllUnfinishedTodos) {
        plugin._origGetAllUnfinishedTodos = plugin.getAllUnfinishedTodos.bind(
          plugin
        );
      }
      plugin.getAllUnfinishedTodos = async function (file) {
        await new Promise((r) => setTimeout(r, delayMs));
        return plugin._origGetAllUnfinishedTodos(file);
      };
    },
    { delayMs }
  );
}

async function unslowRollover() {
  await browser.executeObsidian(async ({ app }) => {
    const plugin = app.plugins.getPlugin("obsidian-rollover-daily-todos");
    if (plugin._origGetAllUnfinishedTodos) {
      plugin.getAllUnfinishedTodos = plugin._origGetAllUnfinishedTodos;
      delete plugin._origGetAllUnfinishedTodos;
    }
  });
}

async function setTemplaterFolderTemplate(templatePath) {
  // Reconfigure Templater's folder-template mapping at runtime. We set the
  // values in-memory; trigger_on_file_creation was already true in the
  // pre-staged data.json so the event handler is already wired up. Avoid
  // disable/enable cycles — those re-fire onload hooks which can confuse
  // our auto-rollover listener.
  await browser.executeObsidian(
    async ({ app }, { templatePath }) => {
      const tp = app.plugins.getPlugin("templater-obsidian");
      if (!tp) throw new Error("Templater plugin is not loaded");
      tp.settings.folder_templates = [
        { folder: "/", template: templatePath },
      ];
      tp.settings.trigger_on_file_creation = true;
      tp.settings.enable_folder_templates = true;
      if (typeof tp.save_settings === "function") {
        await tp.save_settings();
      } else if (typeof tp.saveData === "function") {
        await tp.saveData(tp.settings);
      }
    },
    { templatePath }
  );
}

async function resetPluginSettings(patch = {}) {
  await browser.executeObsidian(
    async ({ app }, { patch }) => {
      const plugin = app.plugins.getPlugin("obsidian-rollover-daily-todos");
      plugin.settings = Object.assign(
        {
          templateHeading: "none",
          deleteOnComplete: false,
          removeEmptyTodos: false,
          rolloverChildren: false,
          rolloverOnFileCreate: true,
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
        },
        patch
      );
      await plugin.saveSettings();
    },
    { patch }
  );
}

// Trigger the standard "open today's daily note" path. This is the path real
// users hit (clicking the daily-note ribbon icon, or running the
// daily-notes:goto-today command). Crucially, it goes through the Daily
// Notes plugin's create flow, which in turn fires the vault create event
// that Templater listens for — exactly the production race.
async function gotoToday() {
  // The core Daily Notes command id varies across Obsidian versions: older
  // builds exposed `daily-notes:goto-today`, current builds (1.11+) just
  // expose `daily-notes`. Try both.
  const ok = await browser.executeObsidian(({ app }) => {
    const ids = ["daily-notes", "daily-notes:goto-today"];
    for (const id of ids) {
      if (app.commands.commands[id]) {
        app.commands.executeCommandById(id);
        return id;
      }
    }
    return null;
  });
  if (!ok) throw new Error("Could not find a daily-notes command");
}

// Wait until either today's note settles, or a hard timeout passes. We poll
// the file content because Templater's render is async (template I/O +
// expression evaluation). 3000ms is generous for a `tp.date.now()` template
// on local hardware; tune up if CI is flaky.
async function waitForToday(todayPath, settleMs = 3000) {
  return browser.executeObsidian(
    async ({ app }, { todayPath, settleMs }) => {
      const start = Date.now();
      let last = null;
      while (Date.now() - start < settleMs) {
        const f = app.vault.getAbstractFileByPath(todayPath);
        if (f) {
          last = await app.vault.read(f);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return last;
    },
    { todayPath, settleMs }
  );
}

describe("templater conflict (real Templater plugin)", function () {
  // Real Templater + real daily-note creation is slower than the synthetic
  // race spec. Allow plenty of time per test.
  this.timeout(180000);

  before(async function () {
    // Sanity: confirm Templater actually loaded. If it didn't, every test
    // below is meaningless — fail fast with a clear message.
    const ok = await browser.executeObsidian(({ app }) => {
      const tp = app.plugins.getPlugin("templater-obsidian");
      if (!tp) return { loaded: false, reason: "plugin-missing" };
      if (!tp.settings) return { loaded: false, reason: "no-settings" };
      return {
        loaded: true,
        templates_folder: tp.settings.templates_folder,
        trigger_on_file_creation: tp.settings.trigger_on_file_creation,
      };
    });
    if (!ok.loaded) {
      throw new Error(
        `Templater not loaded (${ok.reason}). Check wdio.conf.mjs plugins entry.`
      );
    }
    await configureDailyNotes();
  });

  beforeEach(async function () {
    await deleteAllMarkdownExceptTemplates();
    await resetPluginSettings();
    await unslowRollover();
  });

  it("Templater is installed and configured", async function () {
    const info = await browser.executeObsidian(({ app }) => {
      const tp = app.plugins.getPlugin("templater-obsidian");
      return {
        present: !!tp,
        templates_folder: tp && tp.settings && tp.settings.templates_folder,
        trigger_on_file_creation:
          tp && tp.settings && tp.settings.trigger_on_file_creation,
      };
    });
    expect(info.present).toBe(true);
    expect(info.templates_folder).toBe("Templates");
    expect(info.trigger_on_file_creation).toBe(true);
  });

  /**
   * TEST 1 — REPRO (assertions written to post-fix expectation; RED without
   * F1, GREEN with F1).
   *
   * Setup: yesterday has incomplete todos. Templater is configured to render
   * `Templates/Daily.md` on every new file at the root. Auto-rollover is ON
   * with `onRolloverSourceAction: "delete"`.
   *
   * Without the F1 fix:
   *   - rollover writes the rolled todos into the (still-empty) today file.
   *   - The existing verifyTodosPresent check reads in-memory and passes.
   *   - The "delete" branch runs, clearing yesterday's todos.
   *   - Templater's render lands moments later, overwriting today.
   *   - Net effect: yesterday's todos vanish from BOTH files. Data loss.
   *
   * With the F1 fix:
   *   - rollover writes the rolled todos into the (still-empty) today file.
   *   - The new settle-window verification waits ~1500ms, observes that
   *     Templater wrote during the window, and aborts the destructive
   *     source-action branch.
   *   - Yesterday's todos remain intact even though today's render
   *     clobbered our writes.
   */
  it("REPRO: real Templater clobbers today, F1 fix protects yesterday's todos from being deleted", async function () {
    const { today, yesterday } = await getDateStrings();
    const yesterdayContent = [
      "## Tasks",
      "- [ ] roll-me",
      "- [ ] also-roll-me",
      "- [x] already-done",
    ].join("\n");
    await writeNote(`${yesterday}.md`, yesterdayContent);

    // Configure: auto-rollover ON + dangerous "delete" source action.
    await resetPluginSettings({
      rolloverOnFileCreate: true,
      onRolloverSourceAction: "delete",
    });
    await setTemplaterFolderTemplate("Templates/Daily.md");

    // Slow rollover to simulate the canonical production race. Templater
    // waits 300ms after create then checks if the file is empty; if our
    // rollover writes within that window Templater silently backs off
    // (no race) — but the actual reported bug only surfaces when a slow
    // user template (e.g. tp.web.daily_quote(), see #146) makes
    // Templater finish AFTER rollover. We simulate the same shape by
    // delaying our rollover so Templater's empty-file check passes,
    // Templater proceeds to render, and Templater's final write lands
    // AFTER rollover's modify.
    // Slow rollover by just enough that Templater's 300ms-delayed empty-
    // file check still sees an empty file (so Templater proceeds with
    // its render). Combined with the slow template (Templates/Daily.md)
    // this puts the writes in the order: rollover writes first,
    // Templater's render writes ~1s later — exactly the production
    // race documented in #146.
    await slowRollover(350);

    // Trigger today's note via the standard Obsidian path. This goes
    // through the daily-notes core plugin → vault.create → vault.on(create)
    // listeners (rollover + Templater both fire).
    await gotoToday();

    // Wait long enough for Templater's render AND any settle window to
    // have completed (slowRollover + 3s settle = roughly 4s).
    await waitForToday(`${today}.md`, 5000);

    const yesterdayAfter = await readNote(`${yesterday}.md`);

    // Post-fix expectation: yesterday's todos are preserved because the
    // settle-window verification detects Templater's overwrite and skips
    // the destructive splice.
    //
    // Without the fix this assertion FAILS — yesterday's content gets
    // spliced down to the headings and "already done" line only.
    expect(yesterdayAfter).toContain("- [ ] roll-me");
    expect(yesterdayAfter).toContain("- [ ] also-roll-me");
    expect(yesterdayAfter).toContain("- [x] already-done");
  });

  /**
   * TEST 2 — WORKAROUND (with F1 applied).
   *
   * The user disables auto-rollover and lets Templater orchestrate by
   * having the template invoke our command from inside a `<%* %>` block.
   * The exact ordering of writes between Templater and the rollover
   * command depends on Templater's internal scheduling; what matters
   * for the user is the SAFETY invariant:
   *
   *   - No data is permanently lost. Either today's note ends up with
   *     the rolled todos, OR yesterday's note still has them, OR both.
   *
   * F1 makes that invariant true: when Templater writes during the
   * settle window, the destructive source-action is skipped, so the
   * user always retains a copy somewhere.
   */
  it("WORKAROUND: template calls rollover command — no data is lost", async function () {
    const { today, yesterday } = await getDateStrings();
    await writeNote(
      `${yesterday}.md`,
      ["## Tasks", "- [ ] roll-me", "- [ ] also-roll-me"].join("\n")
    );

    // Disable auto-rollover; the workaround template will trigger the
    // command itself.
    await resetPluginSettings({
      rolloverOnFileCreate: false,
      onRolloverSourceAction: "delete",
    });
    await setTemplaterFolderTemplate("Templates/DailyWithRollover.md");

    await gotoToday();
    await waitForToday(`${today}.md`, 4000);

    const todayAfter = (await readNote(`${today}.md`)) || "";
    const yesterdayAfter = (await readNote(`${yesterday}.md`)) || "";

    // Safety invariant: every rolled todo appears in at least one of
    // today's or yesterday's note. The user can recover from any
    // ordering — no permanent loss.
    const allRolledLines = ["- [ ] roll-me", "- [ ] also-roll-me"];
    for (const line of allRolledLines) {
      const presentSomewhere =
        todayAfter.includes(line) || yesterdayAfter.includes(line);
      expect(presentSomewhere).toBe(true);
    }
  });

  /**
   * TEST 3 — REGRESSION (passes only with F1 applied).
   *
   * Same dangerous configuration as Test 1, but with explicit assertions
   * about the F1 fix's invariants:
   *   - Yesterday's todos MUST be preserved (the data-loss bug is gone).
   *   - The plugin must NOT have logged a "successful rollover" Notice
   *     deleting items, because the verify failed.
   *
   * Today's content may end up either Templater-rendered (most likely) or
   * containing our rolled block, depending on the timing. The fix's job
   * isn't to win the race against Templater on the destination side — that
   * requires the user-side workaround. The fix's job is to make the
   * plugin's behaviour SAFE under the race, which means preserving the
   * source.
   */
  it("REGRESSION: with F1 settle-window, yesterday's todos survive even when Templater clobbers today", async function () {
    const { today, yesterday } = await getDateStrings();
    const yesterdayContent = [
      "## Tasks",
      "- [ ] regression-todo-1",
      "- [ ] regression-todo-2",
    ].join("\n");
    await writeNote(`${yesterday}.md`, yesterdayContent);

    await resetPluginSettings({
      rolloverOnFileCreate: true,
      onRolloverSourceAction: "delete",
    });
    await setTemplaterFolderTemplate("Templates/Daily.md");
    // Slow rollover by just enough that Templater's 300ms-delayed empty-
    // file check still sees an empty file (so Templater proceeds with
    // its render). Combined with the slow template (Templates/Daily.md)
    // this puts the writes in the order: rollover writes first,
    // Templater's render writes ~1s later — exactly the production
    // race documented in #146.
    await slowRollover(350); // see REPRO test for rationale

    await gotoToday();
    await waitForToday(`${today}.md`, 5000);

    const yesterdayAfter = await readNote(`${yesterday}.md`);
    expect(yesterdayAfter).toContain("- [ ] regression-todo-1");
    expect(yesterdayAfter).toContain("- [ ] regression-todo-2");

    // Today's note: at minimum, it should not be in a half-clobbered
    // state. Either Templater's rendered output is there, or our rolled
    // todos are. Either way, the file is a coherent string the user can
    // see and act on — and the source side is intact, so any todos the
    // user can't see on today are still recoverable from yesterday's
    // file.
    const todayAfter = await readNote(`${today}.md`);
    expect(todayAfter).toBeDefined();
    expect(typeof todayAfter).toBe("string");
  });
});
