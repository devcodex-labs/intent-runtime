import { expect, it } from "vitest";
import { SchemaWorkerPool } from "../src/schema/worker-pool.js";
const schema = { type: "object", properties: { value: { type: "string" } } };
it("bounds queued work, aborts running validation and reuses freed capacity", async () => {
  const pool = new SchemaWorkerPool(2, 2000, 1);
  try {
    const controller = new AbortController();
    const pending = pool.validate(schema, schema, { value: "ok" }, controller.signal);
    const failed = expect(pending).rejects.toBe("cancelled");
    await expect(pool.validate(schema, schema, { value: "next" })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    controller.abort("cancelled");
    await failed;
    expect(await pool.validate(schema, schema, { value: "next" })).toEqual({ valid: true, descriptionPaths: [] });
  } finally { pool.dispose(); }
});
it("disposes running and queued validations and rejects subsequent calls", async () => {
  const pool = new SchemaWorkerPool(2, 2000, 4);
  const tasks = Array.from({ length: 4 }, () => pool.validate(schema, schema, { value: "ok" }));
  const failed = tasks.map(task => expect(task).rejects.toMatchObject({ code: "INSTANCE_DISPOSED" }));
  pool.dispose();
  await Promise.all(failed);
  await expect(pool.validate(schema, schema, {})).rejects.toMatchObject({ code: "INSTANCE_DISPOSED" });
});
