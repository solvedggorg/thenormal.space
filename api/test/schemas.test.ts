import { describe, expect, test } from "bun:test";
import { parseContact, parseSubscribe } from "../src/schemas";

describe("parseSubscribe", () => {
  test("normalizes email and keeps interest", () => {
    expect(
      parseSubscribe({
        email: "  A@B.C  ",
        website: "",
        turnstileToken: "tok",
        interest: "dishwasher",
      }),
    ).toEqual({
      ok: true,
      value: { email: "a@b.c", website: "", turnstileToken: "tok", interest: "dishwasher" },
    });
  });

  test("rejects missing token, bad email, and bad interest", () => {
    expect(parseSubscribe({ email: "a@b.c", interest: "all" })).toEqual({
      ok: false,
      error: "Could not verify this request.",
    });
    expect(parseSubscribe({ email: "nope", turnstileToken: "tok", interest: "all" })).toEqual({
      ok: false,
      error: "Enter an email we can write back to.",
    });
    expect(parseSubscribe({ email: "a@b.c", turnstileToken: "tok", interest: "toaster" })).toEqual({
      ok: false,
      error: "Choose what you want a note about.",
    });
  });
});

describe("parseContact", () => {
  const good = {
    name: "Ada",
    email: "  Ada@Lab.org  ",
    topic: "things",
    message: "I want a dishwasher that is just a dishwasher.",
    turnstileToken: "tok",
  };

  test("normalizes email and accepts things topic", () => {
    expect(parseContact({ ...good, website: "" })).toEqual({
      ok: true,
      value: {
        name: "Ada",
        email: "ada@lab.org",
        topic: "things",
        message: "I want a dishwasher that is just a dishwasher.",
        website: "",
        turnstileToken: "tok",
      },
    });
  });

  test("rejects grants topic and short name", () => {
    expect(parseContact({ ...good, topic: "grants" })).toEqual({
      ok: false,
      error: "Choose a topic.",
    });
    expect(parseContact({ ...good, name: "A" })).toEqual({
      ok: false,
      error: "Enter a name.",
    });
  });
});
