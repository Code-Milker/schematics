import fs from "fs";
import path from "path";
import { logMessage, getLatestAction } from "./dialog";
import type { PromptBuilder } from "./prompts";

const textFileExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".txt",
  ".md",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".xml",
  ".sh",
  ".py",
  ".rb",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".cs",
  ".php",
  ".go",
  ".rs",
  ".sql",
  ".ini",
  ".conf",
  ".env",
  ".log",
];

async function sendToOllama(
  messages: string,
  model: string = "qwen2.5-coder:14b",
): Promise<string> {
  try {
    const payload = { model, messages, stream: false };
    const response = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.message.content;
  } catch (error) {
    throw new Error(`Failed to communicate with Ollama: ${error.message}`);
  }
}

async function readFilesInDirectory(
  dir: string,
): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (
      entry.isDirectory() &&
      ![".git", "node_modules", "dist", "build", "logs"].includes(entry.name)
    ) {
      const subFiles = await readFilesInDirectory(fullPath);
      results.push(...subFiles);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (textFileExtensions.includes(ext)) {
        const content = await fs.promises.readFile(fullPath, "utf-8");
        results.push({ path: fullPath, content });
      }
    }
  }
  return results;
}

export async function fetchContext(
  selectedDir: string,
): Promise<Record<string, string>> {
  const rootFiles = await readFilesInDirectory(selectedDir);
  const srcDir = path.join(selectedDir, "src");
  const srcFiles = fs.existsSync(srcDir)
    ? await readFilesInDirectory(srcDir)
    : [];
  const allFiles = [...rootFiles, ...srcFiles];
  return allFiles.reduce(
    (acc, file) => {
      acc[path.relative(selectedDir, file.path)] = file.content;
      return acc;
    },
    {} as Record<string, string>,
  );
}

export async function selectRelevantFiles(
  userInput: string,
  allFiles: string[],
  logFile: string,
): Promise<string[]> {
  const relevantFiles: string[] = allFiles;
  if (relevantFiles.length > 0) {
    const fileList = relevantFiles.join(", ");
    await logMessage(
      "system",
      `Selected relevant files: ${fileList}`,
      logFile,
      {
        action: "select_relevant_files",
        selected_files: relevantFiles,
      },
    );
  } else {
    await logMessage("system", "No relevant files selected.", logFile, {
      action: "select_relevant_files",
      selected_files: [],
    });
  }
  return relevantFiles;
}

export async function generateResponse(
  generatedPrompt: PromptBuilder,
  logFile: string,
): Promise<string> {
  const messages = [{ role: "user", content: generatedPrompt }];
  const contextData = JSON.parse(generatedPrompt.buildJson());
  await logMessage("system", "Full prompt sent to AI", logFile, {
    action: "respond",
    context: {
      files: contextData.files || [],
      roles: contextData.roles || [],
      rules: contextData.rules || [],
      queries: contextData.queries || [],
      values: contextData.values || [],
      userQuestion: contextData.userQuestion || "",
    },
  });
  console.log("log20171:", generatedPrompt.buildMarkdown());
  const response = await sendToOllama(generatedPrompt.buildJson());
  return response;
}
