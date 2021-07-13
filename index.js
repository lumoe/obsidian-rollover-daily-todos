import { Notice, Plugin, Setting, PluginSettingTab } from 'obsidian';

const MAX_TIME_SINCE_CREATION = 5000; // 5 seconds

export default class RolloverTodosPlugin extends Plugin {
	async checkDailyNotesEnabled() {
		const corePluginListPath = path.join(this.app.vault.configDir, "core-plugins.json")
		const corePluginList = JSON.parse(await this.app.vault.adapter.read(corePluginListPath))
		return corePluginList.includes('daily-notes')
	}

	getDailyNotesDirectory() {
		if (this.dailyNotesDirectory != null) {
			return this.dailyNotesDirectory;
		}

		this.dailyNotesDirectory = this.app.internalPlugins.plugins['daily-notes'].instance.options.folder;
		return this.dailyNotesDirectory;
	}

	getLastDailyNote() {
		const dailyNotesDirectory = this.getDailyNotesDirectory();

		const files = this.app.vault.getAllLoadedFiles()
			.filter(file => file.path.startsWith(dailyNotesDirectory))
			.filter(file => file.basename != null)
			.sort((a, b) => new Date(b.basename).getTime() - new Date(a.basename).getTime());

		return files[1];
	}

	async getAllUnfinishedTodos(file) {
		const contents = await this.app.vault.read(file);
		const unfinishedTodosRegex = /\t*- \[ \].*/g
		const unfinishedTodos = Array.from(contents.matchAll(unfinishedTodosRegex)).map(([todo]) => todo)
		return unfinishedTodos;
	}

	async onload() {
		this.settings = await this.loadData() || { templateHeading: 'none' };

		if (!await this.checkDailyNotesEnabled()) {
			new Notice('Daily notes plugin is not enabled. Enable it and then reload Obsidian.', 2000)
		}

		this.addSettingTab(new RollverTodosSettings(this.app, this))

		this.registerEvent(this.app.vault.on('create', async (file) => {
			// is a daily note
			const dailyNotesDirectory = this.getDailyNotesDirectory()
			if (!file.path.startsWith(dailyNotesDirectory)) return;

			// is today's daily note
			const today = new Date();
			if (getISOFormattedDate(today) !== file.basename) return;

			// was just created
			if (today.getTime() - file.stat.ctime > MAX_TIME_SINCE_CREATION) return;

			const lastDailyNote = this.getLastDailyNote();
			if (lastDailyNote == null) return;

			const unfinishedTodos = await this.getAllUnfinishedTodos(lastDailyNote)

			let dailyNoteContent = await this.app.vault.read(file)

			if (this.settings.templateHeading !== 'none') {
				const heading = this.settings.templateHeading;
				dailyNoteContent = dailyNoteContent.replace(heading, heading + '\n' + unfinishedTodos.join('\n') + '\n')
			} else {
				dailyNoteContent += '\n' + unfinishedTodos.join('\n')
			}

			await this.app.vault.modify(file, dailyNoteContent);
		}))
	}
}

class RollverTodosSettings extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	async getTemplateHeadings() {
		const template = this.app.internalPlugins.plugins['daily-notes'].instance.options.template;
		if (!template) return [];

		const file = this.app.vault.getAbstractFileByPath(template + '.md')
		const templateContents = await this.app.vault.read(file)
		const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(([heading]) => heading)
		return allHeadings;
	}

	async display() {
		const templateHeadings = await this.getTemplateHeadings()

		this.containerEl.empty()
		new Setting(this.containerEl)
			.setName('Template heading')
			.setDesc('Which heading from your template should the todos go under')
			.addDropdown((dropdown) => dropdown
				.addOptions({
					...templateHeadings.reduce((acc, heading) => {
						acc[heading] = heading;
						return acc;
					}, {}),
					'none': 'None'
				})
				.setValue(this.plugin?.settings.templateHeading)
				.onChange(value => {
					this.plugin.settings.templateHeading = value;
					this.plugin.saveData(this.plugin.settings)
				})
			)
	}
}

/**
 * Return an ISO formatted date only for the users current timezone.
 */
function getISOFormattedDate(date) {
	const month = `${date.getMonth() + 1}`.padStart(2, "0")
	const day = `${date.getDate()}`.padStart(2, "0");
	return date.getFullYear() + "-" + month + "-" + day;
}
