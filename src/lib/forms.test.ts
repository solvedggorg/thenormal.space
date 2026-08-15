import { expect, test } from "bun:test";
import { contactBody, subscribeBody } from "./forms";

test("subscribeBody sends email, honeypot, token, and interest", () => {
  expect(subscribeBody("a@b.c", "", "tok", "dishwasher")).toEqual({
    email: "a@b.c",
    website: "",
    turnstileToken: "tok",
    interest: "dishwasher",
  });
});

test("contactBody sends name, email, topic, message, honeypot, and token", () => {
  expect(
    contactBody({
      name: "Ada",
      email: "ada@lab.org",
      topic: "things",
      message: "About the dishwasher.",
      website: "",
      turnstileToken: "tok",
    }),
  ).toEqual({
    name: "Ada",
    email: "ada@lab.org",
    topic: "things",
    message: "About the dishwasher.",
    website: "",
    turnstileToken: "tok",
  });
});
