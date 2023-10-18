import {
    type App,
    Notice,
    Plugin,
    TFile,
    TAbstractFile,
    TFolder,
} from "obsidian";
import {
    getDailyNoteSettings,
    getAllDailyNotes,
    getDailyNote,
} from "obsidian-daily-notes-interface";
import { UndoModal } from "./ui/UndoModal";
import { RolloverSettingTab } from "./ui/RolloverSettingTab";
import { ComplexTodoSpec, getComplexTodos, getTodos } from "./get-todos";
import * as moment from "moment";
declare global {
    interface Window {
        moment: typeof moment;
    }
}

const MAX_TIME_SINCE_CREATION = 5000; // 5 seconds

/* Just some boilerplate code for recursively going through subheadings for later
function createRepresentationFromHeadings(headings) {
  let i = 0;
  const tags = [];

  (function recurse(depth) {
    let unclosedLi = false;
    while (i < headings.length) {
      const [hashes, data] = headings[i].split("# ");
      if (hashes.length < depth) {
        break;
      } else if (hashes.length === depth) {
        if (unclosedLi) tags.push('</li>');
        unclosedLi = true;
        tags.push('<li>', data);
        i++;
      } else {
        tags.push('<ul>');
        recurse(depth + 1);
        tags.push('</ul>');
      }
    }
    if (unclosedLi) tags.push('</li>');
  })(-1);
  return tags.join('\n');
}
*/

interface UndoHistoryInstanceSpec {
    previousDay: {
        file: any | undefined;
        oldContent: string;
    };
    today: {
        file: any | undefined;
        oldContent: string;
    };
}

export interface RolloverSettingsSpec {
    templateHeading: string;
    deleteOnComplete: boolean;
    removeEmptyTodos: boolean;
    rolloverChildren: boolean;
    rolloverOnFileCreate: boolean;
    deleteFinishedOnComplete: boolean;
}

export default class RolloverTodosPlugin extends Plugin {
    settings: RolloverSettingsSpec;
    plugin: RolloverTodosPlugin;

    undoHistory: any[] = [];
    undoHistoryTime = new Date();

    async loadSettings() {
        const DEFAULT_SETTINGS = {
            templateHeading: "none",
            deleteOnComplete: false,
            deleteFinishedOnComplete: false,
            removeEmptyTodos: false,
            rolloverChildren: false,
            rolloverOnFileCreate: true,
        };
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData()
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    isDailyNotesEnabled() {
        const dailyNotesPlugin = (this.app as any).internalPlugins.plugins[
            "daily-notes"
        ];
        const dailyNotesEnabled = dailyNotesPlugin && dailyNotesPlugin.enabled;

        const periodicNotesPlugin = (this.app as any).plugins.getPlugin(
            "periodic-notes"
        );
        const periodicNotesEnabled =
            periodicNotesPlugin && periodicNotesPlugin.settings?.daily?.enabled;

        return dailyNotesEnabled || periodicNotesEnabled;
    }

    getLastDailyNote() {
        const { moment } = window;
        let { folder, format } = getDailyNoteSettings();

        folder = this.getCleanFolder(folder);
        folder = folder.length === 0 ? folder : folder + "/";

        const todayMoment = moment();

        // get all notes in directory that aren't null
        const dailyNoteFiles = this.app.vault
            .getMarkdownFiles()
            .filter((file) => file.path.startsWith(folder))
            .filter((file) => {
                const dailyNoteRegexMatch = new RegExp(
                    "^" + folder + "(.*).md$"
                );
                // replace the the entire file.path with the matched in group (.*)
                const isValid = moment(
                    file.path.replace(dailyNoteRegexMatch, "$1"),
                    format,
                    true
                ).isValid();

                return isValid;
            })
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

    getFileMoment(file: any, folder: string, format: string) {
        let path = file.path;

        if (path.startsWith(folder)) {
            // Remove length of folder from start of path
            path = path.substring(folder.length);
        }

        if (path.endsWith(`.${file.extension}`)) {
            // Remove length of file extension from end of path
            path = path.substring(0, path.length - file.extension.length - 1);
        }

        return window.moment(path, format);
    }
    async getAllComplexTodos(virtualFile: TFile) {
        const content = await this.app.vault.read(virtualFile);
        const lines = content.split(/\r?\n|\r|\n/g);
        return getComplexTodos({
            lines,
            withChildren: this.settings.rolloverChildren,
        });
    }
    async getAllUnfinishedTodos(file: TFile) {
        const dn = await this.app.vault.read(file);
        const dnLines = dn.split(/\r?\n|\r|\n/g);

        return getTodos({
            lines: dnLines,
            withChildren: this.settings.rolloverChildren,
        });
    }

    async sortHeadersIntoHierarchy(file: TFile) {
        ///
        const templateContents = await this.app.vault.read(file);
        const allHeadings = Array.from(
            templateContents.matchAll(/#{1,} .*/g)
        ).map(([heading]) => heading);

        if (allHeadings.length > 0) {
            //
        }
    }

    getCleanFolder(folder: string) {
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

    #getFileStatus(
        file: TFile | undefined,
        allDailyNotes: Record<string, TFile>
    ) {
        let ignoreCreationTime = false;

        // Rollover can be called, but we need to get the daily file
        if (file == undefined) {
            file = getDailyNote(window.moment(), allDailyNotes);
            ignoreCreationTime = true;
        }
        return {
            file,
            ignoreCreationTime,
        };
    }
    async rollover(virtualFile: TFile | undefined = undefined): Promise<void> {
        /*** First we check if the file created is actually a valid daily note ***/
        let { folder, format } = getDailyNoteSettings();
        const allDailyNotes = getAllDailyNotes();
        const { file, ignoreCreationTime } = this.#getFileStatus(
            virtualFile,
            allDailyNotes
        );
        if (!file) {
            return;
        }

        folder = this.getCleanFolder(folder);

        // is a daily note
        if (!file.path.startsWith(folder)) {
            return;
        }

        // is today's daily note
        const today = new Date();
        const todayFormatted = window.moment(today).format(format);
        const filePathConstructed = `${folder}${
            folder == "" ? "" : "/"
        }${todayFormatted}.${file.extension}`;

        if (filePathConstructed !== file.path) {
            return;
        }
        // was just created
        if (
            today.getTime() - file.stat.ctime > MAX_TIME_SINCE_CREATION &&
            !ignoreCreationTime
        ) {
            return;
        }

        /*** Next, if it is a valid daily note, but we don't have daily notes enabled, we must alert the user ***/
        if (this.isDailyNotesEnabled() === false) {
            new Notice(
                "RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).",
                10000
            );
            return;
        }
        await this.doGenDailyNotesStrategy(file);
    }

    scrapeComplexTodosForPendingRootFamily(complexTodos: ComplexTodoSpec[]) {
        let keep = 0;
        const targetTodos = [];

        for (let i = 0; i < complexTodos.length; i++) {
            const complexTodo = complexTodos[i];
            if (complexTodo.type === "done") {
                keep = +1;
            }
            if (complexTodo.type === "pending") {
                keep = -1;
            }

            if (keep < 0) {
                targetTodos.push(complexTodo);
            }
        }

        return targetTodos;
    }

    async doGenDailyNotesStrategy(file: TFile): Promise<void> {
        const {
            templateHeading,
            deleteOnComplete,
            removeEmptyTodos,
            deleteFinishedOnComplete,
        } = this.settings;

        // check if there is a daily note from yesterday
        const lastDailyNote = this.getLastDailyNote();
        if (!lastDailyNote) return;

        // TODO: Rollover to subheadings (optional)
        //this.sortHeadersIntoHierarchy(lastDailyNote)

        // get unfinished todos from yesterday, if exist
        // BUG here where getting all unfinished todos means that the first item is missing when it is being read.
        let todos_yesterday = await this.getAllUnfinishedTodos(lastDailyNote);
        let complexTodos = await this.getAllComplexTodos(lastDailyNote);

        if (todos_yesterday.length == 0) {
            return;
        }

        // setup undo history
        let undoHistoryInstance: UndoHistoryInstanceSpec = {
            previousDay: {
                file: undefined,
                oldContent: "",
            },
            today: {
                file: undefined,
                oldContent: "",
            },
        };

        // Potentially filter todos from yesterday for today
        let todosAdded = 0;
        let emptiesToNotAddToTomorrow = 0;
        let todos_today = removeEmptyTodos === false ? todos_yesterday : [];
        if (removeEmptyTodos) {
            todos_yesterday.forEach((line, i) => {
                const trimmedLine = (line || "").trim();
                if (trimmedLine != "- [ ]" && trimmedLine != "- [  ]") {
                    todos_today.push(line);
                    todosAdded++;
                } else {
                    emptiesToNotAddToTomorrow++;
                }
            });
        } else {
            todosAdded = todos_yesterday.length;
        }

        const rootFamilies =
            this.scrapeComplexTodosForPendingRootFamily(complexTodos);
        // get today's content and modify it
        let templateHeadingNotFoundMessage = "";
        const templateHeadingSelected = templateHeading !== "none";

        if (rootFamilies.length > 0) {
            let dailyNoteContent = await this.app.vault.read(file);
            undoHistoryInstance.today = {
                file: file,
                oldContent: `${dailyNoteContent}`,
            };
            const todos_todayString = `\n${rootFamilies
                .map(({ text }) => text)
                .join("\n")}`;

            // If template heading is selected, try to rollover to template heading
            if (templateHeadingSelected) {
                const contentAddedToHeading = dailyNoteContent.replace(
                    templateHeading,
                    `${templateHeading}${todos_todayString}`
                );
                if (contentAddedToHeading == dailyNoteContent) {
                    templateHeadingNotFoundMessage = `Rollover couldn't find '${templateHeading}' in today's daily not. Rolling todos to end of file.`;
                } else {
                    dailyNoteContent = contentAddedToHeading;
                }
            }

            // Rollover to bottom of file if no heading found in file, or no heading selected
            if (
                !templateHeadingSelected ||
                templateHeadingNotFoundMessage.length > 0
            ) {
                dailyNoteContent += todos_todayString;
            }

            await this.app.vault.modify(file, dailyNoteContent);
        }

        // if deleteOnComplete, get yesterday's content and modify it
        // deletes all unchecked todos from yesterday
        if (deleteOnComplete) {
            let lastDailyNoteContent = await this.app.vault.read(lastDailyNote);
            undoHistoryInstance.previousDay = {
                file: lastDailyNote,
                oldContent: `${lastDailyNoteContent}`,
            };
            let lines = lastDailyNoteContent.split("\n");

            for (let z = lines.length; z >= 0; z--) {
                const current_line = lines[z];

                if (todos_yesterday.includes(current_line)) {
                    lines.splice(z, 1);
                }
            }

            const modifiedContent = lines.join("\n");
            await this.app.vault.modify(lastDailyNote, modifiedContent);
        }

        // deletes all completed todos from yesterday
        if (deleteFinishedOnComplete) {
            let lastDailyNoteContent = await this.app.vault.read(lastDailyNote);
            undoHistoryInstance.previousDay = {
                file: lastDailyNote,
                oldContent: `${lastDailyNoteContent}`,
            };
            let lines = lastDailyNoteContent.split("\n");
            const deleteIndexes = [];
            const targetTodos = [];
            let keep = 0;
            for (let i = 0; i < complexTodos.length; i++) {
                const complexTodo = complexTodos[i];
                if (complexTodo.type === "done") {
                    keep = 1;
                }
                if (complexTodo.type === "pending") {
                    keep = -1;
                }
                console.log({
                    complexTodo,
                    complexTodos,
                    keep,
                    i,
                    targetTodos,
                });
                if (keep > 0) {
                    targetTodos.push(complexTodo);
                }
            }
            const targetTexts = targetTodos.map(({ text }) => text);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (targetTexts.includes(line)) {
                    deleteIndexes.push(i);
                }
            }

            for (const deleteIndex of deleteIndexes) {
                lines[deleteIndex] = null;
            }
            // FEATURE Should delete old stuff
            await this.app.vault.modify(
                lastDailyNote,
                lines.filter(Boolean).join("\n")
            );
            // await this.app.vault.modify(lastDailyNote, modifiedContent);
        }

        // Let user know rollover has been successful with X todos
        const todosAddedString =
            todosAdded == 0
                ? ""
                : `- ${todosAdded} todo${
                      todosAdded > 1 ? "s" : ""
                  } rolled over.`;
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
        let nonBlankLines: typeof allParts = [];
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
    }

    async onload() {
        await this.loadSettings();
        this.undoHistory = [];
        this.undoHistoryTime = new Date();

        this.addSettingTab(new RolloverSettingTab(this.app, this));

        this.registerEvent(
            this.app.vault.on("create", async (file: TAbstractFile) => {
                // Check if automatic daily note creation is enabled
                // if (!this.settings.rolloverOnFileCreate) return;
                if (file instanceof TFile) {
                    this.rollover(file);
                }
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
