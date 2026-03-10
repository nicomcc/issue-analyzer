import type { DiscoveredIssue, LinkedPR } from "./types.js";

const EXCLUDE_LABELS = ["documentation", "docs", "feat", "feature", "enhancement"];
const INCLUDE_LABELS = ["bug", "bugfix", "chore", "refactor", "fix"];
const DOC_EXTENSIONS = [".md", ".rst", ".txt"];

export function filterIssueByLabels(issue: DiscoveredIssue): boolean {
  const lowerLabels = issue.labels.map((l) => l.toLowerCase());

  const hasExcluded = lowerLabels.some((l) =>
    EXCLUDE_LABELS.some((ex) => l.includes(ex)),
  );
  if (hasExcluded) return false;

  const hasIncluded = lowerLabels.some((l) =>
    INCLUDE_LABELS.some((inc) => l.includes(inc)),
  );
  return hasIncluded;
}

export function filterPR(pr: LinkedPR): boolean {
  if (!pr.mergedAt) return false;

  const allDocs = pr.fileList.every((f) => {
    const lower = f.filename.toLowerCase();
    return (
      DOC_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
      lower.includes("docs/")
    );
  });
  if (allDocs && pr.fileList.length > 0) return false;

  return true;
}
