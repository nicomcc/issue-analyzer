import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildConfig } from "./config.js";
import { createClient, discoverRepos, findIssues, fetchLinkedPR } from "./github.js";
import { filterIssueByLabels, filterPR } from "./filters.js";
import { classify } from "./classifier.js";
import type { ClassifiedIssue, PipelineResult, Complexity } from "./types.js";

const log = (msg: string) => process.stderr.write(`${msg}\n`);

async function main() {
  const config = buildConfig();
  const octokit = createClient(config.githubToken);
  const results: ClassifiedIssue[] = [];

  log(`Discovering ${config.language} repos with >=${config.minStars} stars...`);
  const repos = await discoverRepos(octokit, config);
  log(`Found ${repos.length} repo(s)\n`);

  for (const repo of repos) {
    log(`[${repo.fullName}] (${repo.stars.toLocaleString()} stars)`);
    const issues = await findIssues(octokit, repo, config);
    log(`  Found ${issues.length} closed issue(s) with linked PRs`);

    const filtered = issues.filter(filterIssueByLabels);
    log(`  ${filtered.length} issue(s) after label filtering`);

    for (const issue of filtered) {
      const pr = await fetchLinkedPR(octokit, repo.owner, repo.name, issue.number);
      if (!pr) {
        log(`  #${issue.number}: no linked PR found, skipping`);
        continue;
      }
      if (!filterPR(pr)) {
        log(`  #${issue.number}: PR filtered (unmerged or doc-only), skipping`);
        continue;
      }

      const { complexity, reasoning } = await Promise.resolve(
        classify(issue, pr, config),
      );

      results.push({
        repo: repo.fullName,
        issue,
        pr,
        complexity,
        reasoning,
      });

      log(`  #${issue.number}: ${complexity} — ${issue.title.slice(0, 60)}`);
    }

    log("");
  }

  writeOutput(results, config.outputDir, config);
}

function writeOutput(
  results: ClassifiedIssue[],
  outputDir: string,
  config: { language: string; minStars: number; fromDate: string; maxRepos: number },
) {
  const byComplexity: Record<Complexity, number> = { low: 0, medium: 0, high: 0 };
  for (const r of results) {
    byComplexity[r.complexity]++;
  }

  const output: PipelineResult = {
    generatedAt: new Date().toISOString(),
    config: {
      language: config.language,
      minStars: config.minStars,
      fromDate: config.fromDate,
      reposSearched: config.maxRepos,
    },
    totalIssues: results.length,
    byComplexity,
    issues: results,
  };

  mkdirSync(outputDir, { recursive: true });
  const filename = `issues-${config.language}-${new Date().toISOString().slice(0, 10)}.json`;
  const filepath = join(outputDir, filename);
  writeFileSync(filepath, JSON.stringify(output, null, 2));

  log(`Results written to ${filepath}`);
  log(`\nSummary:`);
  log(`  Total: ${results.length}`);
  log(`  Low:    ${byComplexity.low}`);
  log(`  Medium: ${byComplexity.medium}`);
  log(`  High:   ${byComplexity.high}`);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
