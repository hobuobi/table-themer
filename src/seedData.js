import raw from "./data/cache_county_responses.json";

/* The demo simulator replays a question's comments as if they were
   arriving live. The source data has no timestamps, so we treat each
   table's existing order as chronological and scatter that table's
   comments randomly across a 15-minute window (deterministic per
   table, so a replay looks the same every time). */
export const SIM_WINDOW_MS = 15 * 60 * 1000;

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeedState() {
  const questions = [];
  const comments = {};

  raw.questions.forEach((q) => {
    questions.push({
      id: q.id,
      label: q.label,
      mainQuestion: q.question,
      tableQuestion: q.displayHeader,
    });

    const list = [];
    q.tables.forEach((t, ti) => {
      const tableNum = ti + 1;
      const tableId = `${q.id}-t${tableNum}`;
      const rand = mulberry32(hashStr(`${q.id}:${tableNum}`));
      const offsets = t.answers
        .map(() => Math.round(rand() * SIM_WINDOW_MS))
        .sort((a, b) => a - b);

      t.answers.forEach((text, ai) => {
        list.push({
          id: `${tableId}-c${ai + 1}`,
          tableId,
          tableNum,
          tableName: t.name,
          text,
          simOffset: offsets[ai],
        });
      });
    });
    comments[q.id] = list;
  });

  return { questions, comments };
}
