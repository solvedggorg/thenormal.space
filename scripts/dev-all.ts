#!/usr/bin/env bun
// Start the first-party local stack on fixed ports and inject the URL map
// so every process knows where the others live.
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const ROOT = resolve(import.meta.dir, "..");

export const PORTS = {
	site: 4321,
	shop: 4322,
	api: 8787,
	auth: 8788,
	"auth-admin": 8789,
	"shop-backend": 9000,
	stats: 8790,
	analytics: 8791,
	links: 7465,
} as const;

export type ServiceId = keyof typeof PORTS;

export const DEFAULT_IDS: ServiceId[] = [
	"site",
	"api",
	"auth",
	"auth-admin",
	"shop",
	"shop-backend",
	"stats",
	"analytics",
];

export const OPTIONAL_IDS: ServiceId[] = ["links"];

const COLORS: Record<ServiceId, string> = {
	site: "\x1b[36m",
	shop: "\x1b[35m",
	api: "\x1b[32m",
	auth: "\x1b[33m",
	"auth-admin": "\x1b[33m",
	"shop-backend": "\x1b[34m",
	stats: "\x1b[36m",
	analytics: "\x1b[35m",
	links: "\x1b[31m",
};
const RESET = "\x1b[0m";

export function localUrl(port: number): string {
	return `http://localhost:${port}`;
}

export function urlMap(ports = PORTS) {
	return {
		site: localUrl(ports.site),
		shop: localUrl(ports.shop),
		api: localUrl(ports.api),
		auth: localUrl(ports.auth),
		authAdmin: localUrl(ports["auth-admin"]),
		medusa: localUrl(ports["shop-backend"]),
		stats: localUrl(ports.stats),
		analytics: localUrl(ports.analytics),
		links: localUrl(ports.links),
	};
}

export function sharedEnv(ports = PORTS): Record<string, string> {
	const u = urlMap(ports);
	return {
		TNS_SITE_URL: u.site,
		TNS_SHOP_URL: u.shop,
		TNS_API_URL: u.api,
		TNS_AUTH_URL: u.auth,
		TNS_AUTH_ADMIN_URL: u.authAdmin,
		TNS_MEDUSA_URL: u.medusa,
		TNS_STATS_URL: u.stats,
		TNS_ANALYTICS_URL: u.analytics,
		TNS_LINKS_URL: u.links,
		PUBLIC_API_URL: u.api,
		PUBLIC_MARKETING_URL: u.site,
		PUBLIC_SITE_URL: u.shop,
		PUBLIC_MEDUSA_BACKEND_URL: u.medusa,
		SITE_URL: u.site,
		MEDUSA_BACKEND_URL: u.medusa,
		SHOP_API_URL: u.api,
		ALLOW_DEV_ORIGINS: "true",
		ALLOW_DEV_ACCESS: "true",
		STORE_CORS: `${u.shop},https://shop.thenormal.space`,
		ADMIN_CORS: `${u.medusa},https://admin1.thenormal.space`,
		AUTH_CORS: `${u.shop},${u.medusa},https://shop.thenormal.space,https://admin1.thenormal.space`,
		JUMPCLOUD_REDIRECT_URI: `${u.medusa}/app/login`,
		JUMPCLOUD_ALLOWED_CALLBACK_URLS: `${u.medusa}/app/login`,
		CLERK_AUTHORIZED_PARTIES: `${u.shop},https://shop.thenormal.space,https://clerk.thenormal.space`,
		CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
	};
}

export type ParsedArgs = {
	list: boolean;
	help: boolean;
	dryRun: boolean;
	only: string[];
	skip: string[];
	withOptional: string[];
};

export function parseArgs(argv: string[]): ParsedArgs {
	const out: ParsedArgs = {
		list: false,
		help: false,
		dryRun: false,
		only: [],
		skip: [],
		withOptional: [],
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => {
			const value = argv[++i];
			if (!value) throw new Error(`${arg} needs a value`);
			return value;
		};
		switch (arg) {
			case "--list":
				out.list = true;
				break;
			case "--help":
			case "-h":
				out.help = true;
				break;
			case "--dry-run":
				out.dryRun = true;
				break;
			case "--only":
				out.only.push(...next().split(",").filter(Boolean));
				break;
			case "--skip":
				out.skip.push(...next().split(",").filter(Boolean));
				break;
			case "--with":
				out.withOptional.push(...next().split(",").filter(Boolean));
				break;
			default:
				throw new Error(`unknown flag: ${arg}`);
		}
	}
	return out;
}

export function selectedIds(args: ParsedArgs): ServiceId[] {
	const known = new Set<string>([...DEFAULT_IDS, ...OPTIONAL_IDS]);
	for (const id of [...args.only, ...args.skip, ...args.withOptional]) {
		if (!known.has(id)) throw new Error(`unknown service id: ${id}`);
	}
	let ids: ServiceId[] = args.only.length
		? (args.only as ServiceId[])
		: [
				...DEFAULT_IDS,
				...args.withOptional.filter((id): id is ServiceId =>
					OPTIONAL_IDS.includes(id as ServiceId),
				),
			];
	const skip = new Set(args.skip);
	ids = ids.filter((id) => !skip.has(id));
	return [...new Set(ids)];
}

export function envFileValue(path: string, key: string): string | undefined {
	if (!existsSync(path)) return undefined;
	for (const raw of readFileSync(path, "utf8").split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq < 0) continue;
		if (line.slice(0, eq) !== key) continue;
		return line.slice(eq + 1).replace(/^["']|["']$/g, "");
	}
	return undefined;
}

export function upsertEnvFile(path: string, updates: Record<string, string>): void {
	let text = existsSync(path) ? readFileSync(path, "utf8") : "";
	if (text && !text.endsWith("\n")) text += "\n";
	for (const [key, value] of Object.entries(updates)) {
		const line = `${key}=${value}`;
		const re = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
		if (re.test(text)) text = text.replace(re, line);
		else text += `${line}\n`;
	}
	writeFileSync(path, text);
}

export function ensureCopied(example: string, dest: string): boolean {
	if (existsSync(dest) || !existsSync(example)) return false;
	copyFileSync(example, dest);
	return true;
}

export function hasUsableDatabaseUrl(value: string | undefined): boolean {
	if (!value) return false;
	if (/user:pass@host/i.test(value)) return false;
	if (value.includes("change-me")) return false;
	return /^(postgres(ql)?:\/\/)\S+/.test(value);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRealNode(bin: string): boolean {
	if (!bin) return false;
	let real = bin;
	try {
		real = realpathSync(bin);
	} catch {
		return false;
	}
	if (real.includes("bun")) return false;
	const result = spawnSync(bin, ["-p", "process.versions.node"], {
		encoding: "utf8",
	});
	return result.status === 0 && Boolean(result.stdout?.trim());
}

export function resolveNode(env = process.env): string | undefined {
	const candidates = [env.NODE, Bun.which("node")].filter(Boolean) as string[];
	for (const bin of candidates) {
		if (isRealNode(bin)) return bin;
	}
	return undefined;
}

export type PreparedService = {
	id: ServiceId;
	label: string;
	port: number;
	cwd: string;
	cmd: string[];
	env: Record<string, string>;
	readyMs: number;
};

export function prepareServices(
	ids: ServiceId[],
	opts: { root?: string; node?: string; ports?: typeof PORTS } = {},
): { services: PreparedService[]; notes: string[] } {
	const root = opts.root ?? ROOT;
	const ports = opts.ports ?? PORTS;
	const urls = urlMap(ports);
	const baseEnv = sharedEnv(ports);
	const notes: string[] = [];
	const node = opts.node ?? resolveNode();
	if (!node) {
		throw new Error(
			"Need real Node.js (PATH node is bun). Run: nix develop   (or: direnv allow)",
		);
	}

	const selected = new Set(ids);
	const copy = (from: string, to: string) => {
		if (ensureCopied(join(root, from), join(root, to))) {
			notes.push(`copied ${from} → ${to}`);
		}
	};

	if (selected.has("api")) {
		copy("api/.dev.vars.example", "api/.dev.vars");
		upsertEnvFile(join(root, "api/.dev.vars"), {
			ALLOW_DEV_ORIGINS: "true",
			MEDUSA_BACKEND_URL: urls.medusa,
			SITE_URL: urls.site,
		});
	}
	if (selected.has("auth") || selected.has("auth-admin")) {
		copy("auth/.dev.vars.example", "auth/.dev.vars");
		upsertEnvFile(join(root, "auth/.dev.vars"), {
			ALLOW_DEV_ORIGINS: "true",
			ALLOW_DEV_ACCESS: "true",
		});
	}
	if (selected.has("shop")) {
		copy("store/.dev.vars.example", "store/.dev.vars");
		upsertEnvFile(join(root, "store/.dev.vars"), {
			PUBLIC_API_URL: urls.api,
			PUBLIC_MEDUSA_BACKEND_URL: urls.medusa,
			PUBLIC_SITE_URL: urls.shop,
			PUBLIC_MARKETING_URL: urls.site,
		});
	}
	if (selected.has("shop-backend")) {
		copy("store/backend/.env.example", "store/backend/.env");
		if (existsSync(join(root, "store/backend/.env"))) {
			upsertEnvFile(join(root, "store/backend/.env"), {
				STORE_CORS: baseEnv.STORE_CORS,
				ADMIN_CORS: baseEnv.ADMIN_CORS,
				AUTH_CORS: baseEnv.AUTH_CORS,
				MEDUSA_BACKEND_URL: urls.medusa,
				SHOP_API_URL: urls.api,
				JUMPCLOUD_REDIRECT_URI: baseEnv.JUMPCLOUD_REDIRECT_URI,
				JUMPCLOUD_ALLOWED_CALLBACK_URLS: baseEnv.JUMPCLOUD_ALLOWED_CALLBACK_URLS,
				CLERK_AUTHORIZED_PARTIES: baseEnv.CLERK_AUTHORIZED_PARTIES,
			});
		}
	}
	if (selected.has("analytics")) {
		copy("analytics/.dev.vars.example", "analytics/.dev.vars");
		upsertEnvFile(join(root, "analytics/.dev.vars"), {
			ALLOW_DEV_ACCESS: "true",
			SINK_ORIGIN: urls.api,
			JUMPCLOUD_REDIRECT_URI: `${urls.analytics}/oidc/callback`,
		});
	}

	const wrangler = (dir: string) => join(root, dir, "node_modules/wrangler/bin/wrangler.js");
	const astro = (dir: string) => join(root, dir, "node_modules/astro/bin/astro.mjs");

	const services: PreparedService[] = [];
	for (const id of ids) {
		if (id === "shop-backend") {
			const db =
				process.env.DATABASE_URL ||
				envFileValue(join(root, "store/backend/.env"), "DATABASE_URL");
			if (!hasUsableDatabaseUrl(db)) {
				notes.push(
					"skip shop-backend: set DATABASE_URL in store/backend/.env (postgres)",
				);
				continue;
			}
		}
		if (id === "links" && !existsSync(join(root, "links/package.json"))) {
			notes.push("skip links: package missing");
			continue;
		}

		const env = { ...process.env, ...baseEnv } as Record<string, string>;
		const common = { env, readyMs: 60_000 };
		switch (id) {
			case "site":
				services.push({
					id,
					label: "site",
					port: ports.site,
					cwd: root,
					cmd: [node, astro("."), "dev", "--port", String(ports.site), "--host", "127.0.0.1"],
					...common,
					readyMs: 180_000,
				});
				break;
			case "shop":
				services.push({
					id,
					label: "shop",
					port: ports.shop,
					cwd: join(root, "store"),
					cmd: [
						node,
						astro("store"),
						"dev",
						"--port",
						String(ports.shop),
						"--host",
						"127.0.0.1",
					],
					...common,
					readyMs: 180_000,
				});
				break;
			case "api":
				services.push({
					id,
					label: "api",
					port: ports.api,
					cwd: join(root, "api"),
					cmd: [
						node,
						wrangler("api"),
						"dev",
						"--config",
						"wrangler.jsonc",
						"--port",
						String(ports.api),
						"--ip",
						"127.0.0.1",
						"--inspector-port",
						"9230",
						"--var",
						`SITE_URL:${urls.site}`,
						"--var",
						`MEDUSA_BACKEND_URL:${urls.medusa}`,
					],
					...common,
				});
				break;
			case "auth":
				services.push({
					id,
					label: "auth",
					port: ports.auth,
					cwd: join(root, "auth"),
					cmd: [
						node,
						wrangler("auth"),
						"dev",
						"--config",
						"wrangler.jsonc",
						"--port",
						String(ports.auth),
						"--ip",
						"127.0.0.1",
						"--inspector-port",
						"9231",
					],
					...common,
				});
				break;
			case "auth-admin":
				services.push({
					id,
					label: "auth-admin",
					port: ports["auth-admin"],
					cwd: join(root, "auth"),
					cmd: [
						node,
						wrangler("auth"),
						"dev",
						"--config",
						"admin/wrangler.jsonc",
						"--port",
						String(ports["auth-admin"]),
						"--ip",
						"127.0.0.1",
						"--inspector-port",
						"9232",
					],
					...common,
				});
				break;
			case "shop-backend":
				services.push({
					id,
					label: "shop-backend",
					port: ports["shop-backend"],
					cwd: join(root, "store/backend"),
					cmd: [node, join(root, "store/backend/node_modules/@medusajs/cli/cli.js"), "develop"],
					...common,
					readyMs: 180_000,
				});
				break;
			case "stats":
				services.push({
					id,
					label: "stats",
					port: ports.stats,
					cwd: join(root, "stats"),
					cmd: [
						node,
						wrangler("stats"),
						"dev",
						"--config",
						"app/wrangler.jsonc",
						"--port",
						String(ports.stats),
						"--ip",
						"127.0.0.1",
						"--inspector-port",
						"9233",
					],
					...common,
				});
				break;
			case "analytics":
				services.push({
					id,
					label: "analytics",
					port: ports.analytics,
					cwd: join(root, "analytics"),
					cmd: [
						node,
						wrangler("analytics"),
						"dev",
						"--config",
						"wrangler.jsonc",
						"--port",
						String(ports.analytics),
						"--ip",
						"127.0.0.1",
						"--inspector-port",
						"9234",
						"--var",
						`SINK_ORIGIN:${urls.api}`,
					],
					...common,
				});
				break;
			case "links":
				services.push({
					id,
					label: "links",
					port: ports.links,
					cwd: join(root, "links"),
					cmd: ["pnpm", "dev"],
					...common,
				});
				break;
		}
	}
	return { services, notes };
}

export function formatList(ids: ServiceId[], ports = PORTS): string {
	return ids.map((id) => `${id.padEnd(14)} ${localUrl(ports[id])}`).join("\n");
}

export const HELP = `Usage: bun run dev:all [--only id,id] [--skip id] [--with links] [--list] [--dry-run]

Starts the first-party local stack on fixed ports and points each
process at the others via env + .dev.vars / .env URL keys.

  site           http://localhost:4321
  api            http://localhost:8787
  auth           http://localhost:8788
  auth-admin     http://localhost:8789
  shop           http://localhost:4322
  shop-backend   http://localhost:9000   (skipped unless DATABASE_URL is set)
  stats          http://localhost:8790
  analytics      http://localhost:8791
  links          http://localhost:7465   (--with links)

stats-tail is not started (no useful local HTTP).
`;

export function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
	return new Promise((resolveOpen) => {
		const sock = createConnection({ host, port });
		const done = (ok: boolean) => {
			sock.removeAllListeners();
			sock.destroy();
			resolveOpen(ok);
		};
		sock.setTimeout(400, () => done(false));
		sock.once("connect", () => done(true));
		sock.once("error", () => done(false));
	});
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await portOpen(port)) return true;
		await Bun.sleep(250);
	}
	return false;
}

async function pipePrefixed(
	stream: ReadableStream<Uint8Array> | null,
	label: string,
	color: string,
) {
	if (!stream) return;
	const reader = stream.getReader();
	const dec = new TextDecoder();
	let buf = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += dec.decode(value, { stream: true });
		let nl: number;
		while ((nl = buf.indexOf("\n")) >= 0) {
			const line = buf.slice(0, nl).replace(/\r$/, "");
			buf = buf.slice(nl + 1);
			console.log(`${color}${label.padEnd(12)}${RESET} ${line}`);
		}
	}
	if (buf.trim()) console.log(`${color}${label.padEnd(12)}${RESET} ${buf}`);
}

async function main(argv = Bun.argv.slice(2)) {
	let args: ParsedArgs;
	try {
		args = parseArgs(argv);
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exitCode = 2;
		return;
	}
	if (args.help) {
		process.stdout.write(HELP);
		return;
	}

	const ids = selectedIds(args);
	if (args.list) {
		console.log(formatList(ids));
		return;
	}

	const { services, notes } = prepareServices(ids);
	for (const note of notes) console.log(`· ${note}`);
	if (args.dryRun) {
		for (const svc of services) {
			console.log(`${svc.id}\t:${svc.port}\t${svc.cmd.join(" ")}`);
		}
		return;
	}

	if (services.length === 0) {
		console.error("nothing to start");
		process.exitCode = 1;
		return;
	}

	type Child = { svc: PreparedService; proc?: ReturnType<typeof Bun.spawn>; reused: boolean };
	const children: Child[] = [];

	for (const svc of services) {
		if (await portOpen(svc.port)) {
			console.log(`· ${svc.id} already on :${svc.port} — reusing`);
			children.push({ svc, reused: true });
			continue;
		}
		if (!existsSync(svc.cmd[1] ?? "") && svc.cmd[0] !== "pnpm") {
			const tool = svc.cmd[1] ?? svc.cmd[0];
			console.error(`${svc.id}: missing ${tool} — install that package first`);
			process.exitCode = 1;
			return;
		}
		const proc = Bun.spawn(svc.cmd, {
			cwd: svc.cwd,
			env: svc.env,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		void pipePrefixed(proc.stdout, svc.label, COLORS[svc.id]);
		void pipePrefixed(proc.stderr, svc.label, COLORS[svc.id]);
		children.push({ svc, proc, reused: false });
	}

	const started = children.filter((c) => c.proc);
	const stop = () => {
		for (const child of started) child.proc?.kill("SIGTERM");
	};
	process.on("SIGINT", () => {
		stop();
		process.exit(0);
	});
	process.on("SIGTERM", () => {
		stop();
		process.exit(0);
	});

	const results = await Promise.all(
		children.map(async (child) => {
			if (child.reused) return { id: child.svc.id, ok: true };
			const ok = await waitForPort(child.svc.port, child.svc.readyMs);
			if (!ok) {
				console.error(`${child.svc.id} did not listen on :${child.svc.port}`);
			}
			return { id: child.svc.id, ok };
		}),
	);

	console.log("");
	console.log("local stack");
	for (const child of children) {
		const ready = results.find((r) => r.id === child.svc.id)?.ok;
		const mark = ready ? "ok" : "WAIT";
		console.log(
			`  ${mark.padEnd(4)} ${child.svc.id.padEnd(14)} ${localUrl(child.svc.port)}`,
		);
	}
	console.log("");
	console.log("ctrl-c stops the processes this script started");

	if (results.some((r) => !r.ok)) process.exitCode = 1;

	await Promise.all(started.map((c) => c.proc!.exited));
}

const invoked = resolve(Bun.main) === resolve(import.meta.path);
if (invoked) {
	await main();
}
