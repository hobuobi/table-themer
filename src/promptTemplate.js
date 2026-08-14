export function buildThemePrompt({ mainQuestion, answers, extraInstructions }) {
  const extra = extraInstructions && extraInstructions.trim();
  return (
    `You are helping synthesize input from a public deliberation event. ` +
    `The question on the floor was: "${mainQuestion}"\n\n` +
    `Below is every idea submitted, each with a unique id. Group them into 4 to 8 clear, ` +
    `non-overlapping themes that capture the major currents of opinion in the room. ` +
    `Every idea must be assigned to exactly one theme. Name each theme in plain, ` +
    `concrete language (3 to 6 words, no jargon).\n\n` +
    (extra ? `Additional instructions from the facilitator:\n${extra}\n\n` : "") +
    `Return ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:\n` +
    `{"themes":[{"name":"Theme name","answerIds":["id1","id2"]}]}\n\n` +
    `Ideas:\n${JSON.stringify(answers)}`
  );
}
