import { Notice, Plugin } from "obsidian";
import {
  getDailyNoteSettings,
  getTodaysDailyNote,
  isDailyNotesEnabled,
} from "./daily-notes";
import UndoModal from "./ui/UndoModal";
import RolloverSettingTab from "./ui/RolloverSettingTab";
import { getTodos } from "./get-todos";
import { buildNewDailyNoteContent, verifyTodosPresent } from "./insert-todos";
import {
  getTodosBySection,
  buildSectionRoutedContent,
} from "./section-routing";
import {
  applySourceAction,
  ensureMarkerInDoneStatusMarkers,
  migrateSourceActionSettings,
  resolveSourceAction,
} from "./source-action";

const MAX_TIME_SINCE_CREATION = 5000; // 5 seconds

// (#155/#89/#144/#146/#105/#162) Templater-safety settle window. After we
// write today's note, wait this long for any *other* plugin (Templater,
// Obsidian Sync, etc.) to also write the file. If something else writes,
// we treat the destination write as not-verified and skip the destructive
// `applySourceAction` step on yesterday's note. This keeps yesterday's
// todos intact under the Templater race even though the user may still
// see Templater's rendered template overwrite the rolled block on today's
// side. The 3000ms window is generous: Templater itself waits 300ms
// before reading the empty file and rendering, and slow user templates
// (e.g. <% tp.web.daily_quote() %> per #146) can take >1s. The cost is
// 3s of extra latency on every rollover where the source action is
// destructive — only "delete"/"mark" pay this; the default "none" skips
// it entirely.
const SETTLE_WINDOW_MS = 3000;

export default class RolloverTodosPlugin extends Plugin {
  async loadSettings() {
    const DEFAULT_SETTINGS = {
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
      // (#143/#37/#33/#164) parse yesterday into per-heading buckets and route
      // each bucket to the matching heading on today's side. Related, but not
      // equivalent, to source-filter requests (#68/#54/#126/#150).
      rolloverToMatchingSections: false,
      // (#153/#48/#106/#128/#142) tri-state replacement for deleteOnComplete:
      //   "none"   — leave yesterday's note untouched (safest default)
      //   "delete" — splice rolled lines out of yesterday's note (legacy)
      //   "mark"   — rewrite checkbox content on yesterday's side
      onRolloverSourceAction: "none",
      rolloverSourceMarker: ">",
    };
    const stored = (await this.loadData()) || {};
    // (#162) recover any persisted undo state so undo survives Obsidian restart
    this._persistedUndo = stored._undo || null;
    const { _undo, ...settings } = stored;
    this.settings = ensureMarkerInDoneStatusMarkers(
      migrateSourceActionSettings(
        Object.assign({}, DEFAULT_SETTINGS, settings),
        settings
      )
    );
  }

  async saveSettings() {
    await this.saveData({
      ...this.settings,
      _undo: this._persistedUndo || null,
    });
  }

  // (#162) persist the latest undo state so it survives plugin reload/restart.
  // Files are referenced by path; restoreUndoFiles() resolves them at undo time.
  async persistUndo(instance) {
    this._persistedUndo = {
      time: new Date().toISOString(),
      today: instance.today.file
        ? {
            path: instance.today.file.path,
            oldContent: instance.today.oldContent,
          }
        : null,
      previousDay: instance.previousDay.file
        ? {
            path: instance.previousDay.file.path,
            oldContent: instance.previousDay.oldContent,
          }
        : null,
    };
    await this.saveSettings();
  }

  isDailyNotesEnabled() {
    return isDailyNotesEnabled(this.app);
  }

  getLastDailyNote() {
    const { moment } = window;
    let { folder, format } = getDailyNoteSettings(this.app);

    folder = this.getCleanFolder(folder);
    folder = folder.length === 0 ? folder : folder + "/";

    const dailyNoteRegexMatch = new RegExp("^" + folder + "(.*).md$");
    const todayMoment = moment();

    // get all notes in directory that aren't null
    const dailyNoteFiles = this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(folder))
      .filter((file) =>
        moment(
          file.path.replace(dailyNoteRegexMatch, "$1"),
          format,
          true
        ).isValid()
      )
      .filter((file) => file.basename)
      .filter((file) =>
        this.getFileMoment(file, folder, format).isSameOrBefore(
          todayMoment,
          "day"
        )
      );

    // sort by date
    const sorted = dailyNoteFiles.sort(
      (a, b) =>
        this.getFileMoment(b, folder, format).valueOf() -
        this.getFileMoment(a, folder, format).valueOf()
    );
    return sorted[1];
  }

  getFileMoment(file, folder, format) {
    let path = file.path;

    if (path.startsWith(folder)) {
      // Remove length of folder from start of path
      path = path.substring(folder.length);
    }

    if (path.endsWith(`.${file.extension}`)) {
      // Remove length of file extension from end of path
      path = path.substring(0, path.length - file.extension.length - 1);
    }

    return moment(path, format);
  }

  async getAllUnfinishedTodos(file) {
    const dn = await this.app.vault.read(file);
    const dnLines = dn.split(/\r?\n|\r|\n/g);

    return getTodos({
      lines: dnLines,
      withChildren: this.settings.rolloverChildren,
      doneStatusMarkers: this.settings.doneStatusMarkers,
      ignoreBlockquotes: this.settings.ignoreBlockquotes,
      skipCompletedChildren: this.settings.skipCompletedChildren,
    });
  }

  getCleanFolder(folder) {
    // Check if user defined folder with root `/` e.g. `/dailies`
    if (folder.startsWith("/")) {
      folder = folder.substring(1);
    }

    // Check if user defined folder with trailing `/` e.g. `dailies/`
    if (folder.endsWith("/")) {
      folder = folder.substring(0, folder.length - 1);
    }

    return folder;
  }

  // Plain millisecond sleep, extracted so tests can stub it if needed.
  async waitForSettle(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async rollover(file = undefined) {
    /*** First we check if the file created is actually a valid daily note ***/
    let { folder, format } = getDailyNoteSettings(this.app);
    let ignoreCreationTime = false;

    // Rollover can be called, but we need to get the daily file
    if (file == undefined) {
      file = getTodaysDailyNote(this.app);
      ignoreCreationTime = true;
    }
    if (!file) return;

    folder = this.getCleanFolder(folder);

    // is a daily note
    if (!file.path.startsWith(folder)) return;

    // is today's daily note
    const today = new Date();
    const todayFormatted = window.moment(today).format(format);
    const filePathConstructed = `${folder}${
      folder == "" ? "" : "/"
    }${todayFormatted}.${file.extension}`;
    if (filePathConstructed !== file.path) return;

    // was just created
    if (
      today.getTime() - file.stat.ctime > MAX_TIME_SINCE_CREATION &&
      !ignoreCreationTime
    )
      return;

    /*** Next, if it is a valid daily note, but we don't have daily notes enabled, we must alert the user ***/
    if (!this.isDailyNotesEnabled()) {
      new Notice(
        "RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).",
        10000
      );
    } else {
      const {
        templateHeading,
        removeEmptyTodos,
        leadingNewLine,
        appendBelowExistingTasks,
        skipHorizontalRule,
        skipExistingTodos,
        rolloverToMatchingSections,
        rolloverSourceMarker,
      } = this.settings;
      const sourceAction = resolveSourceAction(this.settings);
      // legacy: a deleteOnComplete=true checkbox in the UI still surfaces the
      // "deleted N empty todos" message text below
      const deleteOnComplete = sourceAction === "delete";

      // check if there is a daily note from yesterday
      const lastDailyNote = this.getLastDailyNote();
      if (!lastDailyNote) return;

      // get unfinished todos from yesterday, if exist
      let todos_yesterday = await this.getAllUnfinishedTodos(lastDailyNote);

      if (todos_yesterday.length == 0) {
        return;
      }

      // setup undo history
      let undoHistoryInstance = {
        previousDay: {
          file: undefined,
          oldContent: "",
        },
        today: {
          file: undefined,
          oldContent: "",
        },
      };

      // Potentially filter todos from yesterday for today. Shared between
      // the legacy path and the section-routing path; the latter re-parses
      // yesterday into per-heading buckets and applies the same filter to
      // each bucket below.
      const isEmptyTodoLine = (line) => {
        const t = (line || "").trim();
        return t === "- [ ]" || t === "- [  ]";
      };
      let todosAdded = 0;
      let emptiesToNotAddToTomorrow = 0;
      let todos_today = !removeEmptyTodos ? todos_yesterday : [];
      if (removeEmptyTodos) {
        todos_yesterday.forEach((line) => {
          if (!isEmptyTodoLine(line)) {
            todos_today.push(line);
            todosAdded++;
          } else {
            emptiesToNotAddToTomorrow++;
          }
        });
      } else {
        todosAdded = todos_yesterday.length;
      }

      // get today's content and modify it
      let templateHeadingNotFoundMessage = "";
      const templateHeadingSelected = templateHeading !== "none";
      let insertionVerified = todos_today.length === 0;

      if (todos_today.length > 0) {
        const dailyNoteContent = await this.app.vault.read(file);
        undoHistoryInstance.today = {
          file: file,
          oldContent: `${dailyNoteContent}`,
        };

        let newContent;
        let templateHeadingFound = true;

        if (rolloverToMatchingSections) {
          // (cluster C) re-parse yesterday into per-heading buckets and route
          // each bucket to its matching heading on today's side
          const yesterdayContent = await this.app.vault.read(lastDailyNote);
          const yesterdayLines = yesterdayContent.split(/\r?\n/);
          const todosBySection = getTodosBySection({
            lines: yesterdayLines,
            withChildren: this.settings.rolloverChildren,
            doneStatusMarkers: this.settings.doneStatusMarkers,
            ignoreBlockquotes: this.settings.ignoreBlockquotes,
            skipCompletedChildren: this.settings.skipCompletedChildren,
          });
          // Apply removeEmptyTodos to each bucket and recompute counts so
          // the user-facing Notice reflects what was actually inserted.
          if (removeEmptyTodos) {
            todosAdded = 0;
            emptiesToNotAddToTomorrow = 0;
            for (const bucket of todosBySection.values()) {
              const kept = [];
              for (const line of bucket.todos) {
                if (isEmptyTodoLine(line)) {
                  emptiesToNotAddToTomorrow++;
                } else {
                  kept.push(line);
                  todosAdded++;
                }
              }
              bucket.todos = kept;
            }
          }
          const result = buildSectionRoutedContent({
            dailyNoteContent,
            todosBySection,
            fallbackHeading: templateHeading,
            leadingNewLine,
            appendBelowExistingTasks,
            skipHorizontalRule,
            skipExistingTodos,
          });
          newContent = result.content;
        } else {
          const result = buildNewDailyNoteContent({
            dailyNoteContent,
            todos: todos_today,
            templateHeading,
            leadingNewLine,
            appendBelowExistingTasks,
            skipHorizontalRule,
            skipExistingTodos,
          });
          newContent = result.content;
          templateHeadingFound = result.templateHeadingFound;
        }

        if (
          !rolloverToMatchingSections &&
          templateHeadingSelected &&
          !templateHeadingFound
        ) {
          templateHeadingNotFoundMessage = `Rollover couldn't find '${templateHeading}' in today's daily note. Rolling todos to end of file.`;
        }

        // (F1, #155/#89/#144/#146/#105/#162) Templater-safety settle
        // window. Pre-F1, the verify step ran synchronously after our
        // own modify and always passed because vault.read returns the
        // bytes we just wrote. With Templater installed, Templater's
        // overwrite lands tens-to-hundreds of ms later, AFTER the verify
        // had passed and AFTER the destructive source action had already
        // run. Result: data-loss (yesterday cleared, today clobbered).
        //
        // Fix: register a "modify" event listener for THIS specific file,
        // then write our content. Any subsequent write whose payload
        // differs from `newContent` is a third-party clobber and we
        // abort the destructive source action. We also re-read at the
        // end of the settle window as a belt-and-braces check (covers
        // scenarios where the modify event fires later than the actual
        // write).
        //
        // The settle window only runs when the source action is
        // destructive ("delete"/"mark"). For "none" the verify is moot
        // and the latency is wasteful.
        let externalClobber = false;
        let modifyEventRef = null;
        if (sourceAction !== "none") {
          modifyEventRef = this.app.vault.on("modify", async (modifiedFile) => {
            if (!modifiedFile || modifiedFile.path !== file.path) return;
            try {
              const current = await this.app.vault.read(modifiedFile);
              if (current !== newContent) {
                externalClobber = true;
              }
            } catch (_) {
              // ignore — a missing file would be detected by the
              // post-settle verify below
            }
          });
        }

        await this.app.vault.modify(file, newContent);

        if (sourceAction !== "none") {
          await this.waitForSettle(SETTLE_WINDOW_MS);
          const verifyContent = await this.app.vault.read(file);
          insertionVerified =
            !externalClobber && verifyTodosPresent(verifyContent, todos_today);
          if (!insertionVerified) {
            new Notice(
              "Rollover aborted source-side cleanup: today's note was modified by another plugin (likely Templater) after rollover. Yesterday's note was left unchanged. See README for the recommended Templater workaround.",
              10000
            );
          }
        } else {
          // No source action means no destructive step to guard; treat
          // the write as verified to keep the rest of the flow simple.
          insertionVerified = true;
        }

        if (modifyEventRef) {
          this.app.vault.offref(modifyEventRef);
          modifyEventRef = null;
        }
      }

      // (#153/#48/#106/#128/#142) apply the configured source action
      // ("delete" | "mark" | "none") to yesterday's note. The verification
      // guard from #162 still applies: never modify the source if the
      // destination write didn't take.
      if (sourceAction !== "none" && insertionVerified) {
        const lastDailyNoteContent = await this.app.vault.read(lastDailyNote);
        undoHistoryInstance.previousDay = {
          file: lastDailyNote,
          oldContent: `${lastDailyNoteContent}`,
        };
        const { content: modifiedContent, changed } = applySourceAction({
          content: lastDailyNoteContent,
          todos: todos_yesterday,
          action: sourceAction,
          marker: rolloverSourceMarker,
        });
        if (changed) {
          await this.app.vault.modify(lastDailyNote, modifiedContent);
        }
      }

      // Let user know rollover has been successful with X todos
      const todosAddedString =
        todosAdded == 0
          ? ""
          : `- ${todosAdded} todo${todosAdded > 1 ? "s" : ""} rolled over.`;
      const emptiesToNotAddToTomorrowString =
        emptiesToNotAddToTomorrow == 0
          ? ""
          : deleteOnComplete
          ? `- ${emptiesToNotAddToTomorrow} empty todo${
              emptiesToNotAddToTomorrow > 1 ? "s" : ""
            } removed.`
          : "";
      const part1 =
        templateHeadingNotFoundMessage.length > 0
          ? `${templateHeadingNotFoundMessage}`
          : "";
      const part2 = `${todosAddedString}${
        todosAddedString.length > 0 ? " " : ""
      }`;
      const part3 = `${emptiesToNotAddToTomorrowString}${
        emptiesToNotAddToTomorrowString.length > 0 ? " " : ""
      }`;

      let allParts = [part1, part2, part3];
      let nonBlankLines = [];
      allParts.forEach((part) => {
        if (part.length > 0) {
          nonBlankLines.push(part);
        }
      });

      const message = nonBlankLines.join("\n");
      if (message.length > 0) {
        new Notice(message, 4000 + message.length * 3);
      }
      this.undoHistoryTime = new Date();
      this.undoHistory = [undoHistoryInstance];
      // (#162) persist for cross-restart undo (best-effort; ignore errors)
      this.persistUndo(undoHistoryInstance).catch(() => {});
    }
  }

  async onload() {
    await this.loadSettings();
    this.undoHistory = [];
    this.undoHistoryTime = new Date();

    // (#162) restore in-memory undo from disk if it's still within the 2-minute
    // window. Files are resolved lazily inside the undo callback because the
    // vault API isn't fully ready until layout-ready.
    this.app.workspace.onLayoutReady(() => {
      const persisted = this._persistedUndo;
      if (!persisted || !persisted.time) return;
      const ageMs = Date.now() - new Date(persisted.time).getTime();
      if (ageMs > 2 * 60 * 1000) {
        this._persistedUndo = null;
        this.saveSettings().catch(() => {});
        return;
      }
      const resolve = (slot) => {
        if (!slot) return { file: undefined, oldContent: "" };
        const file = this.app.vault.getAbstractFileByPath(slot.path);
        return file
          ? { file, oldContent: slot.oldContent }
          : { file: undefined, oldContent: "" };
      };
      this.undoHistory = [
        {
          today: resolve(persisted.today),
          previousDay: resolve(persisted.previousDay),
        },
      ];
      this.undoHistoryTime = new Date(persisted.time);
    });

    this.addSettingTab(new RolloverSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        // Check if automatic daily note creation is enabled
        if (!this.settings.rolloverOnFileCreate) return;
        this.rollover(file);
      })
    );

    this.addCommand({
      id: "obsidian-rollover-daily-todos-rollover",
      name: "Rollover Todos Now",
      callback: () => {
        this.rollover();
      },
    });

    this.addCommand({
      id: "obsidian-rollover-daily-todos-undo",
      name: "Undo last rollover",
      checkCallback: (checking) => {
        // no history, don't allow undo
        if (this.undoHistory.length > 0) {
          const now = window.moment();
          const lastUse = window.moment(this.undoHistoryTime);
          const diff = now.diff(lastUse, "seconds");
          // 2+ mins since use: don't allow undo
          if (diff > 2 * 60) {
            return false;
          }
          if (!checking) {
            new UndoModal(this).open();
          }
          return true;
        }
        return false;
      },
    });
  }
}
