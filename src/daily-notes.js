// Inline replacement for `obsidian-daily-notes-interface`. Closes #147 (plus
// #146, #152, and parts of #110 that all fall out of the same upstream rot).
//
// The npm package has been unmaintained since 2021; its bundled checks for the
// Periodic Notes plugin look at `plugin.settings.daily.enabled`, which Periodic
// Notes 1.0 (released 2022) no longer guarantees — the calendar-set rewrite
// moved daily-notes config under `calendarSetManager`. Several issues in this
// repo (#147 chain) trace back to that mismatch: the dep silently returns
// "no daily notes configured", which makes our settings panel render blank
// and our rollover quietly do nothing.
//
// We only need a small slice of that package's surface area:
//   - getDailyNoteSettings(app) -> { folder, format, template }
//   - getTodaysDailyNote(app)   -> TFile | null
//   - isDailyNotesEnabled(app)  -> boolean
// Inlining is ~60 lines, keeps the dependency tree tiny, and lets us evolve
// the helper as Periodic Notes' API changes again.

const DEFAULT_FORMAT = "YYYY-MM-DD";

function cleanFolder(folder) {
  if (!folder) return "";
  if (folder.startsWith("/")) folder = folder.substring(1);
  if (folder.endsWith("/")) folder = folder.substring(0, folder.length - 1);
  return folder;
}

// Reads the active daily-notes config from whichever plugin owns it. Periodic
// Notes wins when present and enabled (it's the user's explicit choice);
// falls back to the core Daily Notes plugin otherwise.
export function getDailyNoteSettings(app) {
  const empty = { folder: "", format: DEFAULT_FORMAT, template: "" };
  if (!app) return empty;

  const pn = app.plugins?.getPlugin?.("periodic-notes");
  if (pn) {
    // Periodic Notes 1.0+: settings live under calendar sets.
    const set = pn.calendarSetManager?.getActiveSet?.();
    if (set?.daily) {
      return {
        folder: cleanFolder(set.daily.folder),
        format: set.daily.format || DEFAULT_FORMAT,
        template: set.daily.templatePath || set.daily.template || "",
      };
    }
    // Periodic Notes 0.x: flat settings under plugin.settings.daily.
    if (pn.settings?.daily?.enabled) {
      return {
        folder: cleanFolder(pn.settings.daily.folder),
        format: pn.settings.daily.format || DEFAULT_FORMAT,
        template: pn.settings.daily.template || "",
      };
    }
  }

  const core = app.internalPlugins?.plugins?.["daily-notes"];
  if (core?.enabled) {
    const opts = core.instance?.options || {};
    return {
      folder: cleanFolder(opts.folder),
      format: opts.format || DEFAULT_FORMAT,
      template: opts.template || "",
    };
  }

  return empty;
}

export function isDailyNotesEnabled(app) {
  if (!app) return false;
  const core = app.internalPlugins?.plugins?.["daily-notes"];
  if (core?.enabled) return true;

  const pn = app.plugins?.getPlugin?.("periodic-notes");
  if (pn) {
    const set = pn.calendarSetManager?.getActiveSet?.();
    if (set?.daily?.enabled) return true;
    if (pn.settings?.daily?.enabled) return true;
  }
  return false;
}

// Returns today's daily-note TFile if it exists, otherwise null.
// Replaces obsidian-daily-notes-interface's getAllDailyNotes + getDailyNote
// pair (we never need the full map; only "find today's note").
//
// Folder-structured formats (#146) like `GGGG/[W]WW/YYYY-MM-DD` produce paths
// such as `2026/W19/2026-05-06.md`. We must parse the configured-folder-
// stripped path (not just the basename), because the format itself contains
// directory separators.
export function getTodaysDailyNote(app) {
  if (!app || !window.moment) return null;
  const moment = window.moment;
  const { folder, format } = getDailyNoteSettings(app);
  const prefix = folder.length === 0 ? "" : folder + "/";
  const today = moment();
  const files = app.vault?.getMarkdownFiles?.() || [];
  for (const file of files) {
    if (prefix && !file.path.startsWith(prefix)) continue;
    let path = file.path.substring(prefix.length);
    if (path.endsWith(".md")) path = path.substring(0, path.length - 3);
    const m = moment(path, format, true);
    if (!m.isValid()) continue;
    if (m.isSame(today, "day")) return file;
  }
  return null;
}
