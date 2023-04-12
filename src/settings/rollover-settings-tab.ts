import { Setting, PluginSettingTab, App } from "obsidian";
import RolloverTodosPlugin from "src";

export class RolloverSettingTab extends PluginSettingTab {
  plugin: RolloverTodosPlugin;

  constructor(app: App, plugin: RolloverTodosPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async getTemplateHeadings() {
    let { template } = this.plugin.getDailyNoteSettings();
    if (!template) return [];

    if (!template.endsWith(".md")) {
      template = template + ".md";
    }

    let file = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path === template)[0];

    if (file === null) {
      // File is not available
      return [];
    }

    const templateContents = await this.app.vault.read(file);
    const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
      ([heading]) => heading
    );
    return allHeadings;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Rollover Daily TODOs - Settings" });

    // Only reload if settings empty
    if (this.plugin.settings.headings.length <= 0) {
      const templateHeadings = await this.getTemplateHeadings();
      this.plugin.settings.headings = templateHeadings.map((th) => {
        return { name: th, checked: false };
      });
    }

    // Template Headers
    if (this.plugin.settings.headings.length >= 0) {
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
    }

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
