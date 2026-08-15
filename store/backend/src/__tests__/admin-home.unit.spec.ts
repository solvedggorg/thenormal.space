import { adminHomeRedirect } from "../../worker/admin-home";

function request(method: string, url: string) {
  return new Request(url, { method });
}

describe("adminHomeRedirect", () => {
  it("sends GET / to the Medusa admin", () => {
    const response = adminHomeRedirect(
      request("GET", "https://admin1.thenormal.space/"),
    );
    expect(response).not.toBeNull();
    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe(
      "https://admin1.thenormal.space/app",
    );
  });

  it("keeps query string on the admin path", () => {
    const response = adminHomeRedirect(
      request("GET", "https://admin1.thenormal.space/?next=orders"),
    );
    expect(response?.headers.get("location")).toBe(
      "https://admin1.thenormal.space/app?next=orders",
    );
  });

  it("redirects HEAD / as well", () => {
    const response = adminHomeRedirect(
      request("HEAD", "https://admin1.thenormal.space/"),
    );
    expect(response?.status).toBe(302);
  });

  it("leaves Medusa routes alone", () => {
    expect(
      adminHomeRedirect(request("GET", "https://admin1.thenormal.space/app")),
    ).toBeNull();
    expect(
      adminHomeRedirect(request("GET", "https://admin1.thenormal.space/health")),
    ).toBeNull();
    expect(
      adminHomeRedirect(request("GET", "https://admin1.thenormal.space/store")),
    ).toBeNull();
    expect(
      adminHomeRedirect(request("POST", "https://admin1.thenormal.space/")),
    ).toBeNull();
  });
});
