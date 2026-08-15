export const PRODUCTION_ORIGINS = [
  "https://thenormal.space",
  "https://www.thenormal.space",
  "https://shop.thenormal.space",
] as const;

export const DEV_ORIGINS = [
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "http://localhost:4322",
  "http://127.0.0.1:4322",
] as const;

export function allowedOrigin(origin: string, allowDev: boolean): string {
  if ((PRODUCTION_ORIGINS as readonly string[]).includes(origin)) return origin;
  if (allowDev && (DEV_ORIGINS as readonly string[]).includes(origin)) return origin;
  return "";
}
