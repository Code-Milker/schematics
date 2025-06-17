import { Client } from "pg";
import { z } from "zod";
import { buildFunctionContext } from "./buildFunctionContext";

// Initialize PostgreSQL client
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
await client.connect();

// Ensure users table exists
await client.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
  )
`);

// Create user function using buildFunctionContext
export const createUser = buildFunctionContext({
  inputSchema: z.object({
    name: z.string().min(1, "Name is required"),
  }),
  responseSchema: z.object({
    id: z.number(),
    name: z.string(),
  }),
  errorSchema: z.object({
    message: z.string(),
  }),
  execution: async ({ input, error }) => {
    try {
      const res = await client.query(
        "INSERT INTO users (name) VALUES ($1) RETURNING *",
        [input.name],
      );
      return { res: res.rows[0], err: null };
    } catch (e) {
      return {
        res: null,
        err: error(e instanceof Error ? e.message : "Unknown error"),
      };
    }
  },
});
