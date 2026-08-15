const params = new URLSearchParams(location.search);
const range = ["24h", "7d", "30d"].includes(params.get("range")) ? params.get("range") : "7d";
const siteSelect = document.getElementById("site");
const statusEl = document.getElementById("status");

for (const link of document.querySelectorAll("nav[aria-label='Range'] a")) {
  if (link.dataset.range === range) link.setAttribute("aria-current", "page");
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function pct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function duration(ms) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function dash(list, empty) {
  list.replaceChildren();
  if (!empty.length) {
    const li = document.createElement("li");
    li.innerHTML = "<span>—</span><span>—</span>";
    list.append(li);
    return;
  }
  for (const row of empty) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = row.label;
    const right = document.createElement("span");
    right.textContent = fmt(row.views);
    li.append(left, right);
    list.append(li);
  }
}

function drawSeries(series) {
  const visitors = document.getElementById("line-visitors");
  const pageviews = document.getElementById("line-pageviews");
  const readout = document.getElementById("series-readout");
  if (!series.length) {
    visitors.setAttribute("points", "");
    pageviews.setAttribute("points", "");
    readout.textContent = "—";
    return;
  }
  const w = 640;
  const h = 160;
  const max = Math.max(1, ...series.map((row) => Math.max(row.visitors || 0, row.pageviews || 0)));
  const pts = (key) =>
    series
      .map((row, i) => {
        const x = series.length === 1 ? w / 2 : (i / (series.length - 1)) * (w - 8) + 4;
        const y = h - 8 - ((row[key] || 0) / max) * (h - 16);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  visitors.setAttribute("points", pts("visitors"));
  pageviews.setAttribute("points", pts("pageviews"));
  const last = series[series.length - 1];
  readout.textContent = `${fmt(last.visitors)} visitors · ${fmt(last.pageviews)} pageviews`;
}

async function json(path) {
  const res = await fetch(path, { credentials: "same-origin" });
  if (res.status === 401 || res.status === 403) throw new Error("denied");
  if (res.redirected && res.url.includes("/login")) throw new Error("login");
  if (!res.ok) throw new Error("fail");
  return res.json();
}

function siteId() {
  return siteSelect.value || params.get("site") || "tns";
}

function setQuery(next) {
  const url = new URL(location.href);
  url.searchParams.set("site", next.site ?? siteId());
  url.searchParams.set("range", next.range ?? range);
  history.replaceState({}, "", url);
}

async function loadSites() {
  const data = await json("/api/sites");
  siteSelect.replaceChildren();
  for (const site of data.sites || []) {
    const opt = document.createElement("option");
    opt.value = site.id;
    opt.textContent = site.name;
    siteSelect.append(opt);
  }
  const wanted = params.get("site") || data.sites?.[0]?.id || "tns";
  siteSelect.value = wanted;
  return data.sites || [];
}

async function loadOverview() {
  const site = siteId();
  const data = await json(`/api/overview?site=${encodeURIComponent(site)}&range=${range}`);
  document.getElementById("visitors").textContent = fmt(data.visitors);
  document.getElementById("pageviews").textContent = fmt(data.pageviews);
  document.getElementById("sessions").textContent = fmt(data.sessions);
  document.getElementById("bounce").textContent = pct(data.bounceRate);
  document.getElementById("duration").textContent = duration(data.durationMs);
  const live = data.live || { visitors: 0 };
  const liveEl = document.getElementById("live");
  liveEl.textContent = `Live ${fmt(live.visitors)}`;
  liveEl.classList.toggle("on", live.visitors > 0);
  if (data.unavailable) statusEl.textContent = "Numbers are unavailable.";
  else if (data.generatedAt) {
    const age = Date.now() - Date.parse(data.generatedAt);
    statusEl.textContent = age > 10 * 60 * 1000 ? `Last updated ${new Date(data.generatedAt).toLocaleString()}` : "";
  }
  drawSeries(data.series || []);
  dash(
    document.getElementById("pages"),
    (data.pages || []).map((row) => ({ label: row.path, views: row.views })),
  );
  dash(
    document.getElementById("referrers"),
    (data.referrers || []).map((row) => ({ label: row.host, views: row.views })),
  );
  dash(
    document.getElementById("countries"),
    (data.countries || []).map((row) => ({ label: row.code, views: row.views })),
  );
  dash(
    document.getElementById("regions"),
    (data.regions || []).map((row) => ({ label: row.name, views: row.views })),
  );
  dash(
    document.getElementById("devices"),
    (data.devices || []).map((row) => ({ label: row.class, views: row.views })),
  );
  dash(
    document.getElementById("browsers"),
    (data.browsers || []).map((row) => ({ label: row.name, views: row.views })),
  );
  dash(
    document.getElementById("os"),
    (data.os || []).map((row) => ({ label: row.name, views: row.views })),
  );
  dash(
    document.getElementById("events"),
    (data.events || []).map((row) => ({ label: row.name, views: row.views })),
  );
}

async function loadMeta(sites) {
  const site = siteId();
  const current = (sites || []).find((row) => row.id === site);
  const hosts = document.getElementById("hosts");
  hosts.replaceChildren();
  for (const host of current?.hosts || []) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = host;
    const form = document.createElement("form");
    form.innerHTML = `<button class="ghost" type="submit">Remove</button>`;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      await fetch(`/api/sites/${encodeURIComponent(site)}/hosts?host=${encodeURIComponent(host)}`, {
        method: "DELETE",
      });
      const next = await loadSites();
      await loadMeta(next);
    });
    li.append(left, form);
    hosts.append(li);
  }
  const snippet = await json(`/api/sites/${encodeURIComponent(site)}/snippet`);
  document.getElementById("snippet").textContent = snippet.html;
  const goals = await json(`/api/sites/${encodeURIComponent(site)}/goals`);
  const list = document.getElementById("goals");
  list.replaceChildren();
  for (const goal of goals.goals || []) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.textContent = `${goal.name} · ${goal.match_type} ${goal.match_value}`;
    const form = document.createElement("form");
    form.innerHTML = `<button class="ghost" type="submit">Remove</button>`;
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      await fetch(`/api/sites/${encodeURIComponent(site)}/goals/${encodeURIComponent(goal.id)}`, {
        method: "DELETE",
      });
      await loadMeta(await loadSites());
    });
    li.append(left, form);
    list.append(li);
  }
}

siteSelect.addEventListener("change", async () => {
  setQuery({ site: siteSelect.value });
  await Promise.all([loadOverview(), loadMeta(await loadSites())]);
});

document.getElementById("host-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const host = document.getElementById("host").value.trim();
  if (!host) return;
  await fetch(`/api/sites/${encodeURIComponent(siteId())}/hosts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host }),
  });
  document.getElementById("host").value = "";
  await loadMeta(await loadSites());
});

document.getElementById("goal-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  await fetch(`/api/sites/${encodeURIComponent(siteId())}/goals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("goal-name").value,
      match_type: document.getElementById("goal-type").value,
      match_value: document.getElementById("goal-match").value,
    }),
  });
  document.getElementById("goal-name").value = "";
  document.getElementById("goal-match").value = "";
  await loadMeta(await loadSites());
});

try {
  const me = await json("/api/me");
  document.getElementById("who").textContent = me.email || "";
  const sites = await loadSites();
  setQuery({ site: siteId(), range });
  await Promise.all([loadOverview(), loadMeta(sites)]);
} catch (err) {
  if (err.message === "login" || err.message === "denied") location.href = "/login";
  else statusEl.textContent = "Numbers are unavailable.";
}
