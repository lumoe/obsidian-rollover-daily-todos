import { Notice, getDailyNoteSettings, getAllDailyNotes, getDailyNote } from './obsidianHelpers'

const MAX_TIME_SINCE_CREATION = 5000; // 5 seconds

function isDailyNotesEnabled(app) {
  const dailyNotesPlugin = app.internalPlugins.plugins['daily-notes'];
  const dailyNotesEnabled = dailyNotesPlugin && dailyNotesPlugin.enabled;

  const periodicNotesPlugin = app.plugins.getPlugin("periodic-notes");
  const periodicNotesEnabled = periodicNotesPlugin && periodicNotesPlugin.settings?.daily?.enabled;

  return dailyNotesEnabled || periodicNotesEnabled;
}

function getLastDailyNote(vault) {
  const { moment } = window
  const { folder, format } = getDailyNoteSettings();

  // get all notes in directory that aren't null
  const dailyNoteFiles = vault.getAllLoadedFiles()
    .filter(file => file.path.startsWith(folder))
    .filter(file => file.basename != null)

  // remove notes that are from the future
  const todayMoment = moment()
  let dailyNotesTodayOrEarlier = []
  dailyNoteFiles.forEach(file => {
    if (getFileMoment(file, folder, format).isSameOrBefore(todayMoment, 'day')) {
      dailyNotesTodayOrEarlier.push(file)
    }
  })

  // sort by date
  const sorted = dailyNotesTodayOrEarlier.sort((a, b) => getFileMoment(b, folder, format).valueOf() - getFileMoment(a, folder, format).valueOf());
  return sorted[1];
}

function getFileMoment(file, folder, format) {
  const path = file.path.replace(`${folder}/`, '').replace(`.${file.extension}`, '')
  return moment(path, format)
}

async function getAllUnfinishedTodos(vault, file) {
  const contents = await vault.read(file);
  const unfinishedTodosRegex = /\t*- \[ \].*/g
  const unfinishedTodos = Array.from(contents.matchAll(unfinishedTodosRegex)).map(([todo]) => todo)

  return unfinishedTodos;
}

// async function sortHeadersIntoHeirarchy(vault, file) {
//   ///console.log('testing')
//   const templateContents = await vault.read(file)
//   const allHeadings = Array.from(templateContents.matchAll(/#{1,} .*/g)).map(([heading]) => heading)

//   if (allHeadings.length > 0) {
//     console.log(createRepresentationFromHeadings(allHeadings))
//   }
// }

/* Just some boilerplate code for recursively going through subheadings for later
function createRepresentationFromHeadings(headings) {
  let i = 0;
  const tags = [];

  (function recurse(depth) {
    let unclosedLi = false;
    while (i < headings.length) {
      const [hashes, data] = headings[i].split("# ");
      if (hashes.length < depth) {
        break;
      } else if (hashes.length === depth) {
        if (unclosedLi) tags.push('</li>');
        unclosedLi = true;
        tags.push('<li>', data);
        i++;
      } else {
        tags.push('<ul>');
        recurse(depth + 1);
        tags.push('</ul>');
      }
    }
    if (unclosedLi) tags.push('</li>');
  })(-1);
  return tags.join('\n');
}
*/

// undoHistory & undoHistoryTime are not referenced but are mutated
export async function rollover(app, settings, undoHistory, undoHistoryTime, file = undefined) {
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
  const filePathConstructed = `${folder}/${todayFormatted}.${file.extension}`;
  if (filePathConstructed !== file.path) return;

  // was just created
  if ((today.getTime() - file.stat.ctime > MAX_TIME_SINCE_CREATION) && !ignoreCreationTime) return;

  /*** Next, if it is a valid daily note, but we don't have daily notes enabled, we must alert the user ***/
  if (!isDailyNotesEnabled(app)) {
    new Notice('RolloverTodosPlugin unable to rollover unfinished todos: Please enable Daily Notes, or Periodic Notes (with daily notes enabled).', 10000)
  } else {
    const { templateHeading, deleteOnComplete, removeEmptyTodos } = settings;

    // check if there is a daily note from yesterday
    const lastDailyNote = getLastDailyNote(app.vault);
    if (lastDailyNote == null) return;

    // TODO: Rollover to subheadings (optional)
    //sortHeadersIntoHeirarchy(app.vault, lastDailyNote)

    // get unfinished todos from yesterday, if exist
    let todos_yesterday = await getAllUnfinishedTodos(app.vault, lastDailyNote)
    if (todos_yesterday.length == 0) {
      console.log(`rollover-daily-todos: 0 todos found in ${lastDailyNote.basename}.md`)
      return;
    }

    // setup undo history
    let undoHistoryInstance = {
      previousDay: {
        file: undefined,
        oldContent: ''
      },
      today: {
        file: undefined,
        oldContent: ''
      }
    }

    // Potentially filter todos from yesterday for today
    let todosAdded = 0
    let emptiesToNotAddToTomorrow = 0
    let todos_today = !removeEmptyTodos ? todos_yesterday : []
    if (removeEmptyTodos) {
      todos_yesterday.forEach((line, i) => {
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
    let templateHeadingNotFoundMessage = ""
    const templateHeadingSelected = (templateHeading !== 'none')

    if (todos_today.length > 0) {
      let dailyNoteContent = await app.vault.read(file)
      undoHistoryInstance.today = {
        file: file,
        oldContent: `${dailyNoteContent}`
      }
      const todos_todayString = `\n${todos_today.join('\n')}`

      // If template heading is selected, try to rollover to template heading
      if (templateHeadingSelected) {
        const contentAddedToHeading = dailyNoteContent.replace(templateHeading, `${templateHeading}${todos_todayString}`)
        if (contentAddedToHeading == dailyNoteContent) {
          templateHeadingNotFoundMessage = `Rollover couldn't find '${templateHeading}' in today's daily not. Rolling todos to end of file.`
        } else {
          dailyNoteContent = contentAddedToHeading
        }
      }

      // Rollover to bottom of file if no heading found in file, or no heading selected
      if ((!templateHeadingSelected) || (templateHeadingNotFoundMessage.length > 0)) {
        dailyNoteContent += todos_todayString
      }

      await app.vault.modify(file, dailyNoteContent);
    }

    // if deleteOnComplete, get yesterday's content and modify it
    if (deleteOnComplete) {
      let lastDailyNoteContent = await app.vault.read(lastDailyNote)
      undoHistoryInstance.previousDay = {
        file: lastDailyNote,
        oldContent: `${lastDailyNoteContent}`
      }
      let lines = lastDailyNoteContent.split('\n')

      for (let i = lines.length; i >= 0; i--) {
        if (todos_yesterday.includes(lines[i])) {
          lines.splice(i, 1)
        }
      }

      const modifiedContent = lines.join('\n')
      await app.vault.modify(lastDailyNote, modifiedContent);
    }

    // Let user know rollover has been successful with X todos
    const todosAddedString = todosAdded == 0 ? "" : `- ${todosAdded} todo${todosAdded > 1 ? 's' : ''} rolled over.`
    const emptiesToNotAddToTomorrowString = emptiesToNotAddToTomorrow == 0 ? "" :
      (deleteOnComplete ? `- ${emptiesToNotAddToTomorrow} empty todo${emptiesToNotAddToTomorrow > 1 ? 's':''} removed.` : '')
    const part1 = templateHeadingNotFoundMessage.length > 0 ? `${templateHeadingNotFoundMessage}` : ''
    const part2 = `${todosAddedString}${todosAddedString.length > 0 ? " " : ""}`
    const part3 = `${emptiesToNotAddToTomorrowString}${emptiesToNotAddToTomorrowString.length > 0 ? " " : ""}`

    let allParts = [part1, part2, part3]
    let nonBlankLines = []
    allParts.forEach(part => {
      if (part.length > 0) {
        nonBlankLines.push(part)
      }
    })

    const message = nonBlankLines.join('\n')
    if (message.length > 0) {
      new Notice(message, 4000 + (message.length * 3))
    }
    undoHistoryTime = new Date()
    undoHistory = [undoHistoryInstance]
  }
}