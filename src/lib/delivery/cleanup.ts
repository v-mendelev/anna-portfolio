/**
 * Deletes feature/* branches the pipeline published, after their PR merged
 * into dev. Runs on every push to dev/main (delivery-promote.yml) instead of a
 * pull_request_target "closed" event.
 *
 * Only branches of PRs merged with a recorded publish approval for their final
 * head are touched, and only while the branch still points at that head (no
 * later commits), no other open PR uses it, and it is never dev/main.
 * Branches of manually merged PRs are left for a human.
 */
import type { DeliveryConfig } from './config.ts';
import { evaluateCleanup, isApprovalRecordedFor, isFeatureBranch } from './policy.ts';
import type { GitHubApi, Logger } from './types.ts';

export interface CleanupContext {
  api: GitHubApi;
  cfg: DeliveryConfig;
  appBotLogin: string;
  log: Logger;
}

/** How many recently merged PRs into dev each run looks at. */
export const CLEANUP_WINDOW = 30;

export async function cleanupMergedBranches(ctx: CleanupContext): Promise<string[]> {
  const { api, cfg, appBotLogin, log } = ctx;
  const repo = cfg.repository.toLowerCase();
  const deleted: string[] = [];
  const merged = (await api.listMergedPullRequests(cfg.devBranch)).slice(0, CLEANUP_WINDOW);
  for (const pr of merged) {
    if (pr.head.repoFullName.toLowerCase() !== repo || !isFeatureBranch(pr.head.ref, cfg)) continue;
    const branchSha = await api.getBranchSha(pr.head.ref);
    if (branchSha === null) continue; // already deleted
    const approved = isApprovalRecordedFor(
      await api.listStatuses(pr.head.sha),
      cfg,
      appBotLogin,
      pr.number,
    );
    if (!approved) continue; // merged by a human: not ours to delete
    const others = (await api.findOpenPullRequests(pr.head.ref)).length;
    const decision = evaluateCleanup({ pr, branchSha, openPullRequestsFromBranch: others }, cfg);
    if (decision.action === 'skip') {
      log.info(`Keeping ${pr.head.ref} (PR #${pr.number}): ${decision.reason}.`);
      continue;
    }
    await api.deleteBranch(pr.head.ref);
    log.info(`Deleted merged branch ${pr.head.ref} (PR #${pr.number}).`);
    deleted.push(pr.head.ref);
  }
  return deleted;
}
