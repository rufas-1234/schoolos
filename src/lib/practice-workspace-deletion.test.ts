import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../db/schema";
import { getPracticeWorkspaceDeletionOrder } from "./practice-workspace-deletion";

describe("practice workspace deletion order", () => {
  it("deletes every schema table after its foreign-key parents", () => {
    const order = getPracticeWorkspaceDeletionOrder();
    const positions = new Map(order.map((name, index) => [name, index]));

    expect(order).toHaveLength(Object.values(schema).length);
    for (const table of Object.values(schema)) {
      const childName = getTableConfig(table).name;
      for (const foreignKey of getTableConfig(table).foreignKeys) {
        const parentName = getTableConfig(foreignKey.reference().foreignTable).name;
        if (parentName === childName) continue;
        expect(positions.get(parentName)).toBeLessThan(positions.get(childName)!);
      }
    }
  });

  it("includes practice-owned files and memberships in the deletion graph", () => {
    const order = getPracticeWorkspaceDeletionOrder();
    const positions = new Map(order.map((name, index) => [name, index]));

    expect(positions.get("schools")!).toBeLessThan(positions.get("uploaded_files")!);
    expect(positions.get("schools")!).toBeLessThan(positions.get("school_memberships")!);
  });
});
