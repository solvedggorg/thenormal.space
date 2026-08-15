import { expect, test } from "bun:test";
import { isPageLook, parseRange, toDataPoint, type PageRequest } from "./pageview";

function req(over: Partial<PageRequest> = {}): PageRequest {
  return {
    method: "GET",
    url: "https://thenormal.space/dishwasher",
    host: "thenormal.space",
    referer: "",
    deviceType: "desktop",
    country: "US",
    regionCode: "CA",
    status: 200,
    verifiedBot: false,
    definitelyAutomated: false,
    ...over,
  };
}

test("parseRange defaults to 7d", () => {
  expect(parseRange(null)).toBe("7d");
  expect(parseRange("nope")).toBe("7d");
  expect(parseRange("24h")).toBe("24h");
  expect(parseRange("30d")).toBe("30d");
});

test("keeps a shop HTML GET", () => {
  expect(isPageLook(req({ url: "https://shop.thenormal.space/product/x", host: "shop.thenormal.space" }))).toBe(true);
});

test("drops assets, POST, wrong host, bots, _astro, REDACTED", () => {
  expect(isPageLook(req({ url: "https://thenormal.space/_astro/x.js" }))).toBe(false);
  expect(isPageLook(req({ url: "https://thenormal.space/fonts/sora-600.woff2" }))).toBe(false);
  expect(isPageLook(req({ url: "https://thenormal.space/favicon.ico" }))).toBe(false);
  expect(isPageLook(req({ method: "POST" }))).toBe(false);
  expect(isPageLook(req({ host: "api.thenormal.space", url: "https://api.thenormal.space/list/subscribe" }))).toBe(false);
  expect(isPageLook(req({ host: "stats.thenormal.space", url: "https://stats.thenormal.space/" }))).toBe(false);
  expect(isPageLook(req({ verifiedBot: true }))).toBe(false);
  expect(isPageLook(req({ definitelyAutomated: true }))).toBe(false);
  expect(toDataPoint(req({ url: "https://thenormal.space/user/REDACTED" }))).toBeNull();
});

test("maps blobs: path stripped, referrer host, device, state", () => {
  const point = toDataPoint(
    req({
      url: "https://thenormal.space/dishwasher?utm=1#why",
      referer: "https://www.google.com/search?q=normal",
      deviceType: "mobile",
      regionCode: "TX",
      status: 200,
    }),
  );
  expect(point).toEqual({
    indexes: ["thenormal.space"],
    blobs: ["/dishwasher", "www.google.com", "phone", "TX", "200"],
    doubles: [1],
  });
});

test("same-site and empty referrer are (direct); missing region is US", () => {
  const direct = toDataPoint(req({ referer: "https://thenormal.space/about" }));
  expect(direct?.blobs[1]).toBe("(direct)");
  const shopSelf = toDataPoint(
    req({ host: "shop.thenormal.space", url: "https://shop.thenormal.space/", referer: "https://shop.thenormal.space/cart" }),
  );
  expect(shopSelf?.blobs[1]).toBe("(direct)");
  expect(toDataPoint(req({ regionCode: undefined }))?.blobs[3]).toBe("US");
  expect(toDataPoint(req({ deviceType: undefined }))?.blobs[2]).toBe("other");
  expect(toDataPoint(req({ url: "https://thenormal.space/" }))?.blobs[0]).toBe("/");
});
