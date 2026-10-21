// Hours a user waits after completing a check before a new attempt can start.
export const RETAKE_COOLDOWN_HOURS = 24;
export function assessmentCatalog() {
  return {
    assessments: [
      {
        id: "javascript-foundations",
        title: "JavaScript foundations",
        skill: "JavaScript",
        description:
          "A self-directed platform skill check covering everyday JavaScript fundamentals.",
        questionCount: 8,
        durationMinutes: 12,
        retakeCooldownHours: RETAKE_COOLDOWN_HOURS,
      },
      {
        id: "web-accessibility",
        title: "Web accessibility",
        skill: "Web accessibility",
        description:
          "A self-directed platform skill check covering inclusive web interfaces.",
        questionCount: 8,
        durationMinutes: 12,
        retakeCooldownHours: RETAKE_COOLDOWN_HOURS,
      },
    ],
  };
}
