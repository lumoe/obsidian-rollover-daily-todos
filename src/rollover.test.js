import moment from 'moment';
import { getDailyNoteSettings, getAllDailyNotes, getDailyNote } from 'obsidian-daily-notes-interface'
import { rollover } from './rollover'

jest.mock('obsidian');
jest.mock('obsidian-daily-notes-interface');

const settings = {
  templateHeading: 'none',
  deleteOnComplete: false,
  removeEmptyTodos: false,
};
const app = {
  vault: {
    modify: () => true
  }
};

test('If daily note is not provided and cannot be found then rollover should not happen', async () => {
  // Arrange  
  getDailyNoteSettings.mockImplementation(() => { return {
    folder: "daily-notes-folder",
    format: "YYYY-MM-DD-ddd"
  }});

  getAllDailyNotes.mockImplementation(() => { return [] })

  getDailyNote.mockImplementation(() => { return null })

  const vaultModifySpy = jest.spyOn(app.vault, 'modify');

  // Act
  const result = await rollover(moment, app, settings)

  // Assert
  expect(result).toBe(undefined)
  expect(vaultModifySpy).not.toHaveBeenCalled()
});

test('If daily note is not provided and found note is not under daily note folder then rollover should not happen', async () => {
  // Arrange  
  getDailyNoteSettings.mockImplementation(() => { return {
    folder: "daily-notes-folder",
    format: "YYYY-MM-DD-ddd"
  }});

  getAllDailyNotes.mockImplementation(() => { return [] })

  getDailyNote.mockImplementation(() => { return {
    path: 'not-daily-notes-foler/file'
  }})

  const vaultModifySpy = jest.spyOn(app.vault, 'modify');

  // Act
  const result = await rollover(moment, app, settings)

  // Assert
  expect(result).toBe(undefined)
  expect(vaultModifySpy).not.toHaveBeenCalled()
});
