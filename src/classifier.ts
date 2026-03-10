import type {
  Complexity,
  ComplexityThresholds,
  DiscoveredIssue,
  LinkedPR,
  PipelineConfig,
} from "./types.js";

interface ClassificationResult {
  complexity: Complexity;
  reasoning: string;
}

function getTopLevelDirs(files: { filename: string }[]): Set<string> {
  const dirs = new Set<string>();
  for (const f of files) {
    const firstSegment = f.filename.split("/")[0];
    if (firstSegment) dirs.add(firstSegment);
  }
  return dirs;
}

function allTestFiles(files: { filename: string }[]): boolean {
  return files.every((f) => {
    const lower = f.filename.toLowerCase();
    return (
      lower.includes("test") ||
      lower.includes("spec") ||
      lower.includes("__tests__")
    );
  });
}

export function classifyHeuristic(
  issue: DiscoveredIssue,
  pr: LinkedPR,
  thresholds: ComplexityThresholds,
): ClassificationResult {
  const totalLines = pr.additions + pr.deletions;
  const reasons: string[] = [];
  let complexity: Complexity;

  const sizeLabel = totalLines < thresholds.lowMaxLines && pr.changedFiles < thresholds.lowMaxFiles
    ? "Small" : totalLines > thresholds.highMinLines || pr.changedFiles > thresholds.highMinFiles
    ? "Large" : "Moderate";

  complexity = sizeLabel === "Small" ? "low" : sizeLabel === "Large" ? "high" : "medium";
  reasons.push(`${sizeLabel} change: ${totalLines} lines across ${pr.changedFiles} file(s)`);

  if (allTestFiles(pr.fileList) && complexity !== "low") {
    complexity = complexity === "high" ? "medium" : "low";
    reasons.push("Downgraded: all changed files are tests");
  }

  const topDirs = getTopLevelDirs(pr.fileList);
  if (topDirs.size > 3 && complexity !== "high") {
    complexity = complexity === "low" ? "medium" : "high";
    reasons.push(`Upgraded: changes span ${topDirs.size} top-level directories`);
  }

  return { complexity, reasoning: reasons.join(". ") };
}

export async function classifyWithAI(
  issue: DiscoveredIssue,
  pr: LinkedPR,
  config: PipelineConfig,
): Promise<ClassificationResult> {
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: config.openRouterApiKey,
    });

    const prompt = `You are classifying GitHub issue fixes by complexity from a developer's perspective.

Complexity definitions:
- low: isolated, straightforward fix. Typos, config changes, null checks, simple bug fixes. Typically < 50 lines across 1-2 files.
- medium: requires understanding multiple components or moderate domain knowledge. Typically 50-300 lines across a few files.
- high: architecturally complex, spans many subsystems, or requires deep expertise. Typically > 300 lines or > 10 files.

Signals that increase complexity:
- Library/framework compatibility issues
- Heavy use of abstractions (inheritance chains, design patterns)
- Concurrency or async bugs (race conditions, deadlocks)
- State management across multiple components
- Performance optimizations
- Database schema or migration changes
- Security fixes with subtle edge cases
- Cross-platform or environment-specific issues
- Changes spanning many top-level directories

Signals that decrease complexity:
- Typo or string fixes
- Config/environment changes
- Dependency version bumps
- Adding missing null checks
- Test-only changes

Issue: ${issue.title}
${issue.body ? `Description: ${issue.body.slice(0, 500)}` : ""}

PR stats:
- Lines added: ${pr.additions}
- Lines deleted: ${pr.deletions}
- Files changed: ${pr.changedFiles}
- Files: ${pr.fileList.map((f) => `${f.filename} (+${f.additions}/-${f.deletions})`).join(", ")}

Respond with raw JSON only, no markdown: {"complexity": "low"|"medium"|"high", "confidence": 0.0-1.0, "reasoning": "one sentence"}`;

    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const text = raw.replace(/```json\s*\n?/g, "").replace(/```\s*$/g, "").trim();
    const parsed = JSON.parse(text) as { complexity: Complexity; reasoning: string };

    return {
      complexity: parsed.complexity,
      reasoning: `[AI] ${parsed.reasoning}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  AI classification failed (${msg}), falling back to heuristic`);
    return classifyHeuristic(issue, pr, config.thresholds);
  }
}

export function classify(
  issue: DiscoveredIssue,
  pr: LinkedPR,
  config: PipelineConfig,
): ClassificationResult | Promise<ClassificationResult> {
  if (config.useAI) {
    return classifyWithAI(issue, pr, config);
  }
  return classifyHeuristic(issue, pr, config.thresholds);
}
