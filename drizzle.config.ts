import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

const connectionUrl = new URL(
  process.env.DATABASE_URL?.trim() || "mysql://localhost/school_management",
);
const sslDisabled = process.env.DATABASE_SSL === "false";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: connectionUrl.hostname,
    port: Number(connectionUrl.port || 3306),
    user: decodeURIComponent(connectionUrl.username),
    password: decodeURIComponent(connectionUrl.password),
    database: decodeURIComponent(connectionUrl.pathname.slice(1)),
    ...(sslDisabled ? {} : { ssl: { rejectUnauthorized: true } }),
  },
  casing: "camelCase",
});
