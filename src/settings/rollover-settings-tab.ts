import { Setting, PluginSettingTab, App } from "obsidian";
import RolloverTodosPlugin, { DailyNoteSettings } from "src";
import path from "path";

const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

export class RolloverSettingTab extends PluginSettingTab {
  plugin: RolloverTodosPlugin;

  constructor(app: App, plugin: RolloverTodosPlugin) {
    super(app, plugin);
    this.plugin = plugin;
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

  async display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Rollover Daily TODOs - Settings" });

    // Template Headers
    const con = containerEl.createEl("div", { cls: "setting-item" });
    const d = con.createEl("div", { cls: "setting-item-info" });
    d.createEl("b", { text: "Template Headings", cls: "setting-item-name" });
    d.createEl("div", {
      text: "The headings from your daily-template that act as the source and target to roll over TODOs",
      cls: "setting-item-description",
    });

    this.plugin.settings.headings.forEach((header, i) => {
      new Setting(containerEl).setName(header.name).addToggle((toggle) => {
        toggle.setValue(header.checked).onChange((v) => {
          this.plugin.settings.headings[i].checked =
            !this.plugin.settings.headings[i].checked;
          this.plugin.saveSettings();
        });
      });
    });

    containerEl.createEl("div", { cls: "rollover-todos-spacer" });

    new Setting(containerEl)
      .setName("Delete todos from previous day")
      .setDesc(
        `Once todos are found, they are added to Today's Daily Note. If successful, they are deleted from Yesterday's Daily note. Enabling this is destructive and may result in lost data. Keeping this disabled will simply duplicate them from yesterday's note and place them in the appropriate section. Note that currently, duplicate todos will be deleted regardless of what heading they are in, and which heading you choose from above.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteOnComplete || false)
          .onChange((value) => {
            this.plugin.settings.deleteOnComplete = value;
            this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("Roll over children of todos")
      .setDesc(
        `By default, only the acutal todos are rolled over. If you add nested Markdown-elements beneath your todos, these are not rolled over but stay in place, possibly altering the logic of your previous note. This setting allows for also migrating the nested elements.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rolloverChildren || false)
          .onChange((value) => {
            this.plugin.settings.rolloverChildren = value;
            this.plugin.saveSettings();
          })
      );
  }
}
