import raw from "./data/cache_county_responses.json";

/* Builds the initial app state from the cached county-responses dataset.
   Questions carry the prompt text; comments are flat per question, each
   tagged with the table it came from so the Comments panel can group them
   and (later) a websocket / simulator can append new ones live. */
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
      t.answers.forEach((text, ai) => {
        list.push({
          id: `${tableId}-c${ai + 1}`,
          tableId,
          tableNum,
          tableName: t.name,
          text,
        });
      });
    });
    comments[q.id] = list;
  });

  return { questions, comments };
}
