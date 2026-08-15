/** Medusa v2 serves the dashboard at /app. GET / is a 404. */
export function adminHomeRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }
  const url = new URL(request.url);
  if (url.pathname !== "/") {
    return null;
  }
  url.pathname = "/app";
  return Response.redirect(url.toString(), 302);
}
