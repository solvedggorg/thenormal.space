import { expect, test } from "bun:test";
import { requestFromTrace, writeFromEvents, type TraceLike } from "./index";

function trace(over: TraceLike = {}): TraceLike {
  return {
    event: {
      request: {
        url: "https://thenormal.space/about",
        method: "GET",
        headers: { referer: "https://t.co/x" },
        cf: { country: "US", regionCode: "NY", deviceType: "desktop", botManagement: { verifiedBot: false, score: 99 } },
        ...over.event?.request,
      },
      response: { status: 200, ...over.event?.response },
    },
  };
}

test("requestFromTrace maps cf and headers", () => {
  const req = requestFromTrace(trace());
  expect(req?.host).toBe("thenormal.space");
  expect(req?.referer).toBe("https://t.co/x");
  expect(req?.regionCode).toBe("NY");
  expect(req?.deviceType).toBe("desktop");
  expect(req?.verifiedBot).toBe(false);
  expect(req?.definitelyAutomated).toBe(false);
});

test("requestFromTrace uses CF-Device-Type when cf.deviceType is missing", () => {
  const req = requestFromTrace(
    trace({
      event: {
        request: {
          headers: { referer: "https://t.co/x", "Cf-Device-Type": "mobile" },
          cf: { country: "US", regionCode: "NY", botManagement: { verifiedBot: false, score: 99 } },
        },
      },
    }),
  );
  expect(req?.deviceType).toBe("mobile");
});

test("requestFromTrace does not store User-Agent as deviceType", () => {
  const req = requestFromTrace(
    trace({
      event: {
        request: {
          headers: { referer: "https://t.co/x", "user-agent": "Mozilla/5.0 iPhone" },
          cf: { country: "US", regionCode: "NY", botManagement: { verifiedBot: false, score: 99 } },
        },
      },
    }),
  );
  expect(req?.deviceType).toBeUndefined();
});

test("score 1 is definitely automated", () => {
  const req = requestFromTrace(
    trace({ event: { request: { cf: { botManagement: { score: 1 } } } } }),
  );
  expect(req?.definitelyAutomated).toBe(true);
});

test("writeFromEvents writes one point for a page look and skips assets", () => {
  const written: unknown[] = [];
  const n = writeFromEvents(
    [
      trace(),
      trace({ event: { request: { url: "https://thenormal.space/favicon.ico" } } }),
    ],
    { writeDataPoint: (p) => written.push(p) },
  );
  expect(n).toBe(1);
  expect(written).toHaveLength(1);
});
