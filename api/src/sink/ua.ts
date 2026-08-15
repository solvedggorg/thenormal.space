export type Tech = {
  browser: string;
  os: string;
};

export function parseUserAgent(ua: string): Tech {
  const value = ua || "";
  return { browser: browserOf(value), os: osOf(value) };
}

function browserOf(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Firefox|FxiOS/i.test(ua)) return "Firefox";
  if (/CriOS|Chrome|Chromium/i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS/i.test(ua)) return "Safari";
  if (/MSIE |Trident\//i.test(ua)) return "IE";
  return "other";
}

function osOf(ua: string): string {
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "Chrome OS";
  if (/Linux/i.test(ua)) return "Linux";
  return "other";
}

export function looksLikeBot(ua: string): boolean {
  if (!ua) return false;
  return /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|wget|curl|python-requests|httpie|aiohttp/i.test(
    ua,
  );
}
