import { expect, test, describe, beforeAll } from "vitest";
import {
  getDailyNoteSettings,
  isDailyNotesEnabled,
  getTodaysDailyNote,
} from "./daily-notes";

// Tiny window.moment stub for headless vitest runs. Only the slice of moment
// that getTodaysDailyNote actually exercises is implemented:
//   moment()                     → "today" wrapper with format() / isSame()
//   moment(input, fmt, strict)   → parser wrapper with isValid() / isSame()
//   .subtract(n, "day").format() → used in tests to build "yesterday" paths
// We avoid pulling moment in transitively (the previous .pnpm path import was
// brittle and broke in worktrees / on dependency bumps).
beforeAll(() => {
  const fmt = (d, format) => {
    const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    if (format === "YYYY-MM-DD") return `${yyyy}-${mm}-${dd}`;
    if (format === "DD-MM-YYYY") return `${dd}-${mm}-${yyyy}`;
    throw new Error(`test moment stub: unsupported format ${format}`);
  };
  const sameDay = (a, b) =>
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
  const wrap = (d, valid = true) => ({
    isValid: () => valid,
    isSame: (other, _unit) => valid && sameDay(d, other.__date || d),
    format: (format) => fmt(d, format),
    subtract: (n, unit) => {
      if (unit !== "day" && unit !== "days") {
        throw new Error(`test moment stub: unsupported unit ${unit}`);
      }
      const next = new Date(d.getTime() - n * 86400000);
      return wrap(next);
    },
    __date: d,
  });
  const moment = (input, format) => {
    if (input === undefined) return wrap(new Date());
    if (typeof input === "string" && format) {
      // strict-ish parse: try YYYY-MM-DD or DD-MM-YYYY
      const match =
        format === "YYYY-MM-DD"
          ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
          : format === "DD-MM-YYYY"
          ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(input)
          : null;
      if (!match) return wrap(new Date(NaN), false);
      const [, a, b, c] = match;
      const date =
        format === "YYYY-MM-DD"
          ? new Date(Date.UTC(+a, +b - 1, +c))
          : new Date(Date.UTC(+c, +b - 1, +a));
      return wrap(date);
    }
    return wrap(new Date(NaN), false);
  };
  if (typeof globalThis.window === "undefined") {
    globalThis.window = {};
  }
  globalThis.window.moment = moment;
});

const fakeFile = (path) => ({
  path,
  basename: path.split("/").pop().replace(/\.md$/, ""),
  extension: "md",
});

const buildApp = ({ pn, core, files = [] } = {}) => ({
  vault: { getMarkdownFiles: () => files },
  internalPlugins: { plugins: { "daily-notes": core || null } },
  plugins: { getPlugin: (name) => (name === "periodic-notes" ? pn : null) },
});

describe("getDailyNoteSettings — Periodic Notes 1.0+ (calendar set)", () => {
  test("reads from calendarSetManager.getActiveSet().daily", () => {
    const app = buildApp({
      pn: {
        calendarSetManager: {
          getActiveSet: () => ({
            daily: {
              enabled: true,
              folder: "/Daily/",
              format: "YYYY/MM-MMM/YYYY-MM-DD",
              templatePath: "Templates/Daily.md",
            },
          }),
        },
      },
    });
    const s = getDailyNoteSettings(app);
    expect(s).toEqual({
      folder: "Daily",
      format: "YYYY/MM-MMM/YYYY-MM-DD",
      template: "Templates/Daily.md",
    });
  });

  test("returns sane defaults if calendar set has no daily entry", () => {
    const app = buildApp({
      pn: {
        calendarSetManager: { getActiveSet: () => ({ weekly: {} }) },
      },
      core: { enabled: false },
    });
    expect(getDailyNoteSettings(app)).toEqual({
      folder: "",
      format: "YYYY-MM-DD",
      template: "",
    });
  });
});

describe("getDailyNoteSettings — Periodic Notes 0.x (legacy flat shape)", () => {
  test("reads from plugin.settings.daily when enabled", () => {
    const app = buildApp({
      pn: {
        settings: {
          daily: {
            enabled: true,
            folder: "Diary",
            format: "YYYY-MM-DD",
            template: "templates/diary.md",
          },
        },
      },
    });
    expect(getDailyNoteSettings(app)).toEqual({
      folder: "Diary",
      format: "YYYY-MM-DD",
      template: "templates/diary.md",
    });
  });

  test("ignores legacy settings when daily is not enabled", () => {
    const app = buildApp({
      pn: { settings: { daily: { enabled: false, folder: "X" } } },
      core: {
        enabled: true,
        instance: {
          options: { folder: "core", format: "YYYY-MM-DD", template: "" },
        },
      },
    });
    expect(getDailyNoteSettings(app).folder).toBe("core");
  });
});

describe("getDailyNoteSettings — core Daily Notes plugin", () => {
  test("falls back to internalPlugins[daily-notes] when no Periodic Notes", () => {
    const app = buildApp({
      core: {
        enabled: true,
        instance: {
          options: {
            folder: "/dailies/",
            format: "DD-MM-YYYY",
            template: "tpl.md",
          },
        },
      },
    });
    expect(getDailyNoteSettings(app)).toEqual({
      folder: "dailies",
      format: "DD-MM-YYYY",
      template: "tpl.md",
    });
  });

  test("returns empty defaults when no plugin is enabled", () => {
    const app = buildApp({});
    expect(getDailyNoteSettings(app)).toEqual({
      folder: "",
      format: "YYYY-MM-DD",
      template: "",
    });
  });
});

describe("isDailyNotesEnabled", () => {
  test("true when core Daily Notes is enabled", () => {
    expect(isDailyNotesEnabled(buildApp({ core: { enabled: true } }))).toBe(
      true
    );
  });

  test("true when Periodic Notes 1.0 calendar set has daily enabled", () => {
    expect(
      isDailyNotesEnabled(
        buildApp({
          pn: {
            calendarSetManager: {
              getActiveSet: () => ({ daily: { enabled: true } }),
            },
          },
        })
      )
    ).toBe(true);
  });

  test("true when Periodic Notes 0.x flat settings have daily enabled", () => {
    expect(
      isDailyNotesEnabled(
        buildApp({ pn: { settings: { daily: { enabled: true } } } })
      )
    ).toBe(true);
  });

  test("false when neither plugin is configured", () => {
    expect(isDailyNotesEnabled(buildApp({}))).toBe(false);
  });

  test("safe against missing app object", () => {
    expect(isDailyNotesEnabled(null)).toBe(false);
  });
});

describe("getTodaysDailyNote", () => {
  test("returns the file whose basename parses as today's date", () => {
    const today = window.moment().format("YYYY-MM-DD");
    const yest = window.moment().subtract(1, "day").format("YYYY-MM-DD");
    const files = [
      fakeFile(`Daily/${yest}.md`),
      fakeFile(`Daily/${today}.md`),
    ];
    const app = buildApp({
      core: {
        enabled: true,
        instance: { options: { folder: "Daily", format: "YYYY-MM-DD" } },
      },
      files,
    });
    expect(getTodaysDailyNote(app)?.path).toBe(`Daily/${today}.md`);
  });

  test("returns null if today has no daily note", () => {
    const yest = window.moment().subtract(1, "day").format("YYYY-MM-DD");
    const app = buildApp({
      core: {
        enabled: true,
        instance: { options: { folder: "Daily", format: "YYYY-MM-DD" } },
      },
      files: [fakeFile(`Daily/${yest}.md`)],
    });
    expect(getTodaysDailyNote(app)).toBe(null);
  });

  test("ignores files outside the configured folder", () => {
    const today = window.moment().format("YYYY-MM-DD");
    const app = buildApp({
      core: {
        enabled: true,
        instance: { options: { folder: "Daily", format: "YYYY-MM-DD" } },
      },
      files: [fakeFile(`Other/${today}.md`)],
    });
    expect(getTodaysDailyNote(app)).toBe(null);
  });

  // (#146) regression: folder-structured formats (e.g. YYYY/MM/DD as the
  // date format itself) produce paths whose date components straddle
  // directory separators. We must parse the folder-stripped path, not the
  // basename alone.
  test("parses folder-structured date formats by stripping the daily-notes folder prefix", () => {
    const todayDate = new Date();
    const yyyy = String(todayDate.getUTCFullYear()).padStart(4, "0");
    const mm = String(todayDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(todayDate.getUTCDate()).padStart(2, "0");
    // Path layout: <folder>/<YYYY>/<MM>/<DD>.md
    const path = `Daily/${yyyy}/${mm}/${dd}.md`;
    const file = {
      path,
      basename: dd, // basename alone never parses the year/month — that's the bug
      extension: "md",
    };
    // Override the moment stub for this format. Real moment handles
    // `YYYY/MM/DD` natively; our stub only knows YYYY-MM-DD / DD-MM-YYYY,
    // so we plug a third format in for this single test.
    const previous = window.moment;
    const slashFmt = (str, format) => {
      if (format !== "YYYY/MM/DD") return previous(str, format);
      const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(str);
      if (!m) {
        return { isValid: () => false, isSame: () => false, format: () => "" };
      }
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return {
        isValid: () => true,
        isSame: (other) => {
          const o = other.__date || new Date();
          return (
            d.getUTCFullYear() === o.getUTCFullYear() &&
            d.getUTCMonth() === o.getUTCMonth() &&
            d.getUTCDate() === o.getUTCDate()
          );
        },
        format: () => str,
        __date: d,
      };
    };
    window.moment = (input, format) =>
      input === undefined ? previous() : slashFmt(input, format);

    const app = buildApp({
      core: {
        enabled: true,
        instance: { options: { folder: "Daily", format: "YYYY/MM/DD" } },
      },
      files: [file],
    });
    expect(getTodaysDailyNote(app)?.path).toBe(path);

    window.moment = previous;
  });
});
