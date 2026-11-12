import { getTableName } from "drizzle-orm";
import { getTableConfig, type PgColumn } from "drizzle-orm/pg-core";

import {
  scimConnectionBinding,
  scimGroup,
  scimGroupMember,
  scimIdentityTombstone,
  scimManagedConnection,
  scimManagedConnectionEvent,
  scimManagedCredential,
  scimProjectionGrant,
  scimSubject,
  scimUser,
  ssoProvider
} from "../src/auth-plugin-tables";

const tables = [
  ssoProvider,
  scimManagedConnection,
  scimManagedCredential,
  scimManagedConnectionEvent,
  scimConnectionBinding,
  scimIdentityTombstone,
  scimSubject,
  scimUser,
  scimProjectionGrant,
  scimGroup,
  scimGroupMember
];

function sqlType(column: PgColumn): string {
  const type = column.columnType;
  if (type === "PgText") return "text";
  if (type === "PgBoolean") return "boolean";
  if (type === "PgInteger") return "integer";
  if (type === "PgTimestamp") return "timestamp";
  throw new Error(`unsupported ${type} on ${column.name}`);
}

const statements: string[] = [];
for (const table of tables) {
  const config = getTableConfig(table);
  const columns = config.columns.map((column) => {
    const parts = [`"${column.name}" ${sqlType(column)}`];
    if (column.primary) parts.push("PRIMARY KEY");
    if (column.notNull && !column.primary) parts.push("NOT NULL");
    if (column.isUnique) parts.push("UNIQUE");
    if (column.hasDefault && column.default !== undefined) {
      const value = column.default;
      if (typeof value === "boolean") parts.push(`DEFAULT ${value}`);
      else if (typeof value === "number") parts.push(`DEFAULT ${value}`);
      else if (typeof value === "string") parts.push(`DEFAULT '${value}'`);
    }
    return parts.join(" ");
  });
  const fks = config.foreignKeys.flatMap((fk) => {
    const ref = fk.reference();
    return ref.columns.map((column, index) => {
      const target = ref.foreignColumns[index];
      if (!target) return "";
      return `FOREIGN KEY ("${column.name}") REFERENCES "${getTableName(target.table)}" ("${target.name}") ON DELETE cascade`;
    });
  });
  statements.push(
    `CREATE TABLE "${config.name}" (\n  ${[...columns, ...fks.filter(Boolean)].join(",\n  ")}\n);`
  );
  for (const idx of config.indexes) {
    const cols = idx.config.columns.map((column) => `"${(column as PgColumn).name}"`).join(", ");
    const unique = idx.config.unique ? "UNIQUE " : "";
    statements.push(`CREATE ${unique}INDEX "${idx.config.name}" ON "${config.name}" (${cols});`);
  }
}
console.log(statements.join("\n--> statement-breakpoint\n"));
