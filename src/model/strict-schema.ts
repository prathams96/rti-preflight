type SchemaRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SchemaRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Checks the OpenAI strict structured-output invariant for every object node.
 * Strict objects must list every declared property in `required`, including
 * fields whose value type includes `null` to represent application-level
 * optionality.
 */
export function assertStrictSchemaObject(schema: unknown): void {
  const visited = new Set<object>();

  function visit(node: unknown): void {
    if (!isRecord(node)) return;
    if (visited.has(node)) return;
    visited.add(node);

    if (node.additionalProperties === false) {
      const properties = isRecord(node.properties)
        ? Object.keys(node.properties).sort()
        : [];
      const required = Array.isArray(node.required)
        ? node.required
            .filter((item): item is string => typeof item === "string")
            .sort()
        : [];
      if (
        properties.length !== required.length ||
        properties.some((property, index) => property !== required[index])
      ) {
        throw new Error(
          `STRICT_SCHEMA_REQUIRED_MISMATCH:${properties.join(",")}:${required.join(",")}`,
        );
      }
    }

    if (isRecord(node.properties))
      Object.values(node.properties).forEach(visit);
    visit(node.items);
    for (const key of ["anyOf", "oneOf", "allOf"]) {
      if (Array.isArray(node[key])) node[key].forEach(visit);
    }
    if (isRecord(node.$defs)) Object.values(node.$defs).forEach(visit);
  }

  visit(schema);
}
