import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import type { PipelineConfig } from "./types.js";

loadEnv();

const DEFAULT_THRESHOLDS = {
  lowMaxLines: 50,
  lowMaxFiles: 3,
  highMinLines: 300,
  highMinFiles: 10,
};

function twelveMonthsAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export function buildConfig(argv?: string[]): PipelineConfig {
  const program = new Command();

  program
    .name("issue-analyser")
    .description("Discover and classify GitHub issues for AI model testing")
    .option("--language <lang>", "Programming language to search", "python")
    .option("--min-stars <n>", "Minimum repo stars", "500")
    .option("--from-date <date>", "Earliest issue creation date (YYYY-MM-DD)", twelveMonthsAgo())
    .option("--max-repos <n>", "Max repos to search", "10")
    .option("--max-issues-per-repo <n>", "Max issues per repo", "50")
    .option("--output-dir <dir>", "Output directory", "output")
    .option("--output-format <fmt>", "Output format", "json")
    .option("--use-ai", "Use AI classifier (requires OPENROUTER_API_KEY)", false);

  program.parse(argv ?? process.argv);
  const opts = program.opts();

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error("Error: GITHUB_TOKEN environment variable is required.");
    console.error("Create a .env file based on .env.example or export GITHUB_TOKEN.");
    process.exit(1);
  }

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (opts.useAi && !openRouterApiKey) {
    console.error("Error: --use-ai requires OPENROUTER_API_KEY environment variable.");
    process.exit(1);
  }

  return {
    githubToken,
    openRouterApiKey,
    language: opts.language,
    minStars: parseInt(opts.minStars, 10),
    fromDate: opts.fromDate,
    maxRepos: parseInt(opts.maxRepos, 10),
    maxIssuesPerRepo: parseInt(opts.maxIssuesPerRepo, 10),
    outputDir: opts.outputDir,
    outputFormat: opts.outputFormat as "json",
    useAI: opts.useAi,
    thresholds: DEFAULT_THRESHOLDS,
  };
}
