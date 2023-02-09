import { Notice, Plugin, moment, TFile } from "obsidian";
import { RolloverSettingTab } from "./settings";
import { getTodos } from "./get-todos";
import path from "path";
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

const getFileMoment = (file: TFile, format: string): moment.Moment => {
  return moment(path.basename(file.path, ".md"), format);
};

const filterOutEmptyTodos = (lines: Array<string>): Array<string> => {
  return lines.filter((l) => l.trim() !== "- [ ]");
};

export default class RolloverTodosPlugin extends Plugin {
  settings: Settings;

  async loadSettings() {
    const templateHeadings = await this.getTemplateHeadings();
    const DEFAULT_SETTINGS: Settings = {
      deleteOnComplete: false,
      removeEmptyTodos: false,
      rolloverChildren: false,
      headings: templateHeadings.map((th) => {
        return { name: th, checked: false };
      }),
    };
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

  getLastDailyNote(): TFile {
    const { format } = this.getDailyNoteSettings();

    const dailyNoteFiles = this.app.vault
      .getMarkdownFiles()
      .filter(
        (file) =>
          this.isDailyNote(file) &&
          getFileMoment(file, format).isSameOrBefore(moment(), "day")
      )
      .sort(
        (a, b) =>
          getFileMoment(b, format).valueOf() -
          getFileMoment(a, format).valueOf()
      );

    return dailyNoteFiles[1];
  }

  getDailyNoteSettings(): DailyNoteSettings {
    const { folder, format, template } =
      // @ts-ignore
      this.app.internalPlugins.getPluginById("daily-notes")?.instance
        ?.options || {};
    return {
      format: format || "YYYY-MM-DD",
      folder: folder ? path.basename(folder?.trim()) : "",
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

  async getTemplateHeadings() {
    let { template } = this.getDailyNoteSettings();
    if (!template) return [];

    if (!template.endsWith(".md")) {
      template = template + ".md";
    }

    let file = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path === template)[0];

    const templateContents = await this.app.vault.read(file);
    const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
      ([heading]) => heading
    );
    return allHeadings;
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
      .filter((s) => s) // Only keep the variables with content
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
