export function matchPattern(path: string, pattern: string): boolean {
  if (pattern.startsWith("re:")) {
    try {
      return new RegExp(pattern.slice(3)).test(path);
    } catch {
      return false;
    }
  }
  const parts: string[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "*" && pattern[i + 1] === "*") {
      parts.push(".*");
      i += 1;
      continue;
    }
    if (ch === "*") {
      parts.push("[^/]*");
      continue;
    }
    if ("\\^$+?()[]{}|.".includes(ch)) parts.push(`\\${ch}`);
    else parts.push(ch);
  }
  try {
    return new RegExp(`^${parts.join("")}$`).test(path);
  } catch {
    return false;
  }
}

export function firstMatchingPattern(path: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    if (matchPattern(path, pattern)) return pattern;
  }
  return null;
}

/** First-party tracker at /v1/sink/t.js and /v1/sink/script.js */
export function trackerSource(): string {
  return [
    "(() => {",
    "  const s = document.currentScript;",
    "  if (!s || !s.getAttribute) return;",
    '  const site = s.getAttribute("data-site-id") || s.getAttribute("site-id") || "";',
    "  if (!site) return;",
    "  let origin = \"\";",
    "  try { origin = new URL(s.src).origin; } catch (e) { return; }",
    '  const endpoint = origin + "/v1/sink/e";',
    '  const skip = parseList(s.getAttribute("data-skip-patterns"));',
    '  const mask = parseList(s.getAttribute("data-mask-patterns"));',
    '  const debounceMs = Math.max(0, Number(s.getAttribute("data-debounce") || "400") || 0);',
    '  const tag = (s.getAttribute("data-tag") || "").slice(0, 64);',
    '  const vid = persist("ns_vid");',
    "  const SESSION_MS = 1800000;",
    "  function parseList(raw) {",
    "    if (!raw) return [];",
    "    try {",
    "      const v = JSON.parse(raw);",
    "      return Array.isArray(v) ? v.filter(function (x) { return typeof x === \"string\"; }) : [];",
    "    } catch (e) { return []; }",
    "  }",
    "  function persist(key) {",
    "    try {",
    "      let id = localStorage.getItem(key);",
    "      if (!id) {",
    "        id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());",
    "        localStorage.setItem(key, id);",
    "      }",
    "      return id;",
    "    } catch (e) { return String(Date.now()); }",
    "  }",
    "  function sessionId() {",
    "    try {",
    "      const now = Date.now();",
    '      const last = Number(sessionStorage.getItem("ns_sid_at") || "0");',
    '      let id = sessionStorage.getItem("ns_sid");',
    "      if (!id || !last || now - last > SESSION_MS) {",
    "        id = (crypto.randomUUID && crypto.randomUUID()) || String(now);",
    '        sessionStorage.setItem("ns_sid", id);',
    "      }",
    '      sessionStorage.setItem("ns_sid_at", String(now));',
    "      return id;",
    "    } catch (e) { return vid; }",
    "  }",
    "  function match(path, pattern) {",
    '    if (pattern.slice(0, 3) === "re:") {',
    "      try { return new RegExp(pattern.slice(3)).test(path); } catch (e) { return false; }",
    "    }",
    "    const parts = [];",
    "    for (let i = 0; i < pattern.length; i++) {",
    "      const ch = pattern.charAt(i);",
    '      if (ch === "*" && pattern.charAt(i + 1) === "*") { parts.push(".*"); i++; continue; }',
    '      if (ch === "*") { parts.push("[^/]*"); continue; }',
    '      if ("\\\\^$+?()[]{}|.".indexOf(ch) >= 0) parts.push("\\\\" + ch);',
    "      else parts.push(ch);",
    "    }",
    '    try { return new RegExp("^" + parts.join("") + "$").test(path); } catch (e) { return false; }',
    "  }",
    "  function first(path, patterns) {",
    "    for (let i = 0; i < patterns.length; i++) if (match(path, patterns[i])) return patterns[i];",
    "    return null;",
    "  }",
    "  function send(payload) {",
    "    const body = JSON.stringify(payload);",
    "    try {",
    "      if (navigator.sendBeacon) {",
    '        if (navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }))) return;',
    "      }",
    "    } catch (e) {}",
    "    try {",
    '      fetch(endpoint, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } });',
    "    } catch (e) {}",
    "  }",
    "  function pagePayload(extra) {",
    "    const u = new URL(location.href);",
    "    if (first(u.pathname, skip)) return null;",
    "    const masked = first(u.pathname, mask);",
    "    const path = masked || u.pathname;",
    "    const base = {",
    "      site_id: site,",
    '      type: "pageview",',
    "      url: u.origin + path + u.search,",
    '      referrer: document.referrer || "",',
    '      title: document.title || "",',
    '      language: navigator.language || "",',
    "      screen_width: (screen && screen.width) || 0,",
    "      visitor_id: identified || vid,",
    "      session_id: sessionId(),",
    "      tag: tag",
    "    };",
    "    if (extra) for (const k in extra) base[k] = extra[k];",
    "    return base;",
    "  }",
    "  function pageview() {",
    "    const payload = pagePayload({});",
    "    if (payload) send(payload);",
    "  }",
    "  function event(name, properties) {",
    "    if (!name) return;",
    "    const extra = { type: \"custom\", event_name: String(name).slice(0, 128) };",
    "    if (properties && typeof properties === \"object\") extra.properties = properties;",
    "    const payload = pagePayload(extra);",
    "    if (payload) send(payload);",
    "  }",
    "  function trackOutbound(url) {",
    "    const payload = pagePayload({ type: \"outbound\", event_name: String(url || \"\").slice(0, 128) });",
    "    if (payload) send(payload);",
    "  }",
    "  let last = location.href;",
    "  let timer = 0;",
    "  function onChange() {",
    "    if (location.href === last) return;",
    "    last = location.href;",
    "    if (debounceMs === 0) { pageview(); return; }",
    "    clearTimeout(timer);",
    "    timer = setTimeout(pageview, debounceMs);",
    "  }",
    "  const push = history.pushState;",
    "  const replace = history.replaceState;",
    "  history.pushState = function () { push.apply(this, arguments); onChange(); };",
    "  history.replaceState = function () { replace.apply(this, arguments); onChange(); };",
    '  addEventListener("popstate", onChange);',
    '  addEventListener("click", function (ev) {',
    "    const t = ev.target;",
    '    const el = t && t.closest ? t.closest("a,[data-rybbit-event],[data-ns-event]") : null;',
    "    if (!el) return;",
    '    const custom = el.getAttribute("data-rybbit-event") || el.getAttribute("data-ns-event");',
    "    if (custom) {",
    "      const props = {};",
    "      for (let i = 0; i < el.attributes.length; i++) {",
    "        const attr = el.attributes[i];",
    '        if (attr.name.indexOf("data-rybbit-prop-") === 0) props[attr.name.slice(17)] = attr.value;',
    '        if (attr.name.indexOf("data-ns-prop-") === 0) props[attr.name.slice(13)] = attr.value;',
    "      }",
    "      event(custom, props);",
    "    }",
    '    if (el.tagName === "A") {',
    "      try {",
    "        const dest = new URL(el.href, location.href);",
    "        if (dest.origin !== location.origin) trackOutbound(dest.host);",
    "      } catch (e) {}",
    "    }",
    "  }, true);",
    '  addEventListener("error", function (ev) {',
    '    const msg = ev && ev.message ? String(ev.message) : "error";',
    '    const payload = pagePayload({ type: "error", event_name: msg.slice(0, 128) });',
    "    if (payload) send(payload);",
    "  });",
    "  let identified = null;",
    "  const api = {",
    "    event: event,",
    "    pageview: pageview,",
    "    identify: function (userId) { identified = userId ? String(userId) : null; },",
    "    clearUserId: function () { identified = null; },",
    "    getUserId: function () { return identified; },",
    "    trackOutbound: trackOutbound",
    "  };",
    "  window.thenormal = api;",
    "  window.rybbit = api;",
    "  pageview();",
    "})();",
  ].join("\n");
}
