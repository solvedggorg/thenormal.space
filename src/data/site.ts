export type { ContactTopic, Interest } from "../../shared/catalog";
export { CONTACT_TOPICS, INTERESTS } from "../../shared/catalog";

export const brand = {
  name: "The Normal Space",
  society: "The Normal People Society",
  tagline: "Normal things for everything you want to do.",
  description: "We make normal things. No app, no wifi, no location sharing.",
  url: "https://thenormal.space",
  email: { hello: "hello@thenormal.space" },
  social: { x: "https://x.com/thenormalcorp" },
} as const;

export type MegaId = "things" | "watch" | "about";
export type NavIcon = "droplets" | "wash" | "box" | "eye" | "newspaper" | "info" | "flag" | "list" | "mail";

export type NavChild = {
  name: string;
  href: string;
  description: string;
  icon: NavIcon;
  external?: boolean;
};

export type NavGroup = {
  id: MegaId;
  name: string;
  href: string;
  description: string;
  children: NavChild[];
};

export const navGroups: NavGroup[] = [
  {
    id: "things",
    name: "Things",
    href: "/dishwasher",
    description: "Objects that do the job.",
    children: [
      {
        name: "Dishwasher",
        href: "/dishwasher",
        description: "Washes dishes. You put them in, you take them out.",
        icon: "droplets",
      },
      {
        name: "Washing Machine",
        href: "/washing-machine",
        description: "Washes clothes. Same idea.",
        icon: "wash",
      },
      {
        name: "Litter Box",
        href: "/litter-box",
        description: "Holds litter. You scoop it.",
        icon: "box",
      },
    ],
  },
  {
    id: "watch",
    name: "Watch",
    href: "/watch",
    description: "Pictures under the same rule.",
    children: [
      { name: "Films", href: "/watch#films", description: "Pictures. Forthcoming.", icon: "eye" },
      { name: "Television", href: "/watch#television", description: "Episodes. Forthcoming.", icon: "newspaper" },
    ],
  },
  {
    id: "about",
    name: "About",
    href: "/about",
    description: "Who makes this, and why.",
    children: [
      { name: "The Society", href: "/about", description: "The Normal People Society", icon: "info" },
      { name: "Goal", href: "/goal", description: "American jobs. American care.", icon: "flag" },
      { name: "Why normal", href: "/about#why", description: "No app, no wifi, no location", icon: "list" },
      { name: "Contact", href: "/contact", description: "Things, watch, press, other", icon: "mail" },
    ],
  },
];

export const navCta = { href: "/#notify", label: "Notify" } as const;

export type FooterLink = { href: string; label: string; external?: boolean };
export type FooterColumn = { title: string; links: FooterLink[] };

export const footer: FooterColumn[] = [
  {
    title: "Things",
    links: [
      { href: "/dishwasher", label: "Dishwasher" },
      { href: "/washing-machine", label: "Washing Machine" },
      { href: "/litter-box", label: "Litter Box" },
    ],
  },
  {
    title: "Watch",
    links: [
      { href: "/watch#films", label: "Films" },
      { href: "/watch#television", label: "Television" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/about", label: "The Society" },
      { href: "/goal", label: "Goal" },
      { href: "/about#why", label: "Why normal" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Society",
    links: [
      { href: "/contact", label: "Contact" },
      { href: brand.social.x, label: "X", external: true },
      { href: "/#notify", label: "Notify" },
    ],
  },
];
