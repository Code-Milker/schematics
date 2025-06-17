import { z } from "zod";

// Define schemas
const InputSchema = z.object({
  repoName: z.string().min(1, "Repository name is required"),
  apiKey: z.string().min(1, "Render API key is required"),
  serviceName: z.string().min(1, "Service name is required"),
  ownerId: z.string().min(1, "Owner ID is required"),
});

const ResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
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
      case "--repo":
        parsed.repoName = value;
        break;
      case "--service":
        parsed.serviceName = value;
        break;
      case "--key":
        parsed.apiKey = value;
        break;
      case "--owner":
        parsed.ownerId = value;
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

// Function to create Render service
const createRenderService = async (
  input: Input,
): Promise<{ res: Response | null; err: Error | null }> => {
  const parsedInput = InputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      res: null,
      err: { message: parsedInput.error.message || "Invalid input" },
    };
  }

  const { repoName, apiKey, serviceName, ownerId } = parsedInput.data;

  // Debug logging
  console.log("Making request with:");
  console.log("- Service name:", serviceName);
  console.log("- Owner ID:", ownerId);
  console.log("- Repo:", repoName);
  console.log("- API Key starts with:", apiKey.substring(0, 8) + "...");

  try {
    const requestBody = {
      type: "web_service",
      name: serviceName,
      ownerId: ownerId,
      repo: `https://github.com/${repoName}`,
      branch: "master",
      autoDeploy: "yes",
      serviceDetails: {
        runtime: "node",
        buildCommand: "bun install",
        startCommand: "bun run src/index.ts",
        instanceType: "starter_v2", // Note: API doesn't support free tier, must be paid
        env: "node",
        envSpecificDetails: {
          buildCommand: "bun install",
          startCommand: "bun run src/index.ts",
        },
      },
    };

    console.log("Request body:", JSON.stringify(requestBody, null, 2));

    const response = await fetch("https://api.render.com/v1/services", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", response.headers.toJSON());

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

    // The successful response structure might be different
    // Let's be more flexible with the response parsing
    let serviceData;
    if (data.service) {
      serviceData = data.service;
    } else if (data.id) {
      serviceData = data;
    } else {
      return {
        res: null,
        err: { message: "Unexpected response structure from Render API" },
      };
    }

    // More flexible URL extraction
    let serviceUrl = "";
    if (serviceData.serviceDetails?.url) {
      serviceUrl = serviceData.serviceDetails.url;
    } else if (serviceData.url) {
      serviceUrl = serviceData.url;
    } else {
      // Construct URL if not provided
      serviceUrl = `https://${serviceName}.onrender.com`;
    }

    const parsedResponse = ResponseSchema.safeParse({
      id: serviceData.id,
      name: serviceData.name,
      url: serviceUrl,
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
    console.log(
      "Usage: bun run <script_name>.ts --repo <user/repo> --service <serviceName> --owner <ownerId> [--key <apiKey>]",
    );
    process.exit(1);
  }

  const input: Input = {
    repoName: args?.repoName || "",
    serviceName: args?.serviceName || "",
    apiKey: args?.apiKey || "",
    ownerId: args?.ownerId || "",
  };

  const result = await createRenderService(input);

  if (result.err) {
    console.error("Error creating Render service:", result.err.message);
    process.exit(1);
  }

  console.log("Service created successfully:", result.res);
}

// Run the script
main().catch((err) => console.error("Script error:", err));
