import type { Interest } from "./site";

export type Title = {
  title: string;
  logline: string;
  kind: "Film" | "Television";
  interest: Interest;
};

export const films: Title[] = [
  { title: "Tuesday", logline: "A day. Nothing else is scheduled.", kind: "Film", interest: "films" },
  {
    title: "The Drive Home",
    logline: "Two people in a car. The radio works.",
    kind: "Film",
    interest: "films",
  },
];

export const shows: Title[] = [
  { title: "Ordinary Time", logline: "A season of weeks. No twist.", kind: "Television", interest: "television" },
  { title: "Neighbors", logline: "The people next door, left alone.", kind: "Television", interest: "television" },
];
