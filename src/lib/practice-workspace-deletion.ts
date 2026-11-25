import { sql } from "drizzle-orm";
import { getTableConfig, type AnyMySqlTable } from "drizzle-orm/mysql-core";
import type { db } from "../db";
import * as schema from "../db/schema";

type PracticeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TableConfig = ReturnType<typeof getTableConfig>;
type Column = TableConfig["columns"][number];
type KeyValue = number | string;

type TableNode = {
  table: AnyMySqlTable;
  config: TableConfig;
  primaryKey: Column | null;
  columnsByName: Map<string, Column>;
};

type ForeignKeyEdge = {
  child: TableNode;
  childColumn: Column;
  parentColumn: Column;
};

const tableNodes = Object.values(schema).map((table) => {
  const typedTable = table as AnyMySqlTable;
  const config = getTableConfig(typedTable);
  return {
    table: typedTable,
    config,
    primaryKey: config.columns.find((column) => column.primary) ?? null,
    columnsByName: new Map(config.columns.map((column) => [column.name, column])),
  } satisfies TableNode;
});

const nodesByName = new Map(tableNodes.map((node) => [node.config.name, node]));
const childEdgesByParent = new Map<string, ForeignKeyEdge[]>();

for (const child of tableNodes) {
  for (const foreignKey of child.config.foreignKeys) {
    const reference = foreignKey.reference();
    const parent = nodesByName.get(getTableConfig(reference.foreignTable).name);
    if (!parent) throw new Error(`Unknown table referenced by ${foreignKey.getName()}.`);
    if (reference.columns.length !== 1 || reference.foreignColumns.length !== 1) {
      throw new Error(`Practice workspace deletion does not support composite foreign key ${foreignKey.getName()}.`);
    }

    const childColumn = child.columnsByName.get(reference.columns[0].name);
    const parentColumn = parent.columnsByName.get(reference.foreignColumns[0].name);
    if (!childColumn || !parentColumn) {
      throw new Error(`Could not resolve columns for foreign key ${foreignKey.getName()}.`);
    }

    if (child.config.name === parent.config.name) continue;
    const edges = childEdgesByParent.get(parent.config.name) ?? [];
    edges.push({ child, childColumn, parentColumn });
    childEdgesByParent.set(parent.config.name, edges);
  }
}

function getParentFirstOrder() {
  const incomingEdges = new Map(tableNodes.map((node) => [node.config.name, 0]));
  for (const edges of childEdgesByParent.values()) {
    for (const edge of edges) {
      incomingEdges.set(edge.child.config.name, (incomingEdges.get(edge.child.config.name) ?? 0) + 1);
    }
  }

  const ready = tableNodes
    .filter((node) => incomingEdges.get(node.config.name) === 0)
    .map((node) => node.config.name);
  const order: TableNode[] = [];

  while (ready.length) {
    const name = ready.shift()!;
    const node = nodesByName.get(name);
    if (!node) throw new Error(`Unknown table ${name} in the practice deletion graph.`);
    order.push(node);

    for (const edge of childEdgesByParent.get(name) ?? []) {
      const childName = edge.child.config.name;
      const remaining = (incomingEdges.get(childName) ?? 0) - 1;
      incomingEdges.set(childName, remaining);
      if (remaining === 0) ready.push(childName);
    }
  }

  if (order.length !== tableNodes.length) {
    throw new Error("The database foreign-key graph contains a cycle that practice deletion cannot safely process.");
  }
  for (const node of order) {
    if (!node.primaryKey && (childEdgesByParent.get(node.config.name)?.length ?? 0) > 0) {
      throw new Error(`Table ${node.config.name} is referenced but has no primary key.`);
    }
  }
  return order;
}

const parentFirstOrder = getParentFirstOrder();

function chunks<T>(values: T[], size = 500) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function inValues(column: Column, values: readonly KeyValue[]) {
  return sql`${column} in (${sql.join(values.map((value) => sql`${value}`), sql`, `)})`;
}

async function selectValues(
  tx: PracticeTransaction,
  table: AnyMySqlTable,
  selectedColumn: Column,
  filteredColumn: Column,
  values: KeyValue[],
) {
  const selected = new Set<KeyValue>();
  for (const batch of chunks([...new Set(values)])) {
    if (!batch.length) continue;
    const rows = await tx.select({ value: selectedColumn })
      .from(table)
      .where(inValues(filteredColumn, batch));
    for (const row of rows) {
      if (typeof row.value === "number" || typeof row.value === "string") selected.add(row.value);
    }
  }
  return [...selected];
}

export async function deletePracticeWorkspaceRows(
  tx: PracticeTransaction,
  parentSchoolId: number,
  requestedPracticeSchoolIds: number[],
): Promise<number[]> {
  if (!requestedPracticeSchoolIds.length) return [];

  const rootRows = await tx.select({
    id: schema.schools.id,
    isPracticeWorkspace: schema.schools.isPracticeWorkspace,
    practiceParentSchoolId: schema.schools.practiceParentSchoolId,
  }).from(schema.schools)
    .where(inValues(schema.schools.id, requestedPracticeSchoolIds))
    .for("update");

  for (const row of rootRows) {
    if (!row.isPracticeWorkspace || row.practiceParentSchoolId !== parentSchoolId) {
      throw new Error("Refusing to delete a workspace that is not a child practice workspace.");
    }
  }
  if (!rootRows.length) return [];

  const ownedPrimaryKeys = new Map<string, Set<KeyValue>>();
  ownedPrimaryKeys.set(
    getTableConfig(schema.schools).name,
    new Set(rootRows.map((row) => row.id)),
  );
  const keylessDeleteValues = new Map<string, Map<string, Set<KeyValue>>>();

  for (const parent of parentFirstOrder) {
    const parentKeys = [...(ownedPrimaryKeys.get(parent.config.name) ?? [])];
    if (!parentKeys.length) continue;
    if (!parent.primaryKey) {
      throw new Error(`Table ${parent.config.name} cannot be traversed without a primary key.`);
    }

    for (const edge of childEdgesByParent.get(parent.config.name) ?? []) {
      const parentValues = await selectValues(
        tx,
        parent.table,
        edge.parentColumn,
        parent.primaryKey,
        parentKeys,
      );
      if (!parentValues.length) continue;

      if (!edge.child.primaryKey) {
        const byColumn = keylessDeleteValues.get(edge.child.config.name) ?? new Map<string, Set<KeyValue>>();
        const values = byColumn.get(edge.childColumn.name) ?? new Set<KeyValue>();
        parentValues.forEach((value) => values.add(value));
        byColumn.set(edge.childColumn.name, values);
        keylessDeleteValues.set(edge.child.config.name, byColumn);
        continue;
      }

      const childKeys = await selectValues(
        tx,
        edge.child.table,
        edge.child.primaryKey,
        edge.childColumn,
        parentValues,
      );
      const ownedKeys = ownedPrimaryKeys.get(edge.child.config.name) ?? new Set<KeyValue>();
      childKeys.forEach((value) => ownedKeys.add(value));
      ownedPrimaryKeys.set(edge.child.config.name, ownedKeys);
    }
  }

  for (const node of [...parentFirstOrder].reverse()) {
    const ids = [...(ownedPrimaryKeys.get(node.config.name) ?? [])];
    if (node.primaryKey && ids.length) {
      for (const batch of chunks(ids)) {
        await tx.delete(node.table).where(inValues(node.primaryKey, batch));
      }
      continue;
    }

    const deleteValuesByColumn = keylessDeleteValues.get(node.config.name);
    if (!deleteValuesByColumn) continue;
    for (const [columnName, values] of deleteValuesByColumn) {
      const column = node.columnsByName.get(columnName);
      if (!column) throw new Error(`Could not resolve deletion column ${columnName} on ${node.config.name}.`);
      for (const batch of chunks([...values])) {
        await tx.delete(node.table).where(inValues(column, batch));
      }
    }
  }
  return rootRows.map((row) => row.id);
}

export function getPracticeWorkspaceDeletionOrder() {
  return parentFirstOrder.map((node) => node.config.name);
}
