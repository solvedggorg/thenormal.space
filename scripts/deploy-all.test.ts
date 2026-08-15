import { expect, test } from "bun:test";

const script = `${import.meta.dir}/deploy-all.sh`;

async function run(args: string[]) {
	const proc = Bun.spawn(["bash", script, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
}

test("lists first-party workers in deploy order", async () => {
	const { stdout, exitCode, stderr } = await run(["--list"]);
	expect(exitCode).toBe(0);
	expect(stderr).toBe("");
	const ids = stdout
		.trim()
		.split("\n")
		.map((line) => line.split(/\s+/)[0]);
	expect(ids).toEqual([
		"stats-tail",
		"api",
		"auth",
		"auth-admin",
		"shop-backend",
		"site",
		"shop",
		"stats",
	]);
	expect(stdout).toContain("stats/tail/wrangler.jsonc");
	expect(stdout).toContain("auth/admin/wrangler.jsonc");
});

test("--only filters to one worker", async () => {
	const { stdout, exitCode } = await run(["--list", "--only", "api,stats"]);
	expect(exitCode).toBe(0);
	const ids = stdout
		.trim()
		.split("\n")
		.map((line) => line.split(/\s+/)[0]);
	expect(ids).toEqual(["api", "stats"]);
});

test("--skip drops a worker", async () => {
	const { stdout, exitCode } = await run(["--list", "--skip", "shop-backend"]);
	expect(exitCode).toBe(0);
	const ids = stdout
		.trim()
		.split("\n")
		.map((line) => line.split(/\s+/)[0]);
	expect(ids).not.toContain("shop-backend");
	expect(ids).toContain("api");
});

test("unknown --only id fails", async () => {
	const { exitCode, stderr } = await run(["--list", "--only", "nope"]);
	expect(exitCode).not.toBe(0);
	expect(stderr).toContain("unknown worker id: nope");
});
