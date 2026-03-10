export interface ComplexityThresholds {
  lowMaxLines: number;
  lowMaxFiles: number;
  highMinLines: number;
  highMinFiles: number;
}

export interface PipelineConfig {
  githubToken: string;
  openRouterApiKey?: string;
  language: string;
  minStars: number;
  fromDate: string;
  maxRepos: number;
  maxIssuesPerRepo: number;
  outputDir: string;
  outputFormat: "json";
  useAI: boolean;
  thresholds: ComplexityThresholds;
}

export interface DiscoveredRepo {
  owner: string;
  name: string;
  fullName: string;
  stars: number;
  language: string;
  url: string;
}

export interface DiscoveredIssue {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  closedAt: string | null;
  commentCount: number;
  url: string;
}

export interface PRFile {
  filename: string;
  additions: number;
  deletions: number;
  status: string;
}

export interface LinkedPR {
  number: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergedAt: string | null;
  fileList: PRFile[];
  url: string;
}

export type Complexity = "low" | "medium" | "high";

export interface ClassifiedIssue {
  repo: string;
  issue: DiscoveredIssue;
  pr: LinkedPR;
  complexity: Complexity;
  reasoning: string;
}

export interface PipelineResult {
  generatedAt: string;
  config: {
    language: string;
    minStars: number;
    fromDate: string;
    reposSearched: number;
  };
  totalIssues: number;
  byComplexity: Record<Complexity, number>;
  issues: ClassifiedIssue[];
}
