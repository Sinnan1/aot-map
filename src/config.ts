// The last episode is 89 ("The Final Chapters: Special 2"), so the Final Chapters specials
// count toward the numbering. content/episodes.csv is the authority; tests/episodes.test.ts
// asserts that this constant agrees with the CSV.
export const FINALE_EP = Number(process.env.NEXT_PUBLIC_FINALE_EP ?? 89);
export const SEASON4_FIRST_EP = 60;
export const COOKIE_NAME = "aot_gate";

export const SEASONS = [
  { label: "Season 1", from: 1, to: 25 },
  { label: "Season 2", from: 26, to: 37 },
  { label: "Season 3", from: 38, to: 59 },
  { label: "Season 4", from: 60, to: FINALE_EP },
] as const;
