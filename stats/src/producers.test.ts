import { expect, test } from "bun:test";
import site from "../../wrangler.jsonc";
import shop from "../../store/wrangler.jsonc";

test("producers tail into thenormal-stats-tail and run the worker first", () => {
  expect(site.tail_consumers).toEqual([{ service: "thenormal-stats-tail" }]);
  expect(shop.tail_consumers).toEqual([{ service: "thenormal-stats-tail" }]);
  expect(site.assets.run_worker_first).toBe(true);
  expect(shop.assets.run_worker_first).toBe(true);
});
