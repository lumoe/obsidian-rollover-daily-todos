import { Setting, PluginSettingTab } from "obsidian";
import { getDailyNoteSettings } from "obsidian-daily-notes-interface";

export default class RolloverSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  async getTemplateHeadings() {
    const { template } = getDailyNoteSettings();
    if (!template) return [];

    let file = this.app.vault.getAbstractFileByPath(template);

    if (file === null) {
      file = this.app.vault.getAbstractFileByPath(template + ".md");
    }

    if (file === null) {
      // file not available, no template-heading can be returned
      return [];
    }

    const templateContents = await this.app.vault.read(file);
    const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(
      ([heading]) => heading
    );
    return allHeadings;
  }

  async display() {
    const templateHeadings = await this.getTemplateHeadings();

    this.containerEl.empty();
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

    if (!this.plugin.settings.cancelOnComplete) {
      new Setting(this.containerEl)
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
              this.display()
            })
        );
    }

    if (!this.plugin.settings.deleteOnComplete) {
      new Setting(this.containerEl)
      .setName("Cancel todos from previous day")
      .setDesc(
        `Once todos are found, they are added to Today's Daily Note. If successful, they are cancelled from Yesterday's Daily note (status changed to [-]. Enabling this is destructive and may result in lost data. Keeping this disabled will simply duplicate them from yesterday's note and place them in the appropriate section. Note that currently, duplicate todos will be deleted regardless of what heading they are in, and which heading you choose from above.`
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.cancelOnComplete || false)
          .onChange((value) => {
            this.plugin.settings.cancelOnComplete = value;
            this.plugin.saveSettings();
            this.display();
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
      .setName("Skip existing todos in rollover")
      .setDesc(
        `If a todo from yesterday already exists in todays note, do not roll it over.`
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
            console.log(value);
            this.plugin.settings.rolloverOnFileCreate = value;
            this.plugin.saveSettings();
            this.plugin.loadData().then((value) => console.log(value));
          })
      );
  }
}
