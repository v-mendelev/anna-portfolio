/**
 * Pure decision rules of the delivery pipeline. No I/O: every function takes
 * plain data and returns a verdict, so each safety rule is unit-tested.
 */
import type { DeliveryConfig } from './config.ts';
import type {
  Actor,
  CheckRun,
  CommitStatus,
  IssueComment,
  PullRequest,
  WorkflowRun,
} from './types.ts';

export const APPROVE_COMMAND = '/publish-approve';

const SHA_RE = /^[0-9a-f]{40}$/;

/** Associations GitHub assigns to people with write access to a repository. */
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/**
 * Parses an approval comment. The whole comment must be exactly
 * `/publish-approve <40-hex head SHA>` — no prose, no abbreviations — so a
 * quote, a mention or a reply never counts as approval.
 */
export function parseApprovalCommand(body: string): string | null {
  const match = /^\/publish-approve[ \t]+([0-9a-fA-F]{40})$/.exec(body.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function isSha(value: string): boolean {
  return SHA_RE.test(value);
}

export function isBot(actor: Actor): boolean {
  return actor.type === 'Bot' || actor.login.toLowerCase().endsWith('[bot]');
}

export function isDependabot(actor: Actor): boolean {
  return actor.login.toLowerCase().startsWith('dependabot');
}

/** `feature/<name>` with a conservative character set (no "..", no trailing "/" or ".lock"). */
export function isFeatureBranch(ref: string, cfg: DeliveryConfig): boolean {
  if (!ref.startsWith(cfg.featurePrefix)) return false;
  const name = ref.slice(cfg.featurePrefix.length);
  return (
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) &&
    !name.includes('..') &&
    !name.includes('//') &&
    !name.endsWith('/') &&
    !name.endsWith('.lock')
  );
}

/** Branches the automation must never delete, whatever an event says. */
export function isProtectedBranch(ref: string, cfg: DeliveryConfig): boolean {
  return (
    ref === cfg.devBranch ||
    ref === cfg.mainBranch ||
    ref === 'gh-pages' ||
    !isFeatureBranch(ref, cfg)
  );
}

export function manualOnlyFiles(files: readonly string[], cfg: DeliveryConfig): string[] {
  return files.filter((file) => cfg.manualOnlyPaths.some((prefix) => file.startsWith(prefix)));
}

/**
 * What an approval binds: one pull request, one approver, one comment. The
 * commit SHA is the commit the status is attached to; the repository is the
 * one the status lives in. Stored as the description of the App's
 * `delivery/approval` commit status (machine-readable, ≤ 140 chars).
 */
export interface ApprovalRecord {
  pr: number;
  approver: string;
  commentId: number;
}

const RECORD_RE = /^Approved PR #(\d+) by ([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})) \(comment (\d+)\)$/;

export function formatApprovalRecord(record: ApprovalRecord): string {
  return `Approved PR #${record.pr} by ${record.approver} (comment ${record.commentId})`;
}

/** Parses a record; legacy or malformed descriptions are not approvals (fail closed). */
export function parseApprovalRecord(description: string): ApprovalRecord | null {
  const m = RECORD_RE.exec(description);
  if (!m) return null;
  return { pr: Number(m[1]), approver: m[2] ?? '', commentId: Number(m[3]) };
}

export interface RecordedApproval {
  state: CommitStatus['state'];
  record: ApprovalRecord | null;
}

/**
 * The newest `delivery/approval` status on a SHA that the delivery App wrote.
 * Statuses written by anyone else (people, GITHUB_TOKEN, other apps) are
 * ignored entirely, so they can neither grant nor mask an approval.
 */
export function latestApproval(
  statuses: readonly CommitStatus[],
  cfg: DeliveryConfig,
  appBotLogin: string,
): RecordedApproval | null {
  // The API lists statuses newest first.
  const own = statuses.find(
    (s) =>
      s.context === cfg.approvalContext &&
      s.creatorLogin.toLowerCase() === appBotLogin.toLowerCase(),
  );
  return own ? { state: own.state, record: parseApprovalRecord(own.description) } : null;
}

/** True only if the App recorded a successful approval of this SHA for exactly this PR. */
export function isApprovalRecordedFor(
  statuses: readonly CommitStatus[],
  cfg: DeliveryConfig,
  appBotLogin: string,
  prNumber: number,
): boolean {
  const approval = latestApproval(statuses, cfg, appBotLogin);
  return approval?.state === 'success' && approval.record?.pr === prNumber;
}

/** Key of an approved (PR, head SHA) pair. */
export function approvalKey(prNumber: number, sha: string): string {
  return `${prNumber}@${sha}`;
}

export interface Commenter extends Actor {
  /** `author_association` of the comment. */
  association: string;
}

/** Step 1 of approval, before any API call: is this person allowed to approve at all? */
export function commenterMayApprove(commenter: Commenter, cfg: DeliveryConfig): boolean {
  return (
    !isBot(commenter) &&
    TRUSTED_ASSOCIATIONS.has(commenter.association) &&
    cfg.approvers.includes(commenter.login.toLowerCase())
  );
}

export type ApprovalDecision =
  /** Open PR: record the approval; the App merges at that SHA once CI passed. */
  | { decision: 'approve'; reasons: [] }
  /** Already merged into dev: record approval so promotion can include it. */
  | { decision: 'record-merged'; reasons: [] }
  | { decision: 'reject'; reasons: string[] };

export interface ApprovalInput {
  repository: string;
  commenter: Commenter;
  sha: string;
  pr: PullRequest;
  files: readonly string[];
  filesTruncated: boolean;
}

/** Full approval check for one `/publish-approve <sha>` command. */
export function evaluateApproval(input: ApprovalInput, cfg: DeliveryConfig): ApprovalDecision {
  const { pr, commenter } = input;
  const reasons: string[] = [];
  const repo = cfg.repository.toLowerCase();

  if (input.repository.toLowerCase() !== repo)
    reasons.push('event is not from the activated repository');
  if (!commenterMayApprove(commenter, cfg)) reasons.push('commenter is not an authorized approver');
  if (!isSha(input.sha)) reasons.push('approval must name a full 40-character commit SHA');
  if (pr.base.repoFullName.toLowerCase() !== repo || pr.head.repoFullName.toLowerCase() !== repo) {
    reasons.push('pull requests from forks are never auto-merged');
  }
  if (pr.base.ref !== cfg.devBranch) reasons.push(`target branch must be ${cfg.devBranch}`);
  if (!isFeatureBranch(pr.head.ref, cfg))
    reasons.push(`source branch must match ${cfg.featurePrefix}*`);
  if (isBot(pr.author) || isDependabot(pr.author))
    reasons.push('bot / Dependabot pull requests are never auto-merged');
  if (pr.draft) reasons.push('draft pull requests are not merged');
  if (pr.state === 'closed' && !pr.merged) reasons.push('pull request is closed without merge');
  if (pr.head.sha.toLowerCase() !== input.sha.toLowerCase()) {
    reasons.push(
      'approved SHA is not the current head of the pull request (new commits were pushed?)',
    );
  }
  if (input.filesTruncated) reasons.push('diff is too large to inspect automatically');
  const manual = manualOnlyFiles(input.files, cfg);
  if (manual.length > 0) {
    reasons.push(
      `changes pipeline/workflow files, which need a manual merge: ${manual.slice(0, 5).join(', ')}`,
    );
  }

  if (reasons.length > 0) return { decision: 'reject', reasons };
  return pr.merged
    ? { decision: 'record-merged', reasons: [] }
    : { decision: 'approve', reasons: [] };
}

/** PR-level rules shared by approval and merge: what may ever be merged into dev automatically. */
function pullRequestProblems(
  pr: PullRequest,
  files: readonly string[],
  filesTruncated: boolean,
  cfg: DeliveryConfig,
): string[] {
  const reasons: string[] = [];
  const repo = cfg.repository.toLowerCase();
  if (pr.state !== 'open' || pr.merged) reasons.push('pull request is not open');
  if (pr.base.repoFullName.toLowerCase() !== repo || pr.head.repoFullName.toLowerCase() !== repo)
    reasons.push('pull requests from forks are never auto-merged');
  if (pr.base.ref !== cfg.devBranch)
    reasons.push(`target branch is ${pr.base.ref}, not ${cfg.devBranch} (retargeted?)`);
  if (!isFeatureBranch(pr.head.ref, cfg))
    reasons.push(`source branch must match ${cfg.featurePrefix}*`);
  if (isBot(pr.author) || isDependabot(pr.author))
    reasons.push('bot / Dependabot pull requests are never auto-merged');
  if (pr.draft) reasons.push('draft pull requests are not merged');
  if (filesTruncated) reasons.push('diff is too large to inspect automatically');
  const manual = manualOnlyFiles(files, cfg);
  if (manual.length > 0)
    reasons.push(
      `changes pipeline/workflow files (manual merge): ${manual.slice(0, 5).join(', ')}`,
    );
  return reasons;
}

/** The approval of the PR's current head, re-verified from GitHub's own records. */
function approvalProblems(
  pr: PullRequest,
  approval: RecordedApproval | null,
  comment: IssueComment | null,
  cfg: DeliveryConfig,
): string[] {
  const head = pr.head.sha.toLowerCase();
  if (!approval) return [`no publish approval recorded for head ${head.slice(0, 12)}`];
  if (approval.state !== 'success') return ['the latest approval record is not "success"'];
  const { record } = approval;
  if (!record) return ['approval record is malformed or from an older format'];
  const reasons: string[] = [];
  if (record.pr !== pr.number) reasons.push(`approval of this SHA belongs to PR #${record.pr}`);
  if (!comment) return [...reasons, 'approval comment no longer exists'];
  if (comment.id !== record.commentId) reasons.push('approval comment id mismatch');
  if (comment.issueNumber !== pr.number)
    reasons.push(`approval comment is on #${comment.issueNumber}, not on this PR`);
  if (parseApprovalCommand(comment.body) !== head)
    reasons.push('approval comment does not name the current head SHA (edited or stale)');
  const commenter: Commenter = { ...comment.author, association: comment.association };
  if (!commenterMayApprove(commenter, cfg))
    reasons.push('approval comment is not from an authorized approver');
  if (comment.author.login.toLowerCase() !== record.approver.toLowerCase())
    reasons.push('approval comment author does not match the record');
  return reasons;
}

export type CiState = 'passed' | 'pending' | 'failed' | 'missing';

export interface CiVerdict {
  state: CiState;
  reason: string;
  /** The CI run the verdict is based on (latest pull_request run for the head SHA). */
  runId: number | null;
}

/**
 * The CI run that decides for a PR head: the newest run of the CI workflow
 * file, triggered by pull_request, for this head SHA, branch and repository,
 * that GitHub associates with this PR as a PR into dev.
 */
export function selectCiRun(
  pr: PullRequest,
  runs: readonly WorkflowRun[],
  cfg: DeliveryConfig,
): WorkflowRun | null {
  const repo = cfg.repository.toLowerCase();
  const matching = runs
    .filter(
      (r) =>
        r.path === cfg.ciWorkflowPath &&
        r.event === 'pull_request' &&
        r.headSha === pr.head.sha &&
        r.headBranch === pr.head.ref &&
        r.headRepoFullName.toLowerCase() === repo &&
        r.pullRequests.some((p) => p.number === pr.number && p.baseRef === cfg.devBranch),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  return matching[0] ?? null;
}

/**
 * Required CI of a PR head, tied to the exact PR and commit: the run chosen by
 * `selectCiRun` must have succeeded, and the required check created by GitHub
 * Actions in that very run's check suite must have succeeded too.
 */
export function evaluateCi(
  input: { pr: PullRequest; runs: readonly WorkflowRun[]; checks: readonly CheckRun[] },
  cfg: DeliveryConfig,
): CiVerdict {
  const { pr } = input;
  const run = selectCiRun(pr, input.runs, cfg);
  if (!run) return { state: 'missing', reason: 'no CI run for this PR head yet', runId: null };
  if (run.status !== 'completed')
    return { state: 'pending', reason: `CI run ${run.id} is ${run.status}`, runId: run.id };
  if (run.conclusion !== 'success')
    return {
      state: 'failed',
      reason: `CI run ${run.id} concluded ${run.conclusion ?? 'without result'}`,
      runId: run.id,
    };
  const checks = input.checks.filter(
    (c) =>
      c.name === cfg.requiredCheck &&
      c.appSlug === cfg.ciAppSlug &&
      c.checkSuiteId === run.checkSuiteId &&
      c.headSha === pr.head.sha,
  );
  if (checks.length === 0)
    return {
      state: 'missing',
      reason: `required check "${cfg.requiredCheck}" not found in CI run ${run.id}`,
      runId: run.id,
    };
  if (checks.some((c) => c.status !== 'completed'))
    return { state: 'pending', reason: `"${cfg.requiredCheck}" is still running`, runId: run.id };
  if (checks.some((c) => c.conclusion !== 'success'))
    return { state: 'failed', reason: `"${cfg.requiredCheck}" did not succeed`, runId: run.id };
  return { state: 'passed', reason: `CI run ${run.id} passed`, runId: run.id };
}

export interface MergeInput {
  pr: PullRequest;
  files: readonly string[];
  filesTruncated: boolean;
  approval: RecordedApproval | null;
  comment: IssueComment | null;
  ci: CiVerdict;
}

export type MergeDecision =
  | { decision: 'merge' }
  /** Approved, but CI for this head has not finished (or not started). */
  | { decision: 'wait'; reason: string }
  /** Approved, but CI for this head failed. A successful re-run can still merge. */
  | { decision: 'ci-failed'; reason: string }
  | { decision: 'reject'; reasons: string[] };

/**
 * The merge gate, evaluated immediately before every merge attempt from fresh
 * API state. Everything must hold for the PR's current head SHA.
 */
export function evaluateMerge(input: MergeInput, cfg: DeliveryConfig): MergeDecision {
  const reasons = [
    ...pullRequestProblems(input.pr, input.files, input.filesTruncated, cfg),
    ...approvalProblems(input.pr, input.approval, input.comment, cfg),
  ];
  if (reasons.length > 0) return { decision: 'reject', reasons };
  if (input.ci.state === 'passed') return { decision: 'merge' };
  if (input.ci.state === 'failed') return { decision: 'ci-failed', reason: input.ci.reason };
  return { decision: 'wait', reason: input.ci.reason };
}

export type CleanupDecision = { action: 'delete' } | { action: 'skip'; reason: string };

export interface CleanupInput {
  pr: PullRequest;
  /** Current SHA of the head branch, null if it no longer exists. */
  branchSha: string | null;
  /** Other open PRs that still use the branch as head. */
  openPullRequestsFromBranch: number;
}

/** Deletes a head branch only if it is a same-repo feature/* branch fully merged into dev. */
export function evaluateCleanup(input: CleanupInput, cfg: DeliveryConfig): CleanupDecision {
  const { pr } = input;
  const repo = cfg.repository.toLowerCase();
  if (!pr.merged) return { action: 'skip', reason: 'pull request was not merged' };
  if (pr.head.repoFullName.toLowerCase() !== repo)
    return { action: 'skip', reason: 'branch is in a fork' };
  if (pr.base.ref !== cfg.devBranch)
    return { action: 'skip', reason: `not merged into ${cfg.devBranch}` };
  if (isProtectedBranch(pr.head.ref, cfg))
    return { action: 'skip', reason: 'branch is protected or not feature/*' };
  if (input.branchSha === null) return { action: 'skip', reason: 'branch already deleted' };
  if (input.branchSha !== pr.head.sha) {
    return {
      action: 'skip',
      reason: 'branch has commits that were not part of the merged pull request',
    };
  }
  if (input.openPullRequestsFromBranch > 0)
    return { action: 'skip', reason: 'branch is used by another open pull request' };
  return { action: 'delete' };
}

export interface SyncInput {
  mainSha: string;
  mainTree: string;
  devTree: string;
  mergeBaseSha: string;
  mergeBaseTree: string;
}

export type SyncDecision = 'in-sync' | 'sync' | 'blocked';

/**
 * `main` is protected with "require branches to be up to date", so dev must
 * contain main's tip before a promotion PR can merge. Merging main back into
 * dev is allowed automatically only when it cannot change dev's content: main's
 * tree equals the merge base's tree (main only gained merge commits) or dev's tree.
 */
export function evaluateSync(input: SyncInput): SyncDecision {
  if (input.mergeBaseSha === input.mainSha) return 'in-sync';
  if (input.mainTree === input.mergeBaseTree || input.mainTree === input.devTree) return 'sync';
  return 'blocked';
}

export interface RangeCommit {
  sha: string;
  treeSha: string;
  /** Tree of the first parent; null for root commits. */
  firstParentTreeSha: string | null;
  /** Pull requests GitHub associates with the commit. */
  pullRequests: readonly PullRequest[];
}

export interface PromotionInput {
  devTree: string;
  mainTree: string;
  commits: readonly RangeCommit[];
  totalCommits: number;
  files: readonly string[];
  filesTruncated: boolean;
  /** `approvalKey(pr, headSha)` of merged PRs with a valid recorded approval. */
  approvedPullRequests: ReadonlySet<string>;
}

export interface Blocker {
  sha: string;
  reason: string;
}

export type PromotionDecision =
  | { action: 'nothing-to-promote' }
  | { action: 'promote'; pullRequests: PullRequest[]; neutral: string[] }
  | { action: 'blocked'; pullRequests: PullRequest[]; blockers: Blocker[] };

/** A PR whose merge into dev was explicitly approved for its final head SHA. */
export function isAuthorizedMergedPr(
  pr: PullRequest,
  approvedPullRequests: ReadonlySet<string>,
  cfg: DeliveryConfig,
): boolean {
  const repo = cfg.repository.toLowerCase();
  return (
    pr.merged &&
    pr.base.ref === cfg.devBranch &&
    pr.base.repoFullName.toLowerCase() === repo &&
    pr.head.repoFullName.toLowerCase() === repo &&
    isFeatureBranch(pr.head.ref, cfg) &&
    !isBot(pr.author) &&
    !isDependabot(pr.author) &&
    approvedPullRequests.has(approvalKey(pr.number, pr.head.sha))
  );
}

function blockReason(commit: RangeCommit, cfg: DeliveryConfig): string {
  const intoDev = commit.pullRequests.filter((pr) => pr.merged && pr.base.ref === cfg.devBranch);
  if (intoDev.length === 0) return 'not introduced by a merged pull request (direct push?)';
  if (intoDev.some((pr) => isBot(pr.author) || isDependabot(pr.author))) {
    return 'comes from a bot / Dependabot pull request';
  }
  if (intoDev.some((pr) => !isFeatureBranch(pr.head.ref, cfg)))
    return 'comes from a non-feature branch';
  return `pull request ${intoDev.map((pr) => `#${pr.number}`).join(', ')} was merged without a recorded approval`;
}

/**
 * Decides whether dev may be promoted to main automatically. Every commit in
 * main..dev must be either neutral (no content change, e.g. the main→dev sync
 * merge) or part of an approved feature PR — otherwise unrelated changes would
 * be promoted silently, so the promotion PR stays open for a human.
 */
export function evaluatePromotion(input: PromotionInput, cfg: DeliveryConfig): PromotionDecision {
  if (input.devTree === input.mainTree || input.totalCommits === 0)
    return { action: 'nothing-to-promote' };

  const blockers: Blocker[] = [];
  const neutral: string[] = [];
  const authorized = new Map<number, PullRequest>();

  if (input.commits.length < input.totalCommits) {
    blockers.push({
      sha: '',
      reason: `range has ${input.totalCommits} commits; too many to verify automatically`,
    });
  }
  if (input.filesTruncated)
    blockers.push({ sha: '', reason: 'diff is too large to inspect automatically' });
  const manual = manualOnlyFiles(input.files, cfg);
  if (manual.length > 0) {
    blockers.push({
      sha: '',
      reason: `pipeline/workflow files changed (manual merge required): ${manual.slice(0, 5).join(', ')}`,
    });
  }

  for (const commit of input.commits) {
    if (commit.firstParentTreeSha !== null && commit.firstParentTreeSha === commit.treeSha) {
      neutral.push(commit.sha);
      continue;
    }
    const prs = commit.pullRequests.filter((pr) =>
      isAuthorizedMergedPr(pr, input.approvedPullRequests, cfg),
    );
    if (prs.length > 0) {
      for (const pr of prs) authorized.set(pr.number, pr);
    } else {
      blockers.push({ sha: commit.sha, reason: blockReason(commit, cfg) });
    }
  }

  const pullRequests = [...authorized.values()].sort((a, b) => a.number - b.number);
  if (blockers.length > 0) return { action: 'blocked', pullRequests, blockers };
  return { action: 'promote', pullRequests, neutral };
}
