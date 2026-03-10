import { Octokit } from "@octokit/rest";
import type { DiscoveredRepo, DiscoveredIssue, LinkedPR, PRFile, PipelineConfig } from "./types.js";

export function createClient(token: string) {
  return new Octokit({ auth: token });
}

type OctokitClient = ReturnType<typeof createClient>;

export async function discoverRepos(
  octokit: OctokitClient,
  config: PipelineConfig,
): Promise<DiscoveredRepo[]> {
  const q = `stars:>=${config.minStars} language:${config.language} pushed:>=${config.fromDate}`;
  const repos: DiscoveredRepo[] = [];

  const iterator = octokit.paginate.iterator(octokit.rest.search.repos, {
    q,
    sort: "stars",
    order: "desc",
    per_page: 30,
  });

  for await (const response of iterator) {
    for (const repo of response.data) {
      if (!repo.owner) continue;
      repos.push({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        stars: repo.stargazers_count,
        language: repo.language ?? config.language,
        url: repo.html_url,
      });
      if (repos.length >= config.maxRepos) return repos;
    }
    if (repos.length >= config.maxRepos) break;
  }

  return repos;
}

export async function findIssues(
  octokit: OctokitClient,
  repo: DiscoveredRepo,
  config: PipelineConfig,
): Promise<DiscoveredIssue[]> {
  const q = `repo:${repo.fullName} is:issue is:closed linked:pr created:>=${config.fromDate}`;
  const issues: DiscoveredIssue[] = [];

  const iterator = octokit.paginate.iterator(octokit.rest.search.issuesAndPullRequests, {
    q,
    sort: "created",
    order: "desc",
    per_page: 30,
  });

  for await (const response of iterator) {
    for (const item of response.data) {
      issues.push({
        number: item.number,
        title: item.title,
        body: item.body ?? null,
        labels: (item.labels as Array<string | { name?: string }>).map((l) =>
          typeof l === "string" ? l : l.name ?? "",
        ),
        closedAt: item.closed_at ?? null,
        commentCount: item.comments,
        url: item.html_url,
      });
      if (issues.length >= config.maxIssuesPerRepo) return issues;
    }
    if (issues.length >= config.maxIssuesPerRepo) break;
  }

  return issues;
}

interface GraphQLClosingPR {
  repository: {
    issue: {
      timelineItems: {
        nodes: Array<{
          closer: {
            number: number;
          } | null;
        }>;
      };
    };
  };
}

async function findPRNumberViaGraphQL(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<number | null> {
  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          timelineItems(itemTypes: [CLOSED_EVENT], first: 10) {
            nodes {
              ... on ClosedEvent {
                closer {
                  ... on PullRequest {
                    number
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const result = await octokit.graphql<GraphQLClosingPR>(query, {
    owner,
    repo,
    number: issueNumber,
  });

  for (const node of result.repository.issue.timelineItems.nodes) {
    if (node.closer?.number) return node.closer.number;
  }

  return null;
}

export async function fetchLinkedPR(
  octokit: OctokitClient,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<LinkedPR | null> {
  try {
    const prNumber = await findPRNumberViaGraphQL(octokit, owner, repo, issueNumber);
    if (!prNumber) return null;

    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const filesResponse = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const fileList: PRFile[] = filesResponse.map((f) => ({
      filename: f.filename,
      additions: f.additions,
      deletions: f.deletions,
      status: f.status,
    }));

    return {
      number: prNumber,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      mergedAt: pr.merged_at,
      fileList,
      url: pr.html_url,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Warning: could not fetch PR for issue #${issueNumber}: ${msg}`);
    return null;
  }
}
