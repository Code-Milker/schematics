import { z } from "zod";

// Define schemas
const InputSchema = z.object({
  dbName: z.string().min(1, "Database name is required"),
  apiKey: z.string().min(1, "Render API key is required"),
  ownerId: z.string().min(1, "Owner ID is required"),
  region: z.string().optional().default("oregon"), // oregon, ohio, singapore, frankfurt
  plan: z.string().optional().default("free"), // starter, standard, pro, pro_plus
  version: z.string().optional().default("16"), // PostgreSQL version
});

const ResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  connectionInfo: z.object({
    externalConnectionString: z.string(),
    internalConnectionString: z.string(),
    psqlCommand: z.string(),
  }),
});

const ErrorSchema = z.object({
  message: z.string(),
});

// Type definitions
type Input = z.infer<typeof InputSchema>;
type Response = z.infer<typeof ResponseSchema>;
type Error = z.infer<typeof ErrorSchema>;

// Parse CLI arguments
function parseArgs(): { res: Partial<Input> | null; err: Error | null } {
  const args = process.argv.slice(2);
  const parsed: Partial<Input> = {};

  if (args.length % 2 !== 0) {
    return {
      res: null,
      err: { message: "Arguments must be provided as flag-value pairs" },
    };
  }

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    if (!flag || !value) {
      return {
        res: null,
        err: { message: `Missing flag or value at index ${i}` },
      };
    }
    switch (flag) {
      case "--name":
        parsed.dbName = value;
        break;
      case "--key":
        parsed.apiKey = value;
        break;
      case "--owner":
        parsed.ownerId = value;
        break;
      case "--region":
        parsed.region = value;
        break;
      case "--plan":
        parsed.plan = value;
        break;
      case "--version":
        parsed.version = value;
        break;
      default:
        return { res: null, err: { message: `Unknown flag ${flag}` } };
    }
  }

  // Fallback to env for apiKey and ownerId
  if (!parsed.apiKey && process.env.RENDER_API_KEY) {
    parsed.apiKey = process.env.RENDER_API_KEY;
  }
  if (!parsed.ownerId && process.env.RENDER_OWNER_ID) {
    parsed.ownerId = process.env.RENDER_OWNER_ID;
  }

  return { res: parsed, err: null };
}

// Function to create Render PostgreSQL database
const createRenderPostgres = async (
  input: Input,
): Promise<{ res: Response | null; err: Error | null }> => {
  const parsedInput = InputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      res: null,
      err: { message: parsedInput.error.message || "Invalid input" },
    };
  }

  const { dbName, apiKey, ownerId, region, plan, version } = parsedInput.data;

  // Debug logging
  console.log("Making request with:");
  console.log("- Database name:", dbName);
  console.log("- Owner ID:", ownerId);
  console.log("- Region:", region);
  console.log("- Plan:", plan);
  console.log("- PostgreSQL version:", version);
  console.log("- API Key starts with:", apiKey.substring(0, 8) + "...");

  try {
    const requestBody = {
      name: dbName,
      ownerId: ownerId,
      region: region,
      plan: plan,
      version: version,
    };

    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch("https://api.render.com/v1/postgres", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Response status:", response.status);

    // Get response text first to debug
    const responseText = await response.text();
    console.log("Raw response:", responseText);

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      // Try to parse error response
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorData.error || errorMessage;
        console.log("Parsed error:", errorData);
      } catch (e) {
        console.log("Could not parse error response as JSON");
      }

      return {
        res: null,
        err: { message: errorMessage },
      };
    }

    // Try to parse successful response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return {
        res: null,
        err: { message: "Response is not valid JSON" },
      };
    }

    console.log("Parsed response data:", JSON.stringify(data, null, 2));

    // Extract database information from response
    let dbData;
    if (data.postgres) {
      dbData = data.postgres;
    } else if (data.id) {
      dbData = data;
    } else {
      return {
        res: null,
        err: { message: "Unexpected response structure from Render API" },
      };
    }

    // Extract connection information
    const connectionInfo = {
      externalConnectionString: dbData.externalConnectionString || "",
      internalConnectionString: dbData.internalConnectionString || "",
      psqlCommand: dbData.psqlCommand || "",
    };

    const parsedResponse = ResponseSchema.safeParse({
      id: dbData.id,
      name: dbData.name,
      connectionInfo: connectionInfo,
    });

    if (!parsedResponse.success) {
      console.log("Response validation error:", parsedResponse.error);
      return {
        res: null,
        err: { message: "Invalid response structure from Render API" },
      };
    }

    return { res: parsedResponse.data, err: null };
  } catch (e) {
    console.log("Fetch error:", e);
    return {
      res: null,
      err: { message: e instanceof Error ? e.message : "Unknown error" },
    };
  }
};

// Main function to run the script
async function main() {
  const { res: args, err: parseError } = parseArgs();
  if (parseError) {
    console.error("Error:", parseError.message);
    console.log(`
Usage: bun run <script_name>.ts --name <dbName> --owner <ownerId> [--key <apiKey>] [options]

Required:
  --name     Database name
  --owner    Owner ID (e.g., tea-...)
  
Optional:
  --key      API key (or set RENDER_API_KEY env var)
  --region   Region (oregon, ohio, singapore, frankfurt) [default: oregon]
  --plan     Plan (starter, standard, pro, pro_plus) [default: starter]
  --version  PostgreSQL version [default: 16]

Examples:
  bun run postgres.ts --name mydb --owner tea-123 --key rnd_abc123
  bun run postgres.ts --name mydb --owner tea-123 --region ohio --plan standard
    `);
    process.exit(1);
  }

  const input: Input = {
    dbName: args?.dbName || "",
    apiKey: args?.apiKey || "",
    ownerId: args?.ownerId || "",
    region: args?.region,
    plan: args?.plan,
    version: args?.version,
  };

  const result = await createRenderPostgres(input);

  if (result.err) {
    console.error("Error creating PostgreSQL database:", result.err.message);
    process.exit(1);
  }

  console.log("\n✅ PostgreSQL database created successfully!");
  console.log("📊 Database Details:");
  console.log("- ID:", result.res?.id);
  console.log("- Name:", result.res?.name);
  console.log("\n🔗 Connection Information:");
  console.log(
    "- External Connection String:",
    result.res?.connectionInfo.externalConnectionString,
  );
  console.log(
    "- Internal Connection String:",
    result.res?.connectionInfo.internalConnectionString,
  );
  console.log("- psql Command:", result.res?.connectionInfo.psqlCommand);

  console.log(
    "\n💡 Tip: Save these connection details securely - you'll need them to connect your applications!",
  );
}

// Run the script
main().catch((err) => console.error("Script error:", err));
