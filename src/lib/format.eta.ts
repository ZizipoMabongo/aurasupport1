// Estimated response windows by priority. Used purely for display; the SLA
// tracker on the analyst/admin side owns real SLA math.
export function estimatedResponseWindow(priority: string | null | undefined): string {
  switch (priority) {
    case "Urgent":
      return "within 15 minutes";
    case "High":
      return "within the hour";
    case "Medium":
      return "within 2–4 hours";
    case "Low":
      return "within 24 hours";
    default:
      return "shortly";
  }
}

// Lightweight follow-up prompts. Deliberately short and non-committal so we
// never contradict what the assigned analyst will actually do.
const FOLLOW_UPS: Record<string, string[]> = {
  IT: [
    "Is the issue affecting one device or several?",
    "When did you first notice the problem?",
  ],
  HR: [
    "Would you like a copy of the relevant policy?",
    "Is anyone else on your team affected?",
  ],
  Finance: [
    "Do you have a receipt or invoice number handy?",
    "Which cabin or account should this be linked to?",
  ],
  Operations: [
    "Is a specific cabin, deck, or venue involved?",
    "Would you like housekeeping to visit at a particular time?",
  ],
};

export function suggestedFollowUps(department: string | null | undefined): string[] {
  if (!department) return [];
  return FOLLOW_UPS[department] ?? [];
}
