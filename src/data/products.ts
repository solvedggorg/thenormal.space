import type { Interest } from "./site";

export type Product = {
  slug: "dishwasher" | "washing-machine" | "litter-box";
  name: string;
  href: string;
  sentence: string;
  paragraph: string;
  interest: Interest;
};

export const products: Product[] = [
  {
    slug: "dishwasher",
    name: "Dishwasher",
    href: "/dishwasher",
    sentence: "Washes dishes. You put them in, you take them out.",
    paragraph: "Washes dishes. You put them in, you take them out.",
    interest: "dishwasher",
  },
  {
    slug: "washing-machine",
    name: "Washing Machine",
    href: "/washing-machine",
    sentence: "Washes clothes. Same idea.",
    paragraph: "Washes clothes. Same idea.",
    interest: "washing-machine",
  },
  {
    slug: "litter-box",
    name: "Litter Box",
    href: "/litter-box",
    sentence: "Holds litter. You scoop it.",
    paragraph: "Holds litter. You scoop it. That is the product.",
    interest: "litter-box",
  },
];

export function productBySlug(slug: string): Product | undefined {
  return products.find((item) => item.slug === slug);
}
