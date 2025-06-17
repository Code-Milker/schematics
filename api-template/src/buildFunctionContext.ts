import { z } from "zod";

// Validator for the input to buildFunctionContext
export const buildFunctionContextReq = z.object({
  inputSchema: z.any(), // ZodType<I>
  responseSchema: z.any(), // ZodType<R>
  errorSchema: z.any(), // ZodType<E>
  execution: z
    .function()
    .args(
      z.object({
        input: z.any(),
        error: z.function().args(z.string()).returns(z.any()),
      }),
    )
    .returns(
      z.promise(
        z.object({
          res: z.any().nullable(),
          err: z.any().nullable(),
        }),
      ),
    ),
});

// Validator for the output of the function returned by buildFunctionContext
export const buildFunctionContextRes = z.object({
  res: z.any().nullable(),
  err: z.any().nullable(),
});

// Type for the input to buildFunctionContext
export type BuildFunctionContextReq<I, R, E> = {
  inputSchema: z.ZodType<I>;
  responseSchema: z.ZodType<R>;
  errorSchema: z.ZodType<E>;
  execution: ({
    input,
    error,
  }: {
    input: I;
    error: (message: string) => E;
  }) => Promise<{ res: R | null; err: E | null }>;
};

// Type for the output of buildFunctionContext
export type BuildFunctionContextResult<I, R, E> = {
  input: {
    validator: z.ZodType<I>;
  };
  response: {
    validator: z.ZodType<R>;
  };
  execute: (input: any) => Promise<{ res: R | null; err: E | null }>;
};

export function buildFunctionContext<I, R, E>(
  params: BuildFunctionContextReq<I, R, E>,
): BuildFunctionContextResult<I, R, E> {
  const { inputSchema, responseSchema, errorSchema, execution } = params;

  const execute = async function (
    input: any,
  ): Promise<{ res: R | null; err: E | null }> {
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) {
      const err = { message: "Invalid input" } as E;
      return { res: null, err };
    }

    const errorCreator = (message: string): E => ({ message }) as E;

    try {
      const result = await execution({
        input: parsedInput.data,
        error: errorCreator,
      });
      if (result.err !== null) {
        const parsedErr = errorSchema.safeParse(result.err);
        if (!parsedErr.success) {
          throw new Error("Execution returned an invalid error object");
        }
        return { res: null, err: parsedErr.data };
      } else {
        const parsedRes = responseSchema.safeParse(result.res);
        if (!parsedRes.success) {
          throw new Error("Execution returned an invalid response object");
        }
        return { res: parsedRes.data, err: null };
      }
    } catch (e) {
      const err = errorCreator(
        e instanceof Error ? e.message : "Unknown error",
      );
      return { res: null, err };
    }
  };

  return {
    input: {
      validator: inputSchema,
    },
    response: {
      validator: responseSchema,
    },
    execute,
  };
}

// Example usage with inline schemas
const foo = buildFunctionContext({
  inputSchema: z.object({ id: z.number() }),
  responseSchema: z.object({
    id: z.number(),
    name: z.string(),
  }),
  errorSchema: z.object({
    message: z.string(),
  }),
  execution: async ({ input, error }) => {
    if (input.id < 0) {
      return { res: null, err: error("Invalid ID") };
    }
    return { res: { id: input.id, name: "Test" }, err: null };
  },
});

// Test function to run and log results
async function test() {
  // Test valid input
  const result = await foo.execute({ id: 1 });
  console.log("Result (valid input):", result); // Expected: { res: { id: 1, name: "Test" }, err: null }

  // Test invalid input
  const invalidResult = await foo.execute({ id: -1 });
  console.log("Result (invalid input):", invalidResult); // Expected: { res: null, err: { message: "Invalid ID" } }

  // Test malformed input
  const malformedResult = await foo.execute({ id: "not-a-number" });
  console.log("Result (malformed input):", malformedResult); // Expected: { res: null, err: { message: "Invalid input" } }

  // Access validators
  console.log("Response validator:", foo.response.validator); // Zod schema for { id: number, name: string }
}

// Run the test
test().catch((err) => console.error("Test error:", err));
