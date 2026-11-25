/**
 * The merge gate for feature/* → dev.
 *
 * The App merges a pull request itself — no native auto-merge — and only when,
 * re-read from GitHub immediately before the merge:
 * - the PR is a same-repository feature/* → dev PR, open, not a draft, not from
 *   a bot/Dependabot, and does not touch pipeline/workflow files;
 * - the App's approval record on the current head SHA names this PR and points
 *   at an existing `/publish-approve <that SHA>` comment on this PR by an
 *   authorized approver;
 * - the newest CI pull_request run for this PR and SHA succeeded, including the
 *   required check created by GitHub Actions in that run.
 * The merge call itself carries the SHA, so GitHub refuses it if the head moved
 * in the meantime, and branch protection still applies (the App has no bypass).
 * Any API error propagates: nothing is merged (fail closed).
 */
import type { DeliveryConfig } from './config.ts';
import {
  evaluateCi,
  evaluateMerge,
  latestApproval,
  selectCiRun,
  type MergeDecision,
} from './policy.ts';
import type { CiApi, GitHubApi, Logger, PullRequest } from './types.ts';

export const FEATURE_MERGE_METHOD = 'SQUASH';

export interface MergeContext {
  api: GitHubApi;
  ci: CiApi;
  cfg: DeliveryConfig;
  appBotLogin: string;
  log: Logger;
}

export type MergeOutcome =
  | { status: 'merged'; pr: number; sha: string }
  | { status: 'already-merged'; pr: number; sha: string }
  /** The PR head is no longer the SHA this attempt was about. */
  | { status: 'stale'; pr: number; reason: string }
  | { status: 'not-approved'; pr: number; reasons: string[] }
  | { status: 'waiting-for-ci'; pr: number; reason: string }
  | { status: 'ci-failed'; pr: number; reason: string }
  /** GitHub refused the merge (conflict, branch protection). */
  | { status: 'not-mergeable'; pr: number; reason: string };

async function decide(
  ctx: MergeContext,
  pr: PullRequest,
): Promise<{ decision: MergeDecision; ciRun: number | null }> {
  const { api, ci, cfg, appBotLogin } = ctx;
  const approval = latestApproval(await api.listStatuses(pr.head.sha), cfg, appBotLogin);
  const comment = approval?.record ? await api.getIssueComment(approval.record.commentId) : null;
  const { files, truncated } = await api.listPullRequestFiles(pr.number);
  const runs = await ci.listWorkflowRuns(cfg.ciWorkflowPath.split('/').pop() ?? '', pr.head.sha);
  const run = selectCiRun(pr, runs, cfg);
  // The required check of exactly that run (its check suite), not of the commit.
  const checks = run ? await ci.listCheckRuns(run.checkSuiteId, cfg.requiredCheck) : [];
  const verdict = evaluateCi({ pr, runs, checks }, cfg);
  return {
    decision: evaluateMerge(
      { pr, files, filesTruncated: truncated, approval, comment, ci: verdict },
      cfg,
    ),
    ciRun: verdict.runId,
  };
}

/**
 * Merges PR `number` into dev at `expectedSha` if, and only if, every rule of
 * the merge gate holds. Safe to call repeatedly and concurrently: a second
 * attempt finds the PR merged (or GitHub refuses it) and reports that.
 */
export async function mergeIfApproved(
  ctx: MergeContext,
  number: number,
  expectedSha: string,
): Promise<MergeOutcome> {
  const { api, log } = ctx;
  const pr = await api.getPullRequest(number);
  if (pr.merged) {
    return pr.head.sha === expectedSha
      ? { status: 'already-merged', pr: number, sha: expectedSha }
      : { status: 'stale', pr: number, reason: 'merged at a different SHA' };
  }
  if (pr.head.sha !== expectedSha)
    return { status: 'stale', pr: number, reason: 'the head moved; a newer run decides' };

  const { decision, ciRun } = await decide(ctx, pr);
  if (decision.decision === 'reject')
    return { status: 'not-approved', pr: number, reasons: decision.reasons };
  if (decision.decision === 'wait')
    return { status: 'waiting-for-ci', pr: number, reason: decision.reason };
  if (decision.decision === 'ci-failed')
    return { status: 'ci-failed', pr: number, reason: decision.reason };

  // Revalidate the PR itself right before merging (base, draft, head, state).
  const fresh = await api.getPullRequest(number);
  if (fresh.head.sha !== expectedSha || fresh.merged)
    return { status: 'stale', pr: number, reason: 'the head changed during verification' };
  const recheck = await decide(ctx, fresh);
  if (recheck.decision.decision !== 'merge' || recheck.ciRun !== ciRun) {
    return {
      status: 'not-approved',
      pr: number,
      reasons:
        recheck.decision.decision === 'reject'
          ? recheck.decision.reasons
          : ['state changed during verification'],
    };
  }

  const result = await api.mergePullRequest(number, expectedSha, FEATURE_MERGE_METHOD);
  if (result === 'merged') {
    log.info(`Merged PR #${number} into ${ctx.cfg.devBranch} at ${expectedSha} (CI run ${ciRun}).`);
    return { status: 'merged', pr: number, sha: expectedSha };
  }
  if (result === 'head-moved')
    return { status: 'stale', pr: number, reason: 'GitHub reports the head moved' };
  // Refused: maybe a concurrent attempt merged it first, otherwise a real refusal.
  const after = await api.getPullRequest(number);
  if (after.merged && after.head.sha === expectedSha)
    return { status: 'already-merged', pr: number, sha: expectedSha };
  return {
    status: 'not-mergeable',
    pr: number,
    reason: 'GitHub refused the merge (merge conflict or branch protection)',
  };
}
