import { expect, test } from "bun:test";
import { brand, CONTACT_TOPICS, footer, INTERESTS, navCta, navGroups } from "./site";
import { products } from "./products";
import { films, shows } from "./watch";

test("brand lockup strings", () => {
  expect(brand.name).toBe("The Normal Space");
  expect(brand.society).toBe("The Normal People Society");
  expect(brand.url).toBe("https://thenormal.space");
  expect(brand.email.hello).toBe("hello@thenormal.space");
  expect(brand.social.x).toBe("https://x.com/thenormalcorp");
});

test("nav groups, cta, and icon set", () => {
  expect(navGroups.map((group) => group.id)).toEqual(["things", "watch", "about"]);
  expect(navGroups[0]?.href).toBe("/dishwasher");
  expect(navGroups[0]?.children.map((child) => child.href)).toEqual([
    "/dishwasher",
    "/washing-machine",
    "/litter-box",
  ]);
  expect(navGroups[1]?.children.map((child) => child.href)).toEqual(["/watch#films", "/watch#television"]);
  expect(navGroups[2]?.children.map((child) => child.href)).toEqual(["/about", "/goal", "/about#why", "/contact"]);
  expect(navCta).toEqual({ href: "/#notify", label: "Notify" });
  const icons = navGroups.flatMap((group) => group.children.map((child) => child.icon));
  expect(new Set(icons)).toEqual(
    new Set(["droplets", "wash", "box", "eye", "newspaper", "info", "flag", "list", "mail"]),
  );
});

test("products and slate", () => {
  expect(products.map((item) => item.slug)).toEqual(["dishwasher", "washing-machine", "litter-box"]);
  expect(products.map((item) => item.interest)).toEqual(["dishwasher", "washing-machine", "litter-box"]);
  expect(films.map((item) => item.title)).toEqual(["Tuesday", "The Drive Home"]);
  expect(shows.map((item) => item.title)).toEqual(["Ordinary Time", "Neighbors"]);
  expect(films.every((item) => item.interest === "films")).toBe(true);
  expect(shows.every((item) => item.interest === "television")).toBe(true);
});

test("interest and topic enums", () => {
  expect([...INTERESTS]).toEqual([
    "all",
    "dishwasher",
    "washing-machine",
    "litter-box",
    "films",
    "television",
  ]);
  expect([...CONTACT_TOPICS]).toEqual(["things", "watch", "press", "other"]);
});

test("footer columns", () => {
  expect(footer.map((column) => column.title)).toEqual(["Things", "Watch", "About", "Society"]);
  const society = footer.find((column) => column.title === "Society");
  expect(society?.links.map((link) => link.href)).toEqual([
    "/contact",
    "https://x.com/thenormalcorp",
    "/#notify",
  ]);
});
