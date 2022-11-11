import { Plugin } from 'obsidian';
import { rollover } from './rollover';
import UndoModal from './ui/UndoModal'
import RolloverSettingTab from './ui/RolloverSettingTab'

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

  async onload() {
    await this.loadSettings()

    this.undoHistory = []
    this.undoHistoryTime = new Date()

    this.addSettingTab(new RolloverSettingTab(this.app, this))

    this.registerEvent(this.app.vault.on('create', async (file) => {
      const result = await rollover(window.moment(), this.app, this.settings, file)
      this.undoHistoryTime = result?.undoHistoryTime;
      this.undoHistory = result?.undoHistory;
    }))

    this.addCommand({
      id: "obsidian-rollover-daily-todos-rollover",
      name: "Rollover Todos Now",
      callback: async () => {
        const { undoHistoryTime, undoHistory } = await rollover(window.moment(), this.app, this.settings)
        this.undoHistoryTime = undoHistoryTime;
        this.undoHistory = undoHistory;
      }
    })

    this.addCommand({
      id: "obsidian-rollover-daily-todos-undo",
      name: "Undo last rollover",
      checkCallback: checking => {
        // no history, don't allow undo
        if (this.undoHistory.length > 0) {
          const now = window.moment()
          const lastUse = window.moment(this.undoHistoryTime)
          const diff = now.diff(lastUse, 'seconds')
          // 2+ mins since use: don't allow undo
          if (diff > (2 * 60)) {
            return false
          }
          if (!checking) {
            new UndoModal(this).open();
          }
          return true
        }
        return false
      }
    })
  }
}
