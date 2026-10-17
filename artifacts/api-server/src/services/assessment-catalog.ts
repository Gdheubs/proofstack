export function assessmentCatalog() {
  return {
    assessments: [
      {
        id: "javascript-foundations",
        title: "JavaScript foundations",
        skill: "JavaScript",
        description:
          "A self-directed platform skill check covering everyday JavaScript fundamentals.",
        questionCount: 5,
        durationMinutes: 10,
      },
      {
        id: "web-accessibility",
        title: "Web accessibility",
        skill: "Web accessibility",
        description:
          "A self-directed platform skill check covering inclusive web interfaces.",
        questionCount: 5,
        durationMinutes: 10,
      },
    ],
  };
}
