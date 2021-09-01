import { Modal, Setting } from 'obsidian'

export default class UndoModal extends Modal {
  constructor(plugin) {
    super(plugin.app)
    this.plugin = plugin
  }

  async parseDay(day) {
    const { file, oldContent } = day
    let currentContent = await this.plugin.app.vault.read(file)

    const oldContentLineCount = oldContent.split('\n').length
    const currentContentLineCount = currentContent.split('\n').length
    const diff = Math.abs(oldContentLineCount - currentContentLineCount)

    let s = ''
    if (oldContentLineCount > currentContentLineCount) {
      s = `- ${file.basename}.${file.extension}: add ${diff} line${diff.length > 1 ? 's':''}.`
    } else if (oldContentLineCount < currentContentLineCount) {
      s = `- ${file.basename}.${file.extension}: remove ${diff} line${diff.length > 1 ? 's':''}.`
    } else {
      if (oldContent == currentContent) {
        s = `- ${file.basename}.${file.extension}: will not be modified.`
      } else {
        s = `- ${file.basename}.${file.extension}: will be modified to its previous state, with the same number of lines (but different content).`
      }
    }

    return s
  }

  async confirmUndo(undoHistoryInstance) {
    await this.plugin.app.vault.modify(undoHistoryInstance.today.file, undoHistoryInstance.today.oldContent);
    if (undoHistoryInstance.previousDay.file != undefined) {
      await this.plugin.app.vault.modify(undoHistoryInstance.previousDay.file, undoHistoryInstance.previousDay.oldContent);
    }
    this.plugin.undoHistory = []
  }

  async onOpen() {
    let { contentEl, plugin } = this
    contentEl.createEl('h3', { text: 'Undo last rollover' });
    contentEl.createEl('div', { text: 'A single rollover command can be undone, which will load the state of the two files modified (or 1 if the delete option is toggled off) before the rollover first occured. Any text you may have added from those file(s) during that time may be deleted.' });
    contentEl.createEl('div', { text: 'Note that rollover actions can only be undone for up to 2 minutes after the command occured, and will be removed from history if the app closes.' })
    contentEl.createEl('h4', { text: 'Changes made with undo:' })

    const undoHistoryInstance = plugin.undoHistory[0]
    let modTextArray = [await this.parseDay(undoHistoryInstance.today)]
    if (undoHistoryInstance.previousDay.file != undefined) {
      modTextArray.push(await this.parseDay(undoHistoryInstance.previousDay))
    }
    modTextArray.forEach(txt => {
      contentEl.createEl('div', { text: txt })
    })

    new Setting(contentEl)
      .addButton(button => button
        .setButtonText('Confirm Undo')
        .onClick(async (e) => {
          await this.confirmUndo(undoHistoryInstance)
          this.close()
        })
      )
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}
