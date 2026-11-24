/**
 * dev → main promotion (runs on every push to dev/main and on demand).
 *
 * 1. If main is not contained in dev (main's "up to date" rule needs it), open
 *    or reuse one main → dev sync PR — only when that merge cannot change dev.
 * 2. Otherwise classify every commit in main..dev. Create or update the single
 *    promotion PR (head dev, base main) and enable auto-merge bound to the dev
 *    SHA only when every commit is neutral or from an approved feature PR.
 *    Anything else keeps the PR open (auto-merge off) for a human decision.
 *
 * Idempotent: repeated runs reuse the same PRs and never merge twice.
 */
import type { DeliveryConfig } from './config.ts';
import {
  approvalKey,
  evaluatePromotion,
  evaluateSync,
  isApprovalRecordedFor,
  type PromotionDecision,
  type RangeCommit,
} from './policy.ts';
import type { CommitInfo, GitHubApi, Logger, PullRequest } from './types.ts';

export const PROMOTION_MARKER = '<!-- delivery:promotion -->';
export const SYNC_MARKER = '<!-- delivery:sync -->';
export const PROMOTION_MERGE_METHOD = 'MERGE';

export type PromotionOutcome =
  | { status: 'up-to-date' }
  | { status: 'sync-pending'; pr: number }
  | { status: 'sync-blocked'; reason: string }
  | { status: 'superseded'; reason: string }
  | { status: 'promotion-auto-merge'; pr: number; sha: string }
  | { status: 'promotion-merged'; pr: number; sha: string }
  | { status: 'promotion-blocked'; pr: number; sha: string; reasons: string[] };

export interface PromotionContext {
  api: GitHubApi;
  cfg: DeliveryConfig;
  appBotLogin: string;
  log: Logger;
}

async function requireBranch(api: GitHubApi, branch: string): Promise<string> {
  const sha = await api.getBranchSha(branch);
  if (sha === null) throw new Error(`Branch ${branch} does not exist.`);
  return sha;
}

function short(sha: string): string {
  return sha.slice(0, 12);
}

export function promotionBody(
  decision: PromotionDecision,
  devSha: string,
  cfg: DeliveryConfig,
): string {
  const lines = [
    PROMOTION_MARKER,
    `Automated promotion of \`${cfg.devBranch}\` → \`${cfg.mainBranch}\` at \`${devSha}\`.`,
    '',
  ];
  if (decision.action === 'nothing-to-promote') return [...lines, 'Nothing to promote.'].join('\n');
  lines.push('### Approved changes');
  if (decision.pullRequests.length === 0) lines.push('- (none)');
  for (const pr of decision.pullRequests)
    lines.push(`- #${pr.number} ${pr.title} (\`${short(pr.head.sha)}\`)`);
  if (decision.action === 'blocked') {
    lines.push(
      '',
      '### ⛔ Not promoted automatically',
      `\`${cfg.devBranch}\` contains changes without a recorded publish approval. Auto-merge is OFF.`,
      'Review them and merge this PR manually, or approve the listed PRs (`/publish-approve <sha>`).',
      '',
    );
    for (const b of decision.blockers)
      lines.push(`- ${b.sha ? `\`${short(b.sha)}\`: ` : ''}${b.reason}`);
  } else {
    lines.push(
      '',
      `Auto-merge is ON for exactly \`${short(devSha)}\`; it merges once required checks pass.`,
    );
    if (decision.neutral.length > 0)
      lines.push(`Neutral (no content change) commits: ${decision.neutral.length}.`);
  }
  return lines.join('\n');
}

async function rangeCommits(
  api: GitHubApi,
  commits: readonly CommitInfo[],
  devBranch: string,
): Promise<RangeCommit[]> {
  const known = new Map(commits.map((c) => [c.sha, c]));
  // Squash/merge commits on dev are matched to their PR by merge_commit_sha;
  // the commit→PR association API is a fallback (it targets the default branch).
  const byMergeCommit = new Map<string, PullRequest>();
  for (const pr of await api.listMergedPullRequests(devBranch)) {
    if (pr.mergeCommitSha) byMergeCommit.set(pr.mergeCommitSha, pr);
  }
  const result: RangeCommit[] = [];
  for (const commit of commits) {
    const parentSha = commit.parents[0];
    let firstParentTreeSha: string | null = null;
    if (parentSha !== undefined) {
      firstParentTreeSha = (known.get(parentSha) ?? (await api.getCommit(parentSha))).treeSha;
    }
    // The open promotion PR (dev → main) also "contains" every commit; only PRs merged into dev count.
    const direct = byMergeCommit.get(commit.sha);
    const associated = direct ? [] : await api.listPullRequestsForCommit(commit.sha);
    const pullRequests = [...(direct ? [direct] : []), ...associated].filter(
      (pr) => pr.merged && pr.base.ref === devBranch,
    );
    result.push({ sha: commit.sha, treeSha: commit.treeSha, firstParentTreeSha, pullRequests });
  }
  return result;
}

/** Merged PRs whose final head SHA carries the App's approval record for that same PR. */
async function approvedPullRequests(
  api: GitHubApi,
  commits: readonly RangeCommit[],
  ctx: PromotionContext,
): Promise<Set<string>> {
  const prs = new Map<string, PullRequest>();
  for (const pr of commits.flatMap((c) => c.pullRequests))
    prs.set(approvalKey(pr.number, pr.head.sha), pr);
  const approved = new Set<string>();
  for (const [key, pr] of prs) {
    const statuses = await api.listStatuses(pr.head.sha);
    if (isApprovalRecordedFor(statuses, ctx.cfg, ctx.appBotLogin, pr.number)) approved.add(key);
  }
  return approved;
}

async function ensurePullRequest(
  api: GitHubApi,
  existing: PullRequest | undefined,
  input: { head: string; base: string; title: string; body: string },
): Promise<PullRequest> {
  if (existing) {
    await api.updatePullRequest(existing.number, { title: input.title, body: input.body });
    return api.getPullRequest(existing.number);
  }
  return api.createPullRequest(input);
}

async function syncMainIntoDev(ctx: PromotionContext, mainSha: string): Promise<PromotionOutcome> {
  const { api, cfg, log } = ctx;
  const [existing] = await api.findOpenPullRequests(cfg.mainBranch, cfg.devBranch);
  const pr = await ensurePullRequest(api, existing, {
    head: cfg.mainBranch,
    base: cfg.devBranch,
    title: `chore(delivery): sync ${cfg.mainBranch} → ${cfg.devBranch}`,
    body: [
      SYNC_MARKER,
      `Merges \`${cfg.mainBranch}\` (\`${short(mainSha)}\`) back into \`${cfg.devBranch}\` so the next promotion`,
      `PR is up to date with \`${cfg.mainBranch}\`. Verified content-neutral: it does not change any file in \`${cfg.devBranch}\`.`,
    ].join('\n'),
  });
  if (pr.head.sha !== mainSha)
    return { status: 'superseded', reason: `${cfg.mainBranch} moved during sync` };
  const result = await api.enableAutoMerge(pr, PROMOTION_MERGE_METHOD, mainSha);
  if (result === 'head-moved')
    return { status: 'superseded', reason: `${cfg.mainBranch} moved during sync` };
  if (result === 'clean') await api.mergePullRequest(pr.number, mainSha, PROMOTION_MERGE_METHOD);
  log.info(
    `Sync PR #${pr.number} (${cfg.mainBranch} → ${cfg.devBranch}) set to merge at ${mainSha}.`,
  );
  return { status: 'sync-pending', pr: pr.number };
}

export async function runPromotion(ctx: PromotionContext): Promise<PromotionOutcome> {
  const { api, cfg, log } = ctx;
  const devSha = await requireBranch(api, cfg.devBranch);
  const mainSha = await requireBranch(api, cfg.mainBranch);
  // Fail closed: switch off any existing promotion auto-merge first. It is
  // re-enabled (bound to the current dev SHA) only at the end of a run that
  // completes with a "promote" decision, so an error, timeout or early return
  // can never leave an auto-merge armed for content nobody evaluated.
  const [stale] = await api.findOpenPullRequests(cfg.devBranch, cfg.mainBranch);
  if (stale?.autoMergeEnabled) await api.disableAutoMerge(stale);

  const comparison = await api.compare(mainSha, devSha);
  const [devCommit, mainCommit] = [await api.getCommit(devSha), await api.getCommit(mainSha)];

  // Step 1: dev must contain main.
  if (comparison.behindBy > 0) {
    const sync = evaluateSync({
      mainSha,
      mainTree: mainCommit.treeSha,
      devTree: devCommit.treeSha,
      mergeBaseSha: comparison.mergeBase.sha,
      mergeBaseTree: comparison.mergeBase.treeSha,
    });
    if (sync === 'blocked') {
      const reason = `${cfg.mainBranch} has changes that ${cfg.devBranch} does not contain; sync manually`;
      await api.createStatus(devSha, {
        state: 'failure',
        context: cfg.promotionContext,
        description: reason,
      });
      log.warn(reason);
      return { status: 'sync-blocked', reason };
    }
    if (sync === 'sync') return syncMainIntoDev(ctx, mainSha);
  }

  // Step 2: classify main..dev.
  const commits = await rangeCommits(api, comparison.commits, cfg.devBranch);
  const decision = evaluatePromotion(
    {
      devTree: devCommit.treeSha,
      mainTree: mainCommit.treeSha,
      commits,
      totalCommits: comparison.totalCommits,
      files: comparison.files,
      filesTruncated: comparison.filesTruncated,
      approvedPullRequests: await approvedPullRequests(api, commits, ctx),
    },
    cfg,
  );
  if (decision.action === 'nothing-to-promote') {
    log.info(`${cfg.mainBranch} already has the content of ${cfg.devBranch}; nothing to promote.`);
    return { status: 'up-to-date' };
  }

  const [existing] = await api.findOpenPullRequests(cfg.devBranch, cfg.mainBranch);
  const pr = await ensurePullRequest(api, existing, {
    head: cfg.devBranch,
    base: cfg.mainBranch,
    title: `Promote ${cfg.devBranch} → ${cfg.mainBranch} (${devSha.slice(0, 7)})`,
    body: promotionBody(decision, devSha, cfg),
  });
  if (pr.head.sha !== devSha)
    return { status: 'superseded', reason: `${cfg.devBranch} moved; a newer run decides` };

  if (decision.action === 'blocked') {
    if (pr.autoMergeEnabled) await api.disableAutoMerge(pr);
    const reasons = decision.blockers.map((b) => b.reason);
    await api.createStatus(devSha, {
      state: 'failure',
      context: cfg.promotionContext,
      description: `Not promoted automatically: ${decision.blockers.length} unapproved item(s)`,
    });
    log.warn(`Promotion PR #${pr.number} left for manual review: ${reasons.join('; ')}`);
    return { status: 'promotion-blocked', pr: pr.number, sha: devSha, reasons };
  }

  await api.createStatus(devSha, {
    state: 'success',
    context: cfg.promotionContext,
    description:
      `Approved for promotion: ${decision.pullRequests.map((p) => `#${p.number}`).join(', ') || 'neutral only'}`.slice(
        0,
        140,
      ),
  });
  if (pr.autoMergeEnabled) await api.disableAutoMerge(pr); // re-bind to devSha
  const result = await api.enableAutoMerge(pr, PROMOTION_MERGE_METHOD, devSha);
  if (result === 'head-moved')
    return { status: 'superseded', reason: `${cfg.devBranch} moved; a newer run decides` };
  if (result === 'clean') {
    const merged = await api.mergePullRequest(pr.number, devSha, PROMOTION_MERGE_METHOD);
    if (merged === 'merged') return { status: 'promotion-merged', pr: pr.number, sha: devSha };
    if (merged === 'head-moved')
      return { status: 'superseded', reason: `${cfg.devBranch} moved; a newer run decides` };
    throw new Error(`Promotion PR #${pr.number} could not be merged (${merged}).`);
  }
  log.info(`Promotion PR #${pr.number} will auto-merge ${devSha} after required checks.`);
  return { status: 'promotion-auto-merge', pr: pr.number, sha: devSha };
}
