import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

async function main() {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  process.chdir(directory);
  const envPath = path.resolve(process.argv[2] ?? "../backend/.env");
  const loaded = config({ path: envPath });
  if (loaded.error) throw new Error(`Cannot load backend environment: ${envPath}`);
  const key = loaded.parsed?.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Backend environment must contain GEMINI_API_KEY.");
  // Node-only compatibility alias for the byte-identical historical parser.
  // Never import this evaluator into Expo or copy this alias into its .env.
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = key;
  process.argv = [process.argv[0], "evaluate_ai.ts", "--run", "--resume", "report.json"];
  console.log("Resuming the ORIGINAL parser experiment; current app/backend code is not evaluated.");
  await import("./evaluate_ai.ts");
}
main().catch(() => {
  console.error("Could not start. Check the backend .env path and its GEMINI_API_KEY entry. No key is printed.");
  process.exitCode = 1;
});
