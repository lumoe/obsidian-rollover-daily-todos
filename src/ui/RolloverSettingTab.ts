import { Setting, PluginSettingTab, type App, Plugin, TFile } from "obsidian";

import { getDailyNoteSettings } from "obsidian-daily-notes-interface";
import RolloverTodosPlugin from "src/main";

export class RolloverSettingTab extends PluginSettingTab {
    plugin: RolloverTodosPlugin;
    constructor(app: App, plugin: RolloverTodosPlugin) {
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

        if (file === null || !(file instanceof TFile)) {
            // file not available, no template-heading can be returned
            return [];
        }

        const templateContents = await this.app.vault.read(file);
        const allHeadings = Array.from(
            templateContents.matchAll(/#{1,} .*/g)
        ).map(([heading]) => heading);
        return allHeadings;
    }

    async display() {
        const templateHeadings: string[] = await this.getTemplateHeadings();

        this.containerEl.empty();
        new Setting(this.containerEl)
            .setName("Template heading")
            .setDesc(
                "Which heading from your template should the todos go under"
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        ...templateHeadings.reduce((acc, heading: string) => {
                            acc["heading"] = heading;
                            return acc;
                        }, {} as { heading?: string }),
                        none: "None",
                    })
                    .setValue(this.plugin?.settings.templateHeading)
                    .onChange((value) => {
                        this.plugin.settings.templateHeading = value;
                        this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName("Delete old pending tasks")
            .setDesc(
                `Enabled: Pending todos are not kept. (⚠️ Destructive! May result in lost data). \
                Disabled: All pending tasks are kept.`
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.deleteOnComplete || false)
                    .onChange((value) => {
                        this.plugin.settings.deleteOnComplete = value;
                        this.plugin.saveSettings();
                    })
            );

        new Setting(this.containerEl)
            .setName("Do not keep finished todos")
            .setDesc(
                `Enabled: Finished todos are not kept. (⚠️ Destructive! May result in lost data). \
            Disabled: All finished tasks are kept.`
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(
                        this.plugin.settings.deleteFinishedOnComplete || false
                    )
                    .onChange((value) => {
                        this.plugin.settings.deleteFinishedOnComplete = value;
                        this.plugin.saveSettings();
                    })
            );

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
            .setName("Automatic rollover on daily note open")
            .setDesc(
                `If enabled, the plugin will automatically rollover todos when you open a daily note.`
            )
            .addToggle((toggle) =>
                toggle
                    // Default to true if the setting is not set
                    .setValue(
                        this.plugin.settings.rolloverOnFileCreate ===
                            undefined ||
                            this.plugin.settings.rolloverOnFileCreate === null
                            ? true
                            : this.plugin.settings.rolloverOnFileCreate
                    )
                    .onChange((value) => {
                        console.log(value);
                        this.plugin.settings.rolloverOnFileCreate = value;
                        this.plugin.saveSettings();
                        this.plugin
                            .loadData()
                            .then((value) => console.log(value));
                    })
            );
    }
}
