import { Notice, Plugin, moment, TFile } from "obsidian";
import { RolloverSettingTab } from "./settings";
import { getTodos } from "./get-todos";
import { getContentBetweenHeadings } from "./utils";

type Settings = {
  deleteOnComplete: boolean;
  removeEmptyTodos: boolean;
  rolloverChildren: boolean;
  headings: Array<{
    name: string;
    checked: boolean;
  }>;
};

export type DailyNoteSettings = {
  format: string;
  folder: string;
  template: string;
};

const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

const filterOutEmptyTodos = (lines: Array<string>): Array<string> => {
  return lines.filter((l) => l.trim() !== "- [ ]");
};

export default class RolloverTodosPlugin extends Plugin {
  settings: Settings;

  async loadSettings() {
    const DEFAULT_SETTINGS: Settings = {
      deleteOnComplete: false,
      removeEmptyTodos: false,
      rolloverChildren: false,
      headings: [],
    };
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  requiredPluginsEnabled() {
    // @ts-ignore
    const dailyNotesPlugin = this.app.internalPlugins.plugins["daily-notes"];
    const dailyNotesEnabled = dailyNotesPlugin && dailyNotesPlugin.enabled;

    // @ts-ignore
    const periodicNotesPlugin = this.app.plugins.getPlugin("periodic-notes");
    const periodicNotesEnabled =
      periodicNotesPlugin && periodicNotesPlugin.settings?.daily?.enabled;

    return dailyNotesEnabled || periodicNotesEnabled;
  }

  momentObjectForPath(
    file: TFile,
    folder: string,
    format: string
  ): moment.Moment {
    let path = file.path;

    if (path.startsWith(`${folder}/`)) {
      // Remove length of folder from start of path
      path = path.substring(folder.length + 1);
    }

    if (path.endsWith(`.${file.extension}`)) {
      // Remove length of file extension from end of path
      path = path.substring(0, path.length - file.extension.length - 1);
    }

    return moment(path, format);
  }

  getLastDailyNote(): TFile {
    const { folder, format } = this.getDailyNoteSettings();
    const dailyNoteRegexMatch = new RegExp("^" + folder + "/(.*).md$");
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
        this.momentObjectForPath(file, folder, format).isSameOrBefore(
          todayMoment,
          "day"
        )
      )
      .sort(
        (a, b) =>
          this.momentObjectForPath(b, folder, format).valueOf() -
          this.momentObjectForPath(a, folder, format).valueOf()
      );

    return dailyNoteFiles[1];
  }

  shouldUsePeriodicNotesSettings = (): boolean => {
    const periodicNotesEnabled =
      // @ts-ignore
      this.app.plugins.enabledPlugins.has("periodic-notes");

    if (periodicNotesEnabled) {
      // @ts-ignore
      const periodicNotes = this.app.plugins.getPlugin("periodic-notes");
      return periodicNotes.settings?.daily?.enabled;
    }

    return false;
  };

  getDailyNoteSettings(): DailyNoteSettings {
    // @ts-ignore
    const { plugins, internalPlugins } = this.app;

    if (this.shouldUsePeriodicNotesSettings()) {
      const { format, folder, template } =
        plugins.getPlugin("periodic-notes")?.settings?.daily || {};
      return {
        format: format || DEFAULT_DATE_FORMAT,
        folder: folder?.trim().replace(/(.*)\/$/, "$1") || "",
        template: template?.trim() || "",
      };
    }

    const { folder, format, template } =
      internalPlugins.getPluginById("daily-notes")?.instance?.options || {};
    return {
      format: format || DEFAULT_DATE_FORMAT,
      folder: folder?.trim().replace(/(.*)\/$/, "$1") || "",
      template: template?.trim() || "",
    };
  }

  async getAllUnfinishedTodos(dn: string) {
    const dnLines = dn.split("\n");

    return getTodos({
      lines: dnLines,
      withChildren: this.settings.rolloverChildren,
    });
  }

  private isDailyNote(file: TFile): boolean {
    const { folder, format } = this.getDailyNoteSettings();
    const r = new RegExp("^" + folder + "/(.*).md$");

    if (
      file.path.startsWith(folder) &&
      moment(file.path.replace(r, "$1"), format, true).isValid()
    ) {
      return true;
    }

    return false;
  }

  private isToday(file: TFile): boolean {
    const today = new Date().toISOString().substring(0, 10);
    return today === file.basename;
  }

  async rollover(file: TFile | null = this.app.workspace.getActiveFile()) {
    // If required plugins aren't enabled, rollover makes no sense
    if (!this.requiredPluginsEnabled()) {
      new Notice(
        "RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).",
        10000
      );
      return;
    }

    // Rollover can be called, but we need to get the daily file
    if (file === null) {
      new Notice("No file open. Can't rollover unfinished todos.", 4000);
      return;
    }

    if (!this.isDailyNote(file)) {
      new Notice(file.basename + " is not a daily note.", 4000);
      return;
    }

    /*** Next, if it is a valid daily note, but we don't have daily notes enabled, we must alert the user ***/
    const { headings, deleteOnComplete, removeEmptyTodos } = this.settings;

    const lastDailyNote = this.getLastDailyNote();

    if (!lastDailyNote) {
      return;
    }

    // get unfinished todos from yesterday, if exist
    let dnContent = await this.app.vault.read(lastDailyNote);

    const todos: { [key: string]: Array<string> } = {};

    const numChosenHeadings = headings.reduce((acc, val) => {
      return val.checked ? acc + 1 : acc;
    }, 0);

    let templateHeadingsNotFound = false;

    if (numChosenHeadings > 0) {
      let i = 0;
      for (const heading of headings) {
        if (heading.checked) {
          let headingContent = "";
          if (headings.length <= i + 1) {
            headingContent = getContentBetweenHeadings(
              heading.name,
              undefined,
              dnContent
            );
          } else {
            headingContent = getContentBetweenHeadings(
              heading.name,
              headings[i + 1].name,
              dnContent
            );
          }
          if (headingContent.length === dnContent.length) {
            todos["none"] = await this.getAllUnfinishedTodos(dnContent);
            templateHeadingsNotFound = true;
            break;
          } else {
            todos[headings[i].name] = await this.getAllUnfinishedTodos(
              headingContent
            );
          }
        }
        i++;
      }
    } else {
      todos["none"] = await this.getAllUnfinishedTodos(dnContent);
      templateHeadingsNotFound = true;
    }

    let numTodos = 0;
    Object.keys(todos).forEach((t) => (numTodos += todos[t].length));

    if (numTodos <= 0) {
      new Notice(
        `rollover-daily-todos: 0 todos found in ${lastDailyNote.basename}.md`,
        4000
      );
      return;
    }

    // Potentially filter todos from yesterday for today
    let emptyTodos = 0;

    if (removeEmptyTodos) {
      let b = numTodos;
      Object.keys(todos).forEach(
        (t) => (todos[t] = filterOutEmptyTodos(todos[t]))
      );
      numTodos = 0;
      Object.keys(todos).forEach((t) => (numTodos += todos[t].length));

      emptyTodos = b - numTodos;
    }

    // get today's content and modify it
    if (numTodos > 0) {
      let dailyNoteContent = await this.app.vault.read(file);

      // If template heading is selected, try to rollover to template heading
      if (numChosenHeadings > 0 && !todos["none"]) {
        const chosenHeadings = headings.filter((h) => h.checked);

        for (const heading of chosenHeadings) {
          dailyNoteContent = dailyNoteContent.replace(
            heading.name,
            `${heading.name}\n\n${todos[heading.name].join("\n")}`
          );
        }
      } else {
        dailyNoteContent += "\n" + todos["none"].join("\n");
      }
      await this.app.vault.modify(file, dailyNoteContent.trim() + "\n");
    }

    // if deleteOnComplete, get yesterday's content and modify it
    if (deleteOnComplete) {
      let lines = dnContent.split("\n");

      for (const t of Object.keys(todos)) {
        lines = lines.filter((l) => !todos[t].includes(l));
      }

      if (removeEmptyTodos) {
        lines = filterOutEmptyTodos(lines);
      }

      await this.app.vault.modify(
        lastDailyNote,
        lines.join("\n").trim() + "\n"
      );
    } else {
      await this.app.vault.modify(lastDailyNote, dnContent.trim() + "\n");
    }

    // Let user know rollover has been successful with X todos
    const headingNotFoundMsg = templateHeadingsNotFound
      ? "Template Heading not found. Rolling over to EOF"
      : "";

    const linesRolledOverMsg = `- ${numTodos} line${
      numTodos === 1 ? "" : "s"
    } rolled over.`;

    const emptyTodosMsg = removeEmptyTodos
      ? `- ${emptyTodos} empty todo${emptyTodos === 1 ? "" : "s"} removed.`
      : "";

    const message = [headingNotFoundMsg, linesRolledOverMsg, emptyTodosMsg]
      .filter(Boolean) // Only keep the variables with content
      .join("\n");
    new Notice(message, 4000);
  }

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new RolloverSettingTab(this.app, this));

    console.log("loading Obsidian Rollover Daily TODOs");

    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (!(file instanceof TFile)) {
          return;
        }

        const isOldFile = new Date().getTime() - file.stat.ctime > 5000;

        if (this.isDailyNote(file) && this.isToday(file) && !isOldFile) {
          this.rollover(file);
        }
      })
    );

    this.addCommand({
      id: "obsidian-rollover-daily-todos-rollover",
      name: "Rollover Todos Now",
      callback: () => this.rollover(),
    });
  }
}
