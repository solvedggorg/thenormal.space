export const apiUrl = (import.meta.env.PUBLIC_API_URL || "").replace(/\/$/, "");

export function listIsLive(): boolean {
  return apiUrl.length > 0;
}
