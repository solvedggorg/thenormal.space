import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_IDS,
	formatList,
	hasUsableDatabaseUrl,
	localUrl,
	parseArgs,
	PORTS,
	selectedIds,
	sharedEnv,
	upsertEnvFile,
	urlMap,
} from "./dev-all.ts";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("parseArgs understands filters", () => {
	const args = parseArgs(["--only", "api,site", "--skip", "stats", "--with", "links", "--dry-run"]);
	expect(args.only).toEqual(["api", "site"]);
	expect(args.skip).toEqual(["stats"]);
	expect(args.withOptional).toEqual(["links"]);
	expect(args.dryRun).toBe(true);
});

test("unknown flag and service fail", () => {
	expect(() => parseArgs(["--nope"])).toThrow(/unknown flag/);
	expect(() => selectedIds(parseArgs(["--only", "nope"]))).toThrow(/unknown service id: nope/);
});

test("default selection skips links until --with", () => {
	expect(selectedIds(parseArgs([]))).toEqual(DEFAULT_IDS);
	expect(selectedIds(parseArgs(["--with", "links"]))).toContain("links");
	expect(selectedIds(parseArgs(["--skip", "shop-backend"]))).not.toContain("shop-backend");
	expect(selectedIds(parseArgs(["--only", "api,stats"]))).toEqual(["api", "stats"]);
});

test("url map is the documented localhost ports", () => {
	const urls = urlMap();
	expect(urls.site).toBe("http://localhost:4321");
	expect(urls.shop).toBe("http://localhost:4322");
	expect(urls.api).toBe("http://localhost:8787");
	expect(urls.auth).toBe("http://localhost:8788");
	expect(urls.authAdmin).toBe("http://localhost:8789");
	expect(urls.medusa).toBe("http://localhost:9000");
	expect(urls.stats).toBe("http://localhost:8790");
	expect(urls.analytics).toBe("http://localhost:8791");
	expect(urls.links).toBe("http://localhost:7465");
});

test("shared env points every well-known key at the local map", () => {
	const env = sharedEnv();
	expect(env.PUBLIC_API_URL).toBe(localUrl(PORTS.api));
	expect(env.PUBLIC_MARKETING_URL).toBe(localUrl(PORTS.site));
	expect(env.PUBLIC_SITE_URL).toBe(localUrl(PORTS.shop));
	expect(env.PUBLIC_MEDUSA_BACKEND_URL).toBe(localUrl(PORTS["shop-backend"]));
	expect(env.SITE_URL).toBe(localUrl(PORTS.site));
	expect(env.MEDUSA_BACKEND_URL).toBe(localUrl(PORTS["shop-backend"]));
	expect(env.SHOP_API_URL).toBe(localUrl(PORTS.api));
	expect(env.STORE_CORS).toContain("http://localhost:4322");
	expect(env.JUMPCLOUD_REDIRECT_URI).toBe("http://localhost:9000/app/login");
	expect(env.TNS_AUTH_URL).toBe("http://localhost:8788");
});

test("upsertEnvFile updates keys without dropping others", () => {
	const dir = mkdtempSync(join(tmpdir(), "dev-all-"));
	dirs.push(dir);
	const path = join(dir, ".dev.vars");
	writeFileSync(path, "TURNSTILE_SECRET=keep\nSITE_URL=https://thenormal.space\n");
	upsertEnvFile(path, { SITE_URL: "http://localhost:4321", ALLOW_DEV_ORIGINS: "true" });
	const text = readFileSync(path, "utf8");
	expect(text).toContain("TURNSTILE_SECRET=keep");
	expect(text).toContain("SITE_URL=http://localhost:4321");
	expect(text).not.toContain("https://thenormal.space");
	expect(text).toContain("ALLOW_DEV_ORIGINS=true");
});

test("hasUsableDatabaseUrl rejects placeholders", () => {
	expect(hasUsableDatabaseUrl(undefined)).toBe(false);
	expect(hasUsableDatabaseUrl("postgresql://user:pass@host/neondb?sslmode=require")).toBe(false);
	expect(hasUsableDatabaseUrl("postgresql://neondb_owner:secret@ep-x.neon.tech/neondb")).toBe(
		true,
	);
});

test("formatList is id + url", () => {
	expect(formatList(["api", "site"])).toBe(
		`api            ${localUrl(PORTS.api)}\nsite           ${localUrl(PORTS.site)}`,
	);
});

test("--list via the script prints default services", async () => {
	const proc = Bun.spawn(["bun", `${import.meta.dir}/dev-all.ts`, "--list"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	expect(exitCode).toBe(0);
	expect(stderr).toBe("");
	expect(stdout).toContain("http://localhost:4321");
	expect(stdout).toContain("http://localhost:8787");
	expect(stdout).not.toContain("7465");
});
