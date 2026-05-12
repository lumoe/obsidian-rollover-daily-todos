import { Setting, PluginSettingTab } from "obsidian";
import { getDailyNoteSettings } from "../daily-notes";
import {
  ensureMarkerInDoneStatusMarkers,
  resolveSourceAction,
} from "../source-action";

export default class RolloverSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async getTemplateHeadings() {
    // (#110 / #152) wrap in try/catch — broken template paths or odd Periodic
    // Notes states must not throw, otherwise the entire settings tab renders
    // blank with no way to recover.
    try {
      const { template } = getDailyNoteSettings(this.app);
      if (!template) return [];

      let file = this.app.vault.getAbstractFileByPath(template);
      if (file === null) {
        file = this.app.vault.getAbstractFileByPath(template + ".md");
      }
      if (file === null) return [];

      const templateContents = await this.app.vault.read(file);
      return Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
        ([heading]) => heading
      );
    } catch (err) {
      console.warn(
        "rollover-daily-todos: failed to read template headings",
        err
      );
      return [];
    }
  }

  async display() {
    const templateHeadings = await this.getTemplateHeadings();

    this.containerEl.empty();

    if (templateHeadings.length > 0) {
      new Setting(this.containerEl)
        .setName("Template heading")
        .setDesc("Which heading from your template should the todos go under")
        .addDropdown((dropdown) =>
          dropdown
            .addOptions({
              ...templateHeadings.reduce((acc, heading) => {
                acc[heading] = heading;
                return acc;
              }, {}),
              none: "None",
            })
            .setValue(this.plugin?.settings.templateHeading)
            .onChange((value) => {
              this.plugin.settings.templateHeading = value;
              this.plugin.saveSettings();
            })
        );
    } else {
      // (#110 / #152) free-text fallback when no headings could be parsed
      // from the template. Users with non-resolvable templates or
      // Periodic-Notes 1.0 setups still need to be able to set a heading.
      new Setting(this.containerEl)
        .setName("Template heading")
        .setDesc(
          "We couldn't read any headings from your daily-notes template (template path missing or unreadable). Type the exact heading text — including the leading '#' characters — that today's note will contain, e.g. '## Tasks'. Use 'none' to append todos to the end of the note instead."
        )
        .addText((text) =>
          text
            .setPlaceholder("## Tasks")
            .setValue(this.plugin?.settings.templateHeading || "none")
            .onChange((value) => {
              this.plugin.settings.templateHeading = value || "none";
              this.plugin.saveSettings();
            })
        );
    }

    new Setting(this.containerEl)
      .setName("After rollover, on yesterday's note")
      .setDesc(
        `What to do with the rolled todos on the source (yesterday's) side. "Leave them alone" duplicates and is safest. "Mark them" rewrites the checkbox to a custom character (e.g. '>' to indicate "forwarded"). "Delete them" splices them out (legacy 'Delete todos from previous day' behaviour). Today's note is unaffected by this setting.`
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            none: "Leave them alone (safe default)",
            mark: "Mark them with a custom character",
            delete: "Delete them (legacy)",
          })
          .setValue(resolveSourceAction(this.plugin.settings))
          .onChange((value) => {
            this.plugin.settings.onRolloverSourceAction = value;
            // keep the legacy deleteOnComplete in sync so older code paths and
            // older plugin versions don't behave inconsistently
            this.plugin.settings.deleteOnComplete = value === "delete";
            this.plugin.settings = ensureMarkerInDoneStatusMarkers(
              this.plugin.settings
            );
            this.plugin.saveSettings();
            this.display();
          })
      );

    if (resolveSourceAction(this.plugin.settings) === "mark") {
      new Setting(this.containerEl)
        .setName("Mark character")
        .setDesc(
          `Single character (or grapheme) used in place of the original checkbox content on yesterday's note. Common choices: ">" (forwarded), "-" (cancelled), "/" (in progress).`
        )
        .addText((text) =>
          text
            .setValue(this.plugin.settings.rolloverSourceMarker || ">")
            .onChange((value) => {
              this.plugin.settings.rolloverSourceMarker = value || ">";
              this.plugin.settings = ensureMarkerInDoneStatusMarkers(
                this.plugin.settings
              );
              this.plugin.saveSettings();
            })
        );
    }

    new Setting(this.containerEl)
      .setName("Remove empty todos in rollover")
      .setDesc(
        `If you have empty todos, they will not be rolled over to the next day.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.removeEmptyTodos || false)
          .onChange((value) => {
            this.plugin.settings.removeEmptyTodos = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Roll over children of todos")
      .setDesc(
        `By default, only the actual todos are rolled over. If you add nested Markdown-elements beneath your todos, these are not rolled over but stay in place, possibly altering the logic of your previous note. This setting allows for also migrating the nested elements.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rolloverChildren || false)
          .onChange((value) => {
            this.plugin.settings.rolloverChildren = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Skip completed children")
      .setDesc(
        `When 'Roll over children of todos' is on, drop child todos that are already completed (and their descendants). Non-todo nested content still rolls over.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.skipCompletedChildren || false)
          .onChange((value) => {
            this.plugin.settings.skipCompletedChildren = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Automatic rollover on daily note open")
      .setDesc(
        `If enabled, the plugin will automatically rollover todos when you open a daily note.`
      )
      .addToggle((toggle) =>
        toggle
          // Default to true if the setting is not set
          .setValue(
            this.plugin.settings.rolloverOnFileCreate === undefined ||
              this.plugin.settings.rolloverOnFileCreate === null
              ? true
              : this.plugin.settings.rolloverOnFileCreate
          )
          .onChange((value) => {
            this.plugin.settings.rolloverOnFileCreate = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Ignore todos in callouts / blockquotes")
      .setDesc(
        `When on, todos inside Markdown blockquotes (lines starting with '>') are not rolled over. Useful for habit lists kept inside callouts like '> [!tip]'.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ignoreBlockquotes || false)
          .onChange((value) => {
            this.plugin.settings.ignoreBlockquotes = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Done status markers")
      .setDesc(
        `Characters that represent done status in checkboxes. Default is "xX-". Add any characters that should be considered as marking a task complete.`
      )
      .addText((text) =>
        text
          .setValue(this.plugin.settings.doneStatusMarkers || "xX-")
          .onChange((value) => {
            this.plugin.settings.doneStatusMarkers = value;
            this.plugin.saveSettings();
          })
      );
    new Setting(this.containerEl)
      .setName("Add extra blank line between Heading and Todos")
      .setDesc(
        `Whether to add an extra blank line between the selected Heading and the rolled over todos. This will only work in combination with a configured Template Heading.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.leadingNewLine === undefined ||
              this.plugin.settings.leadingNewLine === null
              ? true
              : this.plugin.settings.leadingNewLine
          )
          .onChange((value) => {
            this.plugin.settings.leadingNewLine = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Append below existing tasks")
      .setDesc(
        `When today's note already has tasks under the chosen heading, place rolled-over tasks at the end of that list (rather than directly under the heading).`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.appendBelowExistingTasks || false)
          .onChange((value) => {
            this.plugin.settings.appendBelowExistingTasks = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Roll over to matching sections")
      .setDesc(
        `Group todos by their heading on yesterday's note and route each group to the same-named heading on today's note (case-insensitive, level-agnostic). Unmatched groups fall back to the configured Template Heading or end of file.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rolloverToMatchingSections || false)
          .onChange((value) => {
            this.plugin.settings.rolloverToMatchingSections = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Skip todos already present today")
      .setDesc(
        `Don't roll over todos whose text already appears in today's note (useful when your daily template bakes in recurring tasks). Comparison is whitespace-trimmed and exact.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.skipExistingTodos || false)
          .onChange((value) => {
            this.plugin.settings.skipExistingTodos = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Place todos below a horizontal rule")
      .setDesc(
        `If your template has '---' immediately under the chosen heading, place rolled-over todos below the rule rather than between heading and rule.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.skipHorizontalRule === undefined ||
              this.plugin.settings.skipHorizontalRule === null
              ? true
              : this.plugin.settings.skipHorizontalRule
          )
          .onChange((value) => {
            this.plugin.settings.skipHorizontalRule = value;
            this.plugin.saveSettings();
          })
      );
  }
}
