# Issue Analyser

CLI tool that discovers and classifies closed GitHub issues with linked PRs, designed to find issues suitable for AI model testing. It searches popular open-source repos, filters by labels, resolves linked PRs, and classifies each issue by complexity (low/medium/high) using PR size as the primary signal.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN (required)
# Optionally add OPENROUTER_API_KEY for AI-powered classification
```

## Usage

```bash
# Default: search Python repos
npx tsx src/index.ts

# Customize search
npx tsx src/index.ts --language typescript --min-stars 1000 --max-repos 5

# Use AI classifier (requires OPENROUTER_API_KEY)
npx tsx src/index.ts --use-ai

# Full options
npx tsx src/index.ts \
  --language python \
  --min-stars 500 \
  --from-date 2025-03-01 \
  --max-repos 10 \
  --max-issues-per-repo 50 \
  --output-dir output \
  --use-ai
```

## CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--language <lang>` | `python` | Programming language to search |
| `--min-stars <n>` | `500` | Minimum repository stars |
| `--from-date <date>` | 12 months ago | Earliest issue creation date (YYYY-MM-DD) |
| `--max-repos <n>` | `10` | Maximum repos to search |
| `--max-issues-per-repo <n>` | `50` | Maximum issues per repo |
| `--output-dir <dir>` | `output` | Output directory |
| `--use-ai` | `false` | Enable AI classification (requires OPENROUTER_API_KEY) |

## Output Format

Results are written as JSON to the output directory:

```json
{
  "generatedAt": "2026-03-09T12:00:00.000Z",
  "config": { "language": "python", "minStars": 500, "fromDate": "2025-03-09", "reposSearched": 10 },
  "totalIssues": 42,
  "byComplexity": { "low": 15, "medium": 20, "high": 7 },
  "issues": [
    {
      "repo": "owner/repo",
      "issue": { "number": 123, "title": "...", "labels": ["bug"], "url": "..." },
      "pr": { "number": 456, "additions": 25, "deletions": 10, "changedFiles": 2, "url": "..." },
      "complexity": "low",
      "reasoning": "Small change: 35 lines across 2 file(s)"
    }
  ]
}
```

## Complexity Classification

**Heuristic (default):** Based on PR size metrics.

| Complexity | Criteria |
|------------|----------|
| Low | < 50 total lines AND < 3 files |
| High | > 300 total lines OR > 10 files |
| Medium | Everything else |

**Refinements:**
- Test-only changes are downgraded one level
- Changes spanning 4+ top-level directories are upgraded one level

**AI mode (`--use-ai`):** Sends issue context and PR stats to an LLM via OpenRouter (default: `anthropic/claude-haiku-4.5`). Falls back to heuristic on failure.

## Label Filtering

**Excluded:** issues with labels containing `documentation`, `docs`, `feat`, `feature`, `enhancement`

**Required:** at least one label containing `bug`, `bugfix`, `chore`, `refactor`, `fix`

Doc-only PRs (all files are `.md`, `.rst`, `.txt`, or under `docs/`) and unmerged PRs are also excluded.
