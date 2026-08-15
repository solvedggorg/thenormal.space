export function formatPath(host, path) {
  if (host === "shop.thenormal.space") return `shop ${path}`;
  return path;
}

export function isStale(generatedAt, nowMs) {
  if (generatedAt == null) return true;
  return nowMs - Date.parse(generatedAt) > 10 * 60 * 1000;
}

export function fillOpacity(views, max) {
  if (views === 0) return 0.08;
  const ratio = max > 0 ? views / max : 1;
  // (1 + 4 * ratio) / 5 is 0.2 + 0.8 * ratio without the 0.2 + 0.4 float residue.
  const next = (1 + 4 * ratio) / 5;
  return Math.min(1, Math.max(0.2, next));
}

function parseRange(raw) {
  if (raw === "24h" || raw === "7d" || raw === "30d") return raw;
  return "7d";
}

const DASH = "—";
const counts = new Intl.NumberFormat("en-US");

function formatCount(value) {
  return counts.format(value);
}

export function blockedDisplay(unavailable, blocked) {
  if (unavailable) {
    return { outsideUs: DASH, vpnTor: DASH, bots: DASH };
  }
  return {
    outsideUs: formatCount(blocked?.outsideUs ?? 0),
    vpnTor: formatCount(blocked?.vpnTor ?? 0),
    bots: formatCount(blocked?.bots ?? 0),
  };
}

function trimIsoToMinutes(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return `${new Date(ms).toISOString().slice(0, 16)}Z`;
}

function formatBucket(iso) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function $(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function markRange(range) {
  for (const link of document.querySelectorAll("nav a[href]")) {
    const href = link.getAttribute("href") ?? "";
    const value = parseRange(new URL(href, "https://stats.thenormal.space/").searchParams.get("range"));
    if (value === range) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function setStatus(snap, nowMs) {
  const status = $("status");
  if (!status) return;
  if (snap.unavailable) {
    status.textContent = "Numbers are unavailable";
    return;
  }
  if (isStale(snap.generatedAt ?? null, nowMs)) {
    status.textContent = `Last updated ${trimIsoToMinutes(snap.generatedAt)}`;
    return;
  }
  if (!Array.isArray(snap.pages) || snap.pages.length === 0) {
    status.textContent = "No page looks yet.";
    return;
  }
  status.textContent = "";
}

function pairItem(left, right) {
  const li = document.createElement("li");
  const name = document.createElement("span");
  name.textContent = left;
  const value = document.createElement("span");
  value.textContent = right;
  li.append(name, value);
  return li;
}

function fillList(id, items, render, emptyCopy) {
  const list = $(id);
  if (!list) return;
  list.replaceChildren();
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = emptyCopy;
    list.append(li);
    return;
  }
  for (const item of items) list.append(render(item));
}

function fillHero(snap) {
  if (snap.unavailable) {
    setText("visitors", DASH);
    setText("pageviews", DASH);
    return;
  }
  setText("visitors", formatCount(snap.visitors ?? 0));
  setText("pageviews", formatCount(snap.pageviews ?? 0));
}

let seriesData = [];

function pointsFor(series, key, width, height) {
  const pad = { l: 6, r: 6, t: 10, b: 14 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const max = Math.max(1, ...series.map((row) => Math.max(row.visitors ?? 0, row.pageviews ?? 0)));
  const last = series.length - 1;
  return series.map((row, i) => {
    const x = pad.l + (last === 0 ? innerW / 2 : (i / last) * innerW);
    const y = pad.t + innerH - ((row[key] ?? 0) / max) * innerH;
    return `${x},${y}`;
  });
}

function writeReadout(index) {
  const readout = $("series-readout");
  if (!readout) return;
  const row = seriesData[index];
  if (!row) {
    readout.textContent = DASH;
    return;
  }
  readout.textContent = `${formatBucket(row.t)}  visitors ${formatCount(row.visitors ?? 0)}  pageviews ${formatCount(row.pageviews ?? 0)}`;
}

function nearestIndex(event, svg) {
  if (!seriesData.length) return -1;
  const box = svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * box.width;
  const pts = pointsFor(seriesData, "visitors", box.width, box.height);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const px = Number(pts[i].split(",")[0]);
    const dist = Math.abs(px - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function drawSeries(series) {
  const svg = $("series");
  const visitors = $("line-visitors");
  const pageviews = $("line-pageviews");
  seriesData = Array.isArray(series) ? series : [];
  if (!svg || !visitors || !pageviews) return;
  if (!seriesData.length) {
    visitors.setAttribute("points", "");
    pageviews.setAttribute("points", "");
    writeReadout(-1);
    return;
  }
  const box = svg.viewBox.baseVal;
  visitors.setAttribute("points", pointsFor(seriesData, "visitors", box.width, box.height).join(" "));
  pageviews.setAttribute("points", pointsFor(seriesData, "pageviews", box.width, box.height).join(" "));
  writeReadout(seriesData.length - 1);
}

function bindSeries() {
  const svg = $("series");
  if (!svg || svg.dataset.bound === "1") return;
  svg.dataset.bound = "1";
  svg.addEventListener("pointermove", (event) => {
    writeReadout(nearestIndex(event, svg));
  });
  svg.addEventListener("keydown", (event) => {
    if (!seriesData.length) return;
    const current = Number(svg.dataset.index ?? String(seriesData.length - 1));
    let next = current;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(seriesData.length - 1, current + 1);
    else return;
    event.preventDefault();
    svg.dataset.index = String(next);
    writeReadout(next);
  });
}

function fillPages(pages, unavailable) {
  fillList(
    "pages",
    pages,
    (row) => pairItem(formatPath(row.host, row.path), formatCount(row.views)),
    unavailable ? DASH : "No page looks yet.",
  );
}

function fillReferrers(referrers) {
  fillList("referrers", referrers, (row) => pairItem(row.host, formatCount(row.views)), DASH);
}

function fillDevices(devices) {
  const views = { computer: 0, phone: 0, other: 0 };
  for (const row of devices) {
    if (row.class === "computer" || row.class === "phone" || row.class === "other") {
      views[row.class] += row.views;
    } else {
      views.other += row.views;
    }
  }
  const total = views.computer + views.phone + views.other;
  const rows = ["computer", "phone", "other"].map((cls) => ({
    class: cls,
    views: views[cls],
  }));
  fillList(
    "devices",
    rows,
    (row) => pairItem(row.class, total > 0 ? `${Math.round((row.views / total) * 100)}%` : DASH),
    DASH,
  );
}

function fillStates(states) {
  const live = states.filter((row) => row.views > 0).sort((a, b) => b.views - a.views);
  const total = states.reduce((sum, row) => sum + row.views, 0);
  fillList(
    "states",
    live,
    (row) => pairItem(row.code, total > 0 ? `${Math.round((row.views / total) * 100)}%` : DASH),
    DASH,
  );
}

function fillBlocked(unavailable, blocked) {
  const root = $("blocked");
  if (!root) return;
  const values = blockedDisplay(unavailable, blocked);
  for (const [key, value] of Object.entries(values)) {
    const el = root.querySelector(`[data-blocked="${key}"]`);
    if (el) el.textContent = value;
  }
}

function paintMap(states) {
  const host = $("map");
  if (!host) return;
  const svg = host.querySelector("svg");
  if (!svg) return;
  const viewsBy = new Map(states.map((row) => [row.code, row.views]));
  const max = Math.max(0, ...states.map((row) => row.views));
  for (const path of svg.querySelectorAll("path[id]")) {
    const code = path.id;
    if (!/^[A-Z]{2}$/.test(code)) continue;
    const views = viewsBy.get(code) ?? 0;
    path.style.fillOpacity = String(fillOpacity(views, max));
    path.setAttribute("tabindex", "0");
    path.setAttribute("aria-label", `${code} ${formatCount(views)}`);
    let title = path.querySelector("title");
    if (!title) {
      title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      path.prepend(title);
    }
    title.textContent = `${code} ${formatCount(views)}`;
  }
}

async function injectMap(states) {
  const host = $("map");
  if (!host) return;
  const res = await fetch("/us.svg");
  if (!res.ok) return;
  const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.tagName.toLowerCase() !== "svg") return;
  host.replaceChildren(document.importNode(svg, true));
  paintMap(states);
}

const emptySnap = {
  unavailable: true,
  generatedAt: null,
  visitors: 0,
  pageviews: 0,
  series: [],
  pages: [],
  referrers: [],
  devices: [],
  states: [],
  blocked: { outsideUs: 0, vpnTor: 0, bots: 0 },
};

async function loadSnapshot(range) {
  const res = await fetch("/api/snapshot?range=" + range);
  if (!res.ok) throw new Error("snapshot");
  return res.json();
}

async function boot() {
  const range = parseRange(new URLSearchParams(location.search).get("range"));
  markRange(range);
  bindSeries();
  let snap;
  try {
    snap = await loadSnapshot(range);
  } catch {
    snap = emptySnap;
  }
  const nowMs = Date.now();
  const pages = Array.isArray(snap.pages) ? snap.pages : [];
  const referrers = Array.isArray(snap.referrers) ? snap.referrers : [];
  const devices = Array.isArray(snap.devices) ? snap.devices : [];
  const states = Array.isArray(snap.states) ? snap.states : [];
  const series = Array.isArray(snap.series) ? snap.series : [];
  const blocked = snap.blocked ?? { outsideUs: 0, vpnTor: 0, bots: 0 };
  setStatus(snap, nowMs);
  fillHero(snap);
  drawSeries(series);
  fillPages(pages, Boolean(snap.unavailable));
  fillReferrers(referrers);
  fillDevices(devices);
  fillStates(states);
  fillBlocked(Boolean(snap.unavailable), blocked);
  await injectMap(states);
}

if (typeof document !== "undefined" && document.getElementById("status")) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void boot());
  else void boot();
}
