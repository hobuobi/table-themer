import raw from "./data/cache_county_responses.json";
import { uid } from "./uid.js";

export function buildSeedQuestions() {
  return raw.questions.map((q) => ({
    id: q.id,
    label: q.label,
    mainQuestion: q.question,
    tableQuestion: q.displayHeader,
    tables: q.tables.map((t) => ({
      id: uid(),
      name: t.name,
      answers: t.answers.map((text) => ({ id: uid(), text })),
    })),
    themesData: { generated: false, themes: [] },
    promptExtra: "",
  }));
}
