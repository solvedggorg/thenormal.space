import { beforeEach, describe, expect, test } from "bun:test";
import { addShopCartLine, clearShopCart, readShopCart } from "./shop-cart";

const memory = new Map<string, string>();
(globalThis as { localStorage: Storage }).localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value);
  },
  removeItem: (key) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
  key: (index) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};

describe("shop-cart", () => {
  beforeEach(() => memory.clear());
  test("adds a line and increments quantity", () => {
    clearShopCart();
    addShopCartLine({ handle: "dishwasher", name: "Dishwasher", quantity: 1, variant_id: "var_1" });
    addShopCartLine({ handle: "dishwasher", name: "Dishwasher", quantity: 1 });
    expect(readShopCart()).toEqual([
      { handle: "dishwasher", name: "Dishwasher", quantity: 2, variant_id: "var_1" },
    ]);
    clearShopCart();
    expect(readShopCart()).toEqual([]);
  });
});
