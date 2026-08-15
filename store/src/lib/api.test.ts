import { describe, expect, test } from "bun:test";
import { shopIsLive } from "./api";

describe("shopIsLive", () => {
  test("is false when PUBLIC_API_URL is empty", () => {
    expect(shopIsLive()).toBe(false);
  });
});
