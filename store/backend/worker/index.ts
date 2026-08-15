import { Container, getContainer } from "@cloudflare/containers";
import { adminHomeRedirect } from "./admin-home";
import { containerEnv } from "./env";

export class MedusaServer extends Container<Env> {
  defaultPort = 9000;
  sleepAfter = "2h";
  enableInternet = true;
  // Current image WORKDIR is /app/.medusa/server; keep an absolute start so
  // either that image or a later /app WORKDIR can boot without db:migrate.
  entrypoint = ["sh", "-lc", "npm --prefix /app/.medusa/server start"];

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envVars = containerEnv(env);
  }

  override async fetch(request: Request): Promise<Response> {
    if (!this.envVars.DATABASE_URL) {
      return new Response(
        "Shop backend missing DATABASE_URL. Set the Neon connection string as a Worker secret. Hyperdrive cannot be used from this container.",
        { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    try {
      await this.startAndWaitForPorts({
        startOptions: {
          envVars: this.envVars,
          entrypoint: this.entrypoint,
          enableInternet: true,
        },
        cancellationOptions: {
          instanceGetTimeoutMS: 60_000,
          portReadyTimeoutMS: 180_000,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("medusa container failed to start", message);
      return new Response(`Shop backend unavailable: ${message}`, {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "retry-after": "15",
        },
      });
    }
    return super.fetch(request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const home = adminHomeRedirect(request);
    if (home) {
      return home;
    }
    const current = getContainer(env.MEDUSA, "server-printful");
    for (const name of ["server", "server-stripe"] as const) {
      try {
        const previous = getContainer(env.MEDUSA, name);
        const state = await previous.getState();
        if (state.status === "running" || state.status === "healthy") {
          await previous.destroy();
        }
      } catch (error) {
        console.warn("could not stop previous medusa instance", name, error);
      }
    }
    return current.fetch(request);
  },
};
