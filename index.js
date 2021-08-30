import { Notice, Plugin, Setting, PluginSettingTab } from 'obsidian';
import { getDailyNoteSettings, getAllDailyNotes, getDailyNote } from 'obsidian-daily-notes-interface'

const MAX_TIME_SINCE_CREATION = 5000; // 5 seconds

export default class RolloverTodosPlugin extends Plugin {

	async loadSettings() {
		const DEFAULT_SETTINGS = {
			templateHeading: 'none',
			deleteOnComplete: false,
			removeEmptyTodos: false,
		}
	  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
	  await this.saveData(this.settings)
	}

	isDailyNotesEnabled() {
    const dailyNotesPlugin = this.app.internalPlugins.plugins['daily-notes'];
		const dailyNotesEnabled = dailyNotesPlugin && dailyNotesPlugin.enabled;

		const periodicNotesPlugin = this.app.plugins.getPlugin("periodic-notes");
		const periodicNotesEnabled = periodicNotesPlugin && periodicNotesPlugin.settings?.daily?.enabled;

    return dailyNotesEnabled || periodicNotesEnabled;
	}

	getLastDailyNote() {
		const { folder } = getDailyNoteSettings();

		const files = this.app.vault.getAllLoadedFiles()
			.filter(file => file.path.startsWith(folder))
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

	async rollover(file = undefined) {
		/*** First we check if the file created is actually a valid daily note ***/
		const { folder, format } = getDailyNoteSettings()
		let ignoreCreationTime = false

		// Rollover can be called, but we need to get the daily file
		if (file == undefined) {
			const allDailyNotes = getAllDailyNotes()
			file = getDailyNote(window.moment(), allDailyNotes)
			ignoreCreationTime = true
		}
		if (!file) return;

		// is a daily note
		if (!file.path.startsWith(folder)) return;

		// is today's daily note
		const today = new Date();
		const todayFormatted = window.moment(today).format(format);
		if (todayFormatted !== file.basename) return;

		// was just created
		if ((today.getTime() - file.stat.ctime > MAX_TIME_SINCE_CREATION) && !ignoreCreationTime) return;

		/*** Next, if it is a valid daily note, but we don't have daily notes enabled, we must alert the user ***/
		if (!this.isDailyNotesEnabled()) {
			new Notice('RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).', 10000)
		} else {
			const { templateHeading, deleteOnComplete, removeEmptyTodos } = this.settings;

			// check if there is a daily note from yesterday
			const lastDailyNote = this.getLastDailyNote();
			if (lastDailyNote == null) return;

			// get unfinished todos from yesterday, if exist
			let todos_yesterday = await this.getAllUnfinishedTodos(lastDailyNote)
			if (todos_yesterday.length == 0) return;

			// Potentially filter todos from yesterday for today
			let todosAdded = 0
			let emptiesToNotAddToTomorrow = 0
			let todos_today = !removeEmptyTodos ? todos_yesterday : []
			if (removeEmptyTodos) {
				todos_yesterday.forEach((line, i)=>{
					const trimmedLine = (line || "").trim()
					if ((trimmedLine != '- [ ]') && (trimmedLine != '- [  ]')) {
						todos_today.push(line)
						todosAdded++
					} else {
						emptiesToNotAddToTomorrow++
					}
				})
			} else {
				todosAdded = todos_yesterday.length
			}

			// get today's content and modify it
			if (todos_today.length > 0) {
				let dailyNoteContent = await this.app.vault.read(file)
				const todos_todayString = `\n${todos_today.join('\n')}`
				if (templateHeading !== 'none') {
					dailyNoteContent = dailyNoteContent.replace(templateHeading, `${templateHeading}${todos_todayString}`)
				} else {
					dailyNoteContent += todos_todayString
				}
				await this.app.vault.modify(file, dailyNoteContent);
			}

			// if deleteOnComplete, get yesterday's content and modify it
			if (deleteOnComplete) {
				let lastDailyNoteContent = await this.app.vault.read(lastDailyNote)
				let lines = lastDailyNoteContent.split('\n')

				for (let i = lines.length; i >= 0; i--) {
					if (todos_yesterday.includes(lines[i])) {
						lines.splice(i, 1)
					}
				}

				const modifiedContent = lines.join('\n')
				await this.app.vault.modify(lastDailyNote, modifiedContent);
			}

			// Let user know rollover has been successful with X todos
			const todosAddedString = todosAdded == 0 ? "" : `- ${todosAdded} todo${todosAdded > 1 ? 's' : ''} rolled over.`
			const emptiesToNotAddToTomorrowString = emptiesToNotAddToTomorrow == 0 ? "" :
				(deleteOnComplete ? `- ${emptiesToNotAddToTomorrow} empty todo${emptiesToNotAddToTomorrow > 1 ? 's':''} removed.` : '')
			const part1 = `${todosAddedString}${todosAddedString.length > 0 ? " " : ""}`
			const part2 = `${emptiesToNotAddToTomorrowString}${emptiesToNotAddToTomorrowString.length > 0 ? " " : ""}`

			const message = `${part1}${((part1.length>0) && (part2.length>0)) ? "\n" : ""}${part2}`
			if (message.length > 0) {
				new Notice(message, 6000)
			}
		}

	}

	async onload() {
		await this.loadSettings()

		this.addSettingTab(new RollverTodosSettings(this.app, this))

		this.registerEvent(this.app.vault.on('create', async (file) => {
			this.rollover(file)
		}))

		this.addCommand({
      id: "obsidian-rollover-daily-todos",
      name: "Rollover Todos Now",
      callback: ()=> this.rollover()
    })
	}
}

class RollverTodosSettings extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	async getTemplateHeadings() {
		const { template } = getDailyNoteSettings()
		if (!template) return [];
		
		let file = this.app.vault.getAbstractFileByPath(template)
		if (file == null) {
			file = this.app.vault.getAbstractFileByPath(template + '.md')
		}

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
					this.plugin.saveSettings();
				})
			)

		new Setting(this.containerEl)
			.setName('Delete todos from previous day')
			.setDesc(`Once todos are found, they are added to Today's Daily Note. If successful, they are deleted from Yesterday's Daily note. Enabling this is destructive and may result in lost data. Keeping this disabled will simply duplicate them from yesterday's note and place them in the appropriate section. Note that currently, duplicate todos will be deleted regardless of what heading they are in, and which heading you choose from above.`)
			.addToggle(toggle=>toggle
				.setValue(this.plugin.settings.deleteOnComplete || false)
				.onChange(value=>{
					this.plugin.settings.deleteOnComplete = value;
					this.plugin.saveSettings();
				})
			)

		new Setting(this.containerEl)
			.setName('Remove empty todos in rollover')
			.setDesc(`If you have empty todos, they will not be rolled over to the next day.`)
			.addToggle(toggle=>toggle
				.setValue(this.plugin.settings.removeEmptyTodos || false)
				.onChange(value=>{
					this.plugin.settings.removeEmptyTodos = value;
					this.plugin.saveSettings();
				})
			)

	}
}
