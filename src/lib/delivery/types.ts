/**
 * Domain types for the delivery pipeline (feature/* → dev → main → Pages).
 *
 * The decision logic works only with these plain shapes; the GitHub REST/GraphQL
 * client (rest.ts) maps API responses into them. Tests use an in-memory fake.
 */

export interface Actor {
  login: string;
  /** "User", "Bot" or "Organization" as reported by GitHub. */
  type: string;
}

export interface PullRequest {
  number: number;
  /** GraphQL node id (needed for auto-merge mutations). */
  nodeId: string;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  title: string;
  htmlUrl: string;
  author: Actor;
  base: { ref: string; repoFullName: string };
  head: { ref: string; sha: string; repoFullName: string };
  mergeCommitSha: string | null;
  autoMergeEnabled: boolean;
}

export interface CommitInfo {
  sha: string;
  treeSha: string;
  parents: readonly string[];
}

export interface CommitStatus {
  context: string;
  state: 'success' | 'failure' | 'error' | 'pending';
  creatorLogin: string;
  description: string;
}

export interface Comparison {
  /** Commits reachable from head but not from base. */
  aheadBy: number;
  /** Commits reachable from base but not from head. */
  behindBy: number;
  totalCommits: number;
  mergeBase: CommitInfo;
  /** Ahead commits (oldest first). May be truncated by the API — compare with totalCommits. */
  commits: readonly CommitInfo[];
  /** Changed paths between merge base and head. */
  files: readonly string[];
  /** True when the API capped the file list (diff too large to inspect). */
  filesTruncated: boolean;
}

export type MergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

/** Result of asking GitHub to enable native auto-merge. */
export type AutoMergeResult =
  | 'enabled'
  /** GitHub refuses auto-merge when the PR is already mergeable ("clean status"). */
  | 'clean'
  /** The PR head no longer matches the expected (approved) SHA. */
  | 'head-moved';

export type MergeResult = 'merged' | 'not-mergeable' | 'head-moved';

/**
 * The subset of the GitHub API the pipeline needs. Every method acts on the
 * single repository the token was minted for.
 */
export interface GitHubApi {
  getPullRequest(number: number): Promise<PullRequest>;
  listPullRequestFiles(number: number): Promise<{ files: string[]; truncated: boolean }>;
  findOpenPullRequests(head: string, base?: string): Promise<PullRequest[]>;
  listPullRequestsForCommit(sha: string): Promise<PullRequest[]>;
  /** Most recently updated merged PRs into `base` (up to 100). */
  listMergedPullRequests(base: string): Promise<PullRequest[]>;
  createPullRequest(input: {
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<PullRequest>;
  updatePullRequest(number: number, input: { title: string; body: string }): Promise<void>;
  enableAutoMerge(
    pr: PullRequest,
    method: MergeMethod,
    expectedHeadSha: string,
  ): Promise<AutoMergeResult>;
  disableAutoMerge(pr: PullRequest): Promise<void>;
  mergePullRequest(number: number, sha: string, method: MergeMethod): Promise<MergeResult>;
  createComment(number: number, body: string): Promise<void>;
  getBranchSha(branch: string): Promise<string | null>;
  deleteBranch(branch: string): Promise<void>;
  getCommit(sha: string): Promise<CommitInfo>;
  compare(base: string, head: string): Promise<Comparison>;
  listStatuses(sha: string): Promise<CommitStatus[]>;
  createStatus(
    sha: string,
    status: {
      state: CommitStatus['state'];
      context: string;
      description: string;
      targetUrl?: string;
    },
  ): Promise<void>;
}

/** Minimal logger: never pass secrets, comment bodies or personal data. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}
