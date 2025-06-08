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
    if (file === null) return [];

    const templateContents = await this.app.vault.read(file);
    // Extract text after # and space, and trim
    const allHeadings = Array.from(templateContents.matchAll(/^(#+)\s+(.*)/gm)).map(
      (match) => match[2].trim()
    );
    // Deduplicate headings
    return [...new Set(allHeadings)].filter(h => h.length > 0);
  }

  display() { // Note: display is not async in base class, so getTemplateHeadings needs to be handled appropriately
    this.containerEl.empty();
    this.containerEl.createEl("h3", { text: "General Rollover Settings" });

    // ... (Keep existing settings for Template heading, Delete todos, Remove empty, Roll over children, Automatic rollover, Done status markers) ...
    // For brevity, I'm omitting the existing settings code here, but it should be preserved.
    // Assume the existing settings are recreated here first.

    new Setting(this.containerEl)
      .setName("Template heading")
      .setDesc("Which heading from your template should the todos go under (for todos rolled over from other files).")
      .addDropdown(async (dropdown) => { // Made dropdown population async
        const templateHeadingsRaw = await this.getTemplateHeadings(); // Call it here
        const options = templateHeadingsRaw.reduce((acc, heading) => {
          acc[heading] = heading; // Store the actual heading text
          return acc;
        }, {});
        options["none"] = "None"; // Add none option

        dropdown
          .addOptions(options)
          .setValue(this.plugin?.settings.templateHeading)
          .onChange(async (value) => {
            this.plugin.settings.templateHeading = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(this.containerEl)
      .setName("Delete todos from previous day")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteOnComplete || false)
          .onChange(async (value) => {
            this.plugin.settings.deleteOnComplete = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Remove empty todos in rollover")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.removeEmptyTodos || false)
          .onChange(async (value) => {
            this.plugin.settings.removeEmptyTodos = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Roll over children of todos")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rolloverChildren || false)
          .onChange(async (value) => {
            this.plugin.settings.rolloverChildren = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Automatic rollover on daily note open")
      .addToggle((toggle) =>
        toggle
          .setValue(
            this.plugin.settings.rolloverOnFileCreate === undefined ||
              this.plugin.settings.rolloverOnFileCreate === null
              ? true
              : this.plugin.settings.rolloverOnFileCreate
          )
          .onChange(async (value) => {
            this.plugin.settings.rolloverOnFileCreate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Done status markers")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.doneStatusMarkers || "xX-")
          .onChange(async (value) => {
            this.plugin.settings.doneStatusMarkers = value;
            await this.plugin.saveSettings();
          })
      );

    // New section for Excluded Headings from Template
    this.containerEl.createEl("h3", { text: "Exclude Headings from Rollover (from Daily Note Template)" });

    // Ensure excludedHeadings is an array
    if (!Array.isArray(this.plugin.settings.excludedHeadings)) {
        // Attempt to convert from old string format or initialize
        const currentVal = this.plugin.settings.excludedHeadings;
        if (typeof currentVal === 'string' && currentVal.length > 0) {
            this.plugin.settings.excludedHeadings = currentVal.split(',').map(h => h.trim()).filter(h => h.length > 0);
        } else {
            this.plugin.settings.excludedHeadings = [];
        }
        // No immediate save here, will be saved if a toggle changes or when settings tab is closed if dirty.
    }

    this.getTemplateHeadings().then(templateHeadings => {
      if (templateHeadings.length === 0) {
        this.containerEl.createEl("p", { text: "No headings found in your daily note template, or template not configured. Configure daily note template to select headings to exclude." });
        return;
      }

      // Create a Setting group for the list of toggles
      const exclusionGroup = new Setting(this.containerEl)
        .setName("Select template headings to exclude")
        .setDesc("Todos under these headings in your daily notes will not be rolled over. This uses headings from your daily note template.");

      // For better layout, create a div to hold the toggles if there are many
      const togglesContainer = this.containerEl.createDiv("excluded-headings-toggles");

      templateHeadings.forEach(headingText => {
        new Setting(togglesContainer) // Add to the dedicated container
          .setName(headingText) // Display the heading text
          .addToggle(toggle => toggle
            .setValue(this.plugin.settings.excludedHeadings.includes(headingText))
            .onChange(async (value) => {
              const currentExcluded = this.plugin.settings.excludedHeadings;
              if (value) {
                if (!currentExcluded.includes(headingText)) {
                  currentExcluded.push(headingText);
                }
              } else {
                const index = currentExcluded.indexOf(headingText);
                if (index > -1) {
                  currentExcluded.splice(index, 1);
                }
              }
              this.plugin.settings.excludedHeadings = currentExcluded;
              await this.plugin.saveSettings();
            })
          );
      });
    }).catch(error => {
        console.error("Error getting template headings for settings tab:", error);
        this.containerEl.createEl("p", { text: "Error loading headings from daily note template." });
    });
  }
}
