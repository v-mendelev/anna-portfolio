/**
 * Handles `/publish-approve <sha>` comments on pull requests (issue_comment).
 *
 * Runs from the default branch's workflow definition and never checks out PR
 * code. On success it records the approval as an App-authored commit status on
 * the exact head SHA (the audit trail) and enables GitHub native auto-merge
 * bound to that SHA; required checks still gate the merge.
 */
import type { DeliveryConfig } from './config.ts';
import {
  commenterMayApprove,
  evaluateApproval,
  parseApprovalCommand,
  type Commenter,
} from './policy.ts';
import type { GitHubApi, Logger } from './types.ts';

export interface IssueCommentEvent {
  action: string;
  repository: { full_name: string };
  issue: { number: number; pull_request?: unknown };
  comment: {
    id: number;
    body: string;
    html_url: string;
    author_association: string;
    user: { login: string; type: string };
  };
}

export type ApprovalOutcome =
  | { status: 'ignored'; reason: string }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'auto-merge-enabled'; sha: string }
  | { status: 'merged'; sha: string }
  | { status: 'recorded'; sha: string };

export interface ApprovalContext {
  api: GitHubApi;
  cfg: DeliveryConfig;
  appBotLogin: string;
  log: Logger;
}

export const FEATURE_MERGE_METHOD = 'SQUASH';

export async function handleApprovalComment(
  event: IssueCommentEvent,
  ctx: ApprovalContext,
): Promise<ApprovalOutcome> {
  const { api, cfg, log } = ctx;
  if (event.action !== 'created')
    return { status: 'ignored', reason: 'comment was not newly created' };
  if (!event.issue.pull_request) return { status: 'ignored', reason: 'not a pull request' };
  const sha = parseApprovalCommand(event.comment.body);
  if (sha === null) return { status: 'ignored', reason: 'not an approval command' };

  const commenter: Commenter = {
    login: event.comment.user.login,
    type: event.comment.user.type,
    association: event.comment.author_association,
  };
  // Unauthorized commenters get no reply: nothing to amplify, nothing to learn.
  if (!commenterMayApprove(commenter, cfg)) {
    log.warn(`Ignoring approval command from unauthorized account on PR #${event.issue.number}.`);
    return { status: 'ignored', reason: 'commenter is not an authorized approver' };
  }

  const number = event.issue.number;
  const pr = await api.getPullRequest(number);
  const { files, truncated } = await api.listPullRequestFiles(number);
  const verdict = evaluateApproval(
    {
      repository: event.repository.full_name,
      commenter,
      sha,
      pr,
      files,
      filesTruncated: truncated,
    },
    cfg,
  );

  if (verdict.decision === 'reject') {
    await api.createComment(
      number,
      [
        `**Publish approval rejected** for \`${sha.slice(0, 12)}\` — nothing was merged.`,
        '',
        ...verdict.reasons.map((r) => `- ${r}`),
      ].join('\n'),
    );
    return { status: 'rejected', reasons: verdict.reasons };
  }

  // Audit record: who approved which exact SHA, written with the App identity.
  await api.createStatus(sha, {
    state: 'success',
    context: cfg.approvalContext,
    description: `Approved by ${commenter.login} (comment ${event.comment.id})`.slice(0, 140),
    targetUrl: event.comment.html_url,
  });
  log.info(`Recorded approval of ${sha} on PR #${number}.`);

  if (verdict.decision === 'record-merged') {
    await api.createComment(
      number,
      `Approval for \`${sha.slice(0, 12)}\` recorded. This PR is already merged into \`${cfg.devBranch}\`; ` +
        'it will be included in the next automatic promotion to `main` (next push to dev, or run the ' +
        '"Delivery · promote" workflow).',
    );
    return { status: 'recorded', sha };
  }

  const result = await api.enableAutoMerge(pr, FEATURE_MERGE_METHOD, sha);
  if (result === 'head-moved') {
    await api.createComment(
      number,
      `Head moved after approval of \`${sha.slice(0, 12)}\` — auto-merge NOT enabled. Re-approve the new head.`,
    );
    return { status: 'rejected', reasons: ['head moved after approval'] };
  }
  if (result === 'clean') {
    // Already mergeable (all required checks green): merge now, still bound to the SHA.
    const merged = await api.mergePullRequest(number, sha, FEATURE_MERGE_METHOD);
    if (merged === 'merged') {
      log.info(`PR #${number} merged at ${sha}.`);
      return { status: 'merged', sha };
    }
    const fresh = await api.getPullRequest(number);
    if (fresh.merged && fresh.head.sha === sha) return { status: 'merged', sha };
    await api.createComment(
      number,
      `Could not merge \`${sha.slice(0, 12)}\` (${merged}). Nothing was merged.`,
    );
    return { status: 'rejected', reasons: [`merge failed: ${merged}`] };
  }

  await api.createComment(
    number,
    `Publish approved for \`${sha.slice(0, 12)}\` by ${commenter.login}. Auto-merge (squash) is enabled and ` +
      `will merge into \`${cfg.devBranch}\` once all required checks pass. New commits revoke it.`,
  );
  return { status: 'auto-merge-enabled', sha };
}
