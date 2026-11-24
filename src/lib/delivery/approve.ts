/**
 * Handles `/publish-approve <sha>` comments on pull requests (issue_comment).
 *
 * Runs from the default branch's workflow definition and never checks out PR
 * code. A valid approval is recorded as an App-authored commit status on the
 * exact head SHA, naming the PR, the approver and the comment (the audit trail
 * the merge gate re-verifies). If CI for that SHA already passed, the PR is
 * merged right away; otherwise delivery-merge.yml merges it when CI completes.
 * No native auto-merge is used for feature PRs.
 */
import type { DeliveryConfig } from './config.ts';
import { mergeIfApproved, type MergeOutcome } from './merge.ts';
import {
  commenterMayApprove,
  evaluateApproval,
  formatApprovalRecord,
  parseApprovalCommand,
  type Commenter,
} from './policy.ts';
import type { CiApi, GitHubApi, Logger } from './types.ts';

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
  /** Approval recorded; the PR merges when CI for this SHA passes. */
  | { status: 'approved'; sha: string; merge: MergeOutcome['status'] }
  | { status: 'merged'; sha: string }
  | { status: 'recorded'; sha: string };

export interface ApprovalContext {
  api: GitHubApi;
  ci: CiApi;
  cfg: DeliveryConfig;
  appBotLogin: string;
  log: Logger;
}

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

  // Audit record bound to repository (where it lives), SHA (what it is on),
  // PR, approver and comment — written with the App identity.
  await api.createStatus(sha, {
    state: 'success',
    context: cfg.approvalContext,
    description: formatApprovalRecord({
      pr: number,
      approver: commenter.login,
      commentId: event.comment.id,
    }),
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

  const merge = await mergeIfApproved(ctx, number, sha);
  const short = `\`${sha.slice(0, 12)}\``;
  switch (merge.status) {
    case 'merged':
      await api.createComment(
        number,
        `Publish approved for ${short} by ${commenter.login} and merged into \`${cfg.devBranch}\` (squash).`,
      );
      return { status: 'merged', sha };
    case 'already-merged':
      await api.createComment(
        number,
        `Publish approval for ${short} recorded; this commit is already merged into \`${cfg.devBranch}\`.`,
      );
      return { status: 'merged', sha };
    case 'waiting-for-ci':
      await api.createComment(
        number,
        `Publish approved for ${short} by ${commenter.login}. The delivery App merges it into ` +
          `\`${cfg.devBranch}\` when CI passes for exactly this commit. New commits need a new approval.`,
      );
      return { status: 'approved', sha, merge: merge.status };
    case 'ci-failed':
      await api.createComment(
        number,
        `Publish approval for ${short} recorded, but CI failed for this commit (${merge.reason}). ` +
          'Nothing was merged. Re-run CI (it merges on success) or push a fix and approve the new head.',
      );
      return { status: 'approved', sha, merge: merge.status };
    case 'stale':
      await api.createComment(
        number,
        `Head moved after approval of ${short} — nothing was merged. Approve the new head.`,
      );
      return { status: 'rejected', reasons: [merge.reason] };
    case 'not-mergeable':
      await api.createComment(
        number,
        `Publish approval for ${short} recorded, but GitHub refused the merge (${merge.reason}). ` +
          'Nothing was merged. Resolve it, then approve the new head.',
      );
      return { status: 'rejected', reasons: [merge.reason] };
    case 'not-approved':
      await api.createComment(
        number,
        [
          `**Publish approval rejected** for ${short} — nothing was merged.`,
          '',
          ...merge.reasons.map((r) => `- ${r}`),
        ].join('\n'),
      );
      return { status: 'rejected', reasons: merge.reasons };
  }
}
