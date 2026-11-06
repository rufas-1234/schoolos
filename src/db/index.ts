import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl && process.env.NODE_ENV === "production" && !isBuild) {
  throw new Error("DATABASE_URL must be configured before starting the production server.");
}

const connectionUrl = databaseUrl ?? "mysql://localhost/school_management";
const parsedUrl = new URL(connectionUrl);
const sslDisabled = process.env.DATABASE_SSL === "false";

export const pool = mysql.createPool({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port || 3306),
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: decodeURIComponent(parsedUrl.pathname.slice(1)),
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  ...(sslDisabled ? {} : { ssl: { rejectUnauthorized: true } }),
});

export const db = drizzle(pool, { schema, mode: "default" });
