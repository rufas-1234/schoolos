import { spawnSync } from "node:child_process";
import { join } from "node:path";

function run(cli, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL_ENV === "production") {
  run(join("node_modules", "drizzle-kit", "bin.cjs"), ["migrate"]);
}

run(join("node_modules", "next", "dist", "bin", "next"), ["build"]);
