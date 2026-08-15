export const INTERESTS = [
  "all",
  "dishwasher",
  "washing-machine",
  "litter-box",
  "films",
  "television",
] as const;

export type Interest = (typeof INTERESTS)[number];

export const CONTACT_TOPICS = ["things", "watch", "press", "other"] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];
