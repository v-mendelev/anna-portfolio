/**
 * Pure decision rules of the delivery pipeline. No I/O: every function takes
 * plain data and returns a verdict, so each safety rule is unit-tested.
 */
import type { DeliveryConfig } from './config.ts';
import type { Actor, CommitStatus, PullRequest } from './types.ts';

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
 * An approval is valid only if the newest `delivery/approval` status on that
 * exact SHA was written by the delivery App and is "success". Statuses written
 * by anyone else (people, GITHUB_TOKEN in a PR workflow) are ignored.
 */
export function isApprovalRecorded(
  statuses: readonly CommitStatus[],
  cfg: DeliveryConfig,
  appBotLogin: string,
): boolean {
  const own = statuses.filter(
    (s) =>
      s.context === cfg.approvalContext &&
      s.creatorLogin.toLowerCase() === appBotLogin.toLowerCase(),
  );
  // The API lists statuses newest first.
  return own[0]?.state === 'success';
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
  /** Open PR: record approval and enable auto-merge bound to the SHA. */
  | { decision: 'enable-auto-merge'; reasons: [] }
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
    : { decision: 'enable-auto-merge', reasons: [] };
}

/**
 * New commits (or draft conversion) on an auto-merge PR whose new head has no
 * recorded approval: auto-merge must be switched off.
 */
export function evaluateHeadGuard(
  pr: PullRequest,
  headApproved: boolean,
  cfg: DeliveryConfig,
): 'none' | 'disable-auto-merge' {
  if (!pr.autoMergeEnabled) return 'none';
  // Promotion (dev → main) and sync (main → dev) PRs are managed by promote.ts.
  if (pr.head.ref === cfg.devBranch || pr.head.ref === cfg.mainBranch) return 'none';
  // An approval covers merging into dev only; a retarget revokes it.
  if (pr.base.ref !== cfg.devBranch) return 'disable-auto-merge';
  return !headApproved || pr.draft ? 'disable-auto-merge' : 'none';
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
  /** Head SHAs of pull requests with a valid recorded approval. */
  approvedHeads: ReadonlySet<string>;
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
  approvedHeads: ReadonlySet<string>,
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
    approvedHeads.has(pr.head.sha)
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
      isAuthorizedMergedPr(pr, input.approvedHeads, cfg),
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
