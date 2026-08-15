import { containerEnv } from "../../worker/env";

describe("containerEnv", () => {
  it("passes the Neon DATABASE_URL secret and ignores Hyperdrive", () => {
    const values = containerEnv({
      DATABASE_URL: "postgresql://neondb_owner:secret@ep-example.neon.tech/neondb?sslmode=require",
      HYPERDRIVE: {
        connectionString: "postgres://user:pass@hyperdrive.internal:5432/neondb",
      },
      JWT_SECRET: "jwt",
      COOKIE_SECRET: "cookie",
      STRIPE_API_KEY: "rk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      PRINTFUL_API_TOKEN: "printfultoken",
      PRINTFUL_WEBHOOK_SECRET: "printfulhook",
      PRINTFUL_STORE_ID: "12345",
      STORE_CORS: "https://shop.thenormal.space",
    });

    expect(values.DATABASE_URL).toBe(
      "postgresql://neondb_owner:secret@ep-example.neon.tech/neondb?sslmode=require",
    );
    expect(values.JWT_SECRET).toBe("jwt");
    expect(values.COOKIE_SECRET).toBe("cookie");
    expect(values.STRIPE_API_KEY).toBe("rk_test_example");
    expect(values.STRIPE_WEBHOOK_SECRET).toBe("whsec_example");
    expect(values.PRINTFUL_API_TOKEN).toBe("printfultoken");
    expect(values.PRINTFUL_WEBHOOK_SECRET).toBe("printfulhook");
    expect(values.PRINTFUL_STORE_ID).toBe("12345");
    expect(values.PORT).toBe("9000");
    expect(JSON.stringify(values)).not.toContain("hyperdrive.internal");
  });

  it("omits DATABASE_URL when the Worker secret is missing", () => {
    const values = containerEnv({
      HYPERDRIVE: { connectionString: "postgres://user:pass@hyperdrive.internal:5432/neondb" },
    });
    expect(values.DATABASE_URL).toBeUndefined();
  });
});
