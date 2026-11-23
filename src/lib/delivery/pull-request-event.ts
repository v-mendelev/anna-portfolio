/**
 * pull_request_target handler for PRs into dev. Runs the base branch's code
 * only — the PR head is never checked out or executed.
 *
 * - synchronize / converted_to_draft / reopened / edited: if auto-merge is on
 *   but the current head has no recorded approval, switch auto-merge off.
 * - closed + merged: delete the feature/* head branch when it is safe.
 */
import type { DeliveryConfig } from './config.ts';
import { evaluateCleanup, evaluateHeadGuard, isApprovalRecorded } from './policy.ts';
import type { GitHubApi, Logger } from './types.ts';

export interface PullRequestEvent {
  action: string;
  repository: { full_name: string };
  pull_request: { number: number };
}

export type PullRequestOutcome =
  | { status: 'ignored'; reason: string }
  | { status: 'auto-merge-disabled' }
  | { status: 'auto-merge-kept' }
  | { status: 'branch-deleted'; branch: string }
  | { status: 'branch-kept'; reason: string };

export interface PullRequestContext {
  api: GitHubApi;
  cfg: DeliveryConfig;
  appBotLogin: string;
  log: Logger;
}

const GUARD_ACTIONS = new Set(['synchronize', 'converted_to_draft', 'reopened', 'edited']);

export async function handlePullRequestEvent(
  event: PullRequestEvent,
  ctx: PullRequestContext,
): Promise<PullRequestOutcome> {
  const { api, cfg, appBotLogin, log } = ctx;
  if (event.repository.full_name.toLowerCase() !== cfg.repository.toLowerCase()) {
    return { status: 'ignored', reason: 'event is not from the activated repository' };
  }
  // Always act on fresh state, never on the (possibly stale or replayed) event payload.
  const pr = await api.getPullRequest(event.pull_request.number);

  if (event.action === 'closed') {
    const sameRepo = pr.head.repoFullName.toLowerCase() === cfg.repository.toLowerCase();
    const branchSha = sameRepo ? await api.getBranchSha(pr.head.ref) : null;
    const others = sameRepo
      ? (await api.findOpenPullRequests(pr.head.ref)).filter((p) => p.number !== pr.number).length
      : 0;
    const decision = evaluateCleanup({ pr, branchSha, openPullRequestsFromBranch: others }, cfg);
    if (decision.action === 'skip') {
      log.info(`Keeping head branch of PR #${pr.number}: ${decision.reason}.`);
      return { status: 'branch-kept', reason: decision.reason };
    }
    await api.deleteBranch(pr.head.ref);
    log.info(`Deleted merged branch ${pr.head.ref} (PR #${pr.number}).`);
    return { status: 'branch-deleted', branch: pr.head.ref };
  }

  if (GUARD_ACTIONS.has(event.action)) {
    if (pr.state !== 'open') return { status: 'ignored', reason: 'pull request is not open' };
    const approved = isApprovalRecorded(await api.listStatuses(pr.head.sha), cfg, appBotLogin);
    if (evaluateHeadGuard(pr, approved, cfg) === 'none') return { status: 'auto-merge-kept' };
    await api.disableAutoMerge(pr);
    await api.createComment(
      pr.number,
      `Auto-merge disabled: head \`${pr.head.sha.slice(0, 12)}\` has no recorded publish approval ` +
        '(new commits, draft or a different base branch). Nothing was merged. Approve the new head to continue.',
    );
    log.warn(`Disabled auto-merge on PR #${pr.number}: head is not approved.`);
    return { status: 'auto-merge-disabled' };
  }

  return { status: 'ignored', reason: `action ${event.action} needs no handling` };
}
