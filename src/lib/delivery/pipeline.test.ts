/**
 * End-to-end scenarios of the delivery pipeline against the in-memory GitHub:
 * approval → auto-merge into dev → branch cleanup → promotion → main.
 */
import { describe, expect, it } from 'vitest';
import { handleApprovalComment, type IssueCommentEvent } from './approve.ts';
import { runPromotion } from './promote.ts';
import { handlePullRequestEvent } from './pull-request-event.ts';
import type { FakeGitHub } from './testing.ts';
import {
  APP_BOT,
  DEPENDABOT,
  OWNER,
  REPO,
  seededRepo,
  silentLogger,
  testConfig,
} from './testing.ts';

const cfg = testConfig();

function ctx(gh: FakeGitHub) {
  return { api: gh, cfg, appBotLogin: APP_BOT, log: silentLogger() };
}

function approval(
  number: number,
  headSha: string,
  who: { login: string; type?: string; association?: string } = { login: OWNER.login },
): IssueCommentEvent {
  return {
    action: 'created',
    repository: { full_name: REPO },
    issue: { number, pull_request: {} },
    comment: {
      id: 1000 + number,
      body: `/publish-approve ${headSha}`,
      html_url: `https://github.com/${REPO}/pull/${number}#issuecomment-1`,
      author_association: who.association ?? 'OWNER',
      user: { login: who.login, type: who.type ?? 'User' },
    },
  };
}

/** feature branch with one commit + open PR into dev. */
function featurePr(gh: FakeGitHub, name = 'feature/hero', files = ['src/site/content.ts']) {
  gh.branches.set(name, gh.branches.get('dev') ?? '');
  gh.push(name, files);
  return gh.openPr({ head: name, base: 'dev', files });
}

describe('approval → merge into dev', () => {
  it('authorized PR with passing CI is auto-merged (squash) at the approved SHA', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const out = await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    expect(out).toEqual({ status: 'auto-merge-enabled', sha: pr.head.sha });
    expect(gh.statusOf(pr.head.sha, cfg.approvalContext)).toMatchObject({
      state: 'success',
      creatorLogin: APP_BOT,
    });
    expect(gh.merges).toHaveLength(0); // waits for CI

    gh.finishChecks(pr.number, true);
    expect(gh.merges).toEqual([{ number: pr.number, method: 'SQUASH', sha: pr.head.sha }]);
    expect(gh.pulls.get(pr.number)?.merged).toBe(true);
  });

  it('failed CI blocks the merge; the PR stays open', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    gh.finishChecks(pr.number, false);
    expect(gh.merges).toHaveLength(0);
    expect(gh.pulls.get(pr.number)?.state).toBe('open');
  });

  it('merges immediately (still SHA-bound) when checks were already green', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.finishChecks(pr.number, true);
    const out = await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    expect(out.status).toBe('merged');
    expect(gh.merges).toHaveLength(1);
  });

  it.each([
    ['a stranger', { login: 'stranger', association: 'NONE' }],
    ['a contributor', { login: 'contributor', association: 'CONTRIBUTOR' }],
    ['a collaborator not on the approver list', { login: 'helper', association: 'COLLABORATOR' }],
    ['a bot', { login: 'owner[bot]', type: 'Bot', association: 'OWNER' }],
    ['the owner login with a forged association', { login: 'owner', association: 'NONE' }],
  ])('unauthorized PR stays open: command from %s is ignored silently', async (_label, who) => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const out = await handleApprovalComment(approval(pr.number, pr.head.sha, who), ctx(gh));
    expect(out.status).toBe('ignored');
    expect(gh.statuses.size).toBe(0);
    expect(gh.autoMerge.size).toBe(0);
    expect(gh.comments).toHaveLength(0);
    gh.finishChecks(pr.number, true);
    expect(gh.merges).toHaveLength(0);
  });

  it('without any approval a green PR is never merged by the pipeline', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.finishChecks(pr.number, true);
    await runPromotion(ctx(gh));
    expect(gh.merges).toHaveLength(0);
    expect(gh.pulls.get(pr.number)?.state).toBe('open');
  });

  it.each([
    ['Dependabot', () => ({ author: DEPENDABOT, head: 'dependabot/npm/astro-8' })],
    ['a fork', () => ({ fork: true })],
    ['a draft', () => ({ draft: true })],
    ['a non-feature branch', () => ({ head: 'hotfix/x' })],
  ])('rejects approval of %s', async (_label, variant) => {
    const { gh } = seededRepo();
    const v = variant() as {
      author?: typeof DEPENDABOT;
      head?: string;
      fork?: boolean;
      draft?: boolean;
    };
    const head = v.head ?? 'feature/x';
    gh.branches.set(head, gh.branches.get('dev') ?? '');
    gh.push(head);
    const pr = gh.openPr({
      head,
      base: 'dev',
      ...(v.author ? { author: v.author } : {}),
      fork: v.fork ?? false,
      draft: v.draft ?? false,
    });
    const out = await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    expect(out.status).toBe('rejected');
    expect(gh.autoMerge.size).toBe(0);
    expect(gh.statuses.size).toBe(0);
    expect(gh.comments.at(-1)?.body).toMatch(/rejected/);
  });

  it('rejects an approval of a stale SHA (new commits after review)', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const reviewed = pr.head.sha;
    gh.pushToPr(pr.number);
    const out = await handleApprovalComment(approval(pr.number, reviewed), ctx(gh));
    expect(out.status).toBe('rejected');
    expect(gh.autoMerge.size).toBe(0);
  });

  it('rejects PRs that change the pipeline or workflows (needs a human merge)', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh, 'feature/ci', ['.github/workflows/ci.yml']);
    const out = await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    expect(out).toMatchObject({ status: 'rejected' });
    expect(gh.autoMerge.size).toBe(0);
  });

  it('new commits after approval disable auto-merge (pull_request_target synchronize)', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    gh.pushToPr(pr.number);
    const out = await handlePullRequestEvent(
      {
        action: 'synchronize',
        repository: { full_name: REPO },
        pull_request: { number: pr.number },
      },
      ctx(gh),
    );
    expect(out.status).toBe('auto-merge-disabled');
    gh.finishChecks(pr.number, true);
    expect(gh.merges).toHaveLength(0);
  });

  it('retargeting an approved PR from dev to main revokes its auto-merge', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    const live = gh.pulls.get(pr.number);
    if (live) live.base.ref = 'main';
    const out = await handlePullRequestEvent(
      { action: 'edited', repository: { full_name: REPO }, pull_request: { number: pr.number } },
      ctx(gh),
    );
    expect(out.status).toBe('auto-merge-disabled');
    expect(gh.autoMerge.size).toBe(0);
  });

  it('the guard leaves pipeline-owned sync/promotion PRs alone', async () => {
    const { gh } = seededRepo();
    const feature = featurePr(gh);
    await handleApprovalComment(approval(feature.number, feature.head.sha), ctx(gh));
    gh.finishChecks(feature.number, true);
    await runPromotion(ctx(gh));
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    const out = await handlePullRequestEvent(
      {
        action: 'edited',
        repository: { full_name: REPO },
        pull_request: { number: promo?.number ?? 0 },
      },
      ctx(gh),
    );
    expect(out.status).toBe('auto-merge-kept');
    expect(promo?.autoMergeEnabled).toBe(true);
  });

  it('a status forged by another identity is not an approval', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.autoMerge.set(pr.number, { method: 'SQUASH', sha: pr.head.sha });
    const live = gh.pulls.get(pr.number);
    if (live) live.autoMergeEnabled = true;
    gh.addStatus(pr.head.sha, {
      context: cfg.approvalContext,
      state: 'success',
      creatorLogin: 'github-actions[bot]',
      description: 'forged',
    });
    const out = await handlePullRequestEvent(
      {
        action: 'synchronize',
        repository: { full_name: REPO },
        pull_request: { number: pr.number },
      },
      ctx(gh),
    );
    expect(out.status).toBe('auto-merge-disabled');
  });

  it('duplicate approval events do not cause duplicate merges', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const event = approval(pr.number, pr.head.sha);
    await handleApprovalComment(event, ctx(gh));
    await handleApprovalComment(event, ctx(gh));
    gh.finishChecks(pr.number, true);
    const replay = await handleApprovalComment(event, ctx(gh)); // replay after merge
    expect(gh.merges).toHaveLength(1);
    expect(replay.status).toBe('recorded');
  });

  it('a failing API call stops safely before anything is merged', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.failOn.set('createStatus', new Error('GitHub is down'));
    await expect(handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh))).rejects.toThrow(
      'GitHub is down',
    );
    expect(gh.autoMerge.size).toBe(0);
    gh.finishChecks(pr.number, true);
    expect(gh.merges).toHaveLength(0);
  });
});

describe('branch cleanup after merge', () => {
  const closed = (number: number) => ({
    action: 'closed',
    repository: { full_name: REPO },
    pull_request: { number },
  });

  it('deletes the merged feature/* branch', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    gh.finishChecks(pr.number, true);
    const out = await handlePullRequestEvent(closed(pr.number), ctx(gh));
    expect(out).toEqual({ status: 'branch-deleted', branch: 'feature/hero' });
    expect(gh.branches.has('feature/hero')).toBe(false);
    // duplicate event: nothing left to delete, no error
    expect(await handlePullRequestEvent(closed(pr.number), ctx(gh))).toMatchObject({
      status: 'branch-kept',
    });
    expect(gh.deleted).toEqual(['feature/hero']);
  });

  it('never deletes an unmerged branch or one with commits pushed after the merge', async () => {
    const { gh } = seededRepo();
    const open = featurePr(gh, 'feature/a');
    const pr = gh.pulls.get(open.number);
    if (pr) pr.state = 'closed'; // closed without merge
    expect(await handlePullRequestEvent(closed(open.number), ctx(gh))).toMatchObject({
      status: 'branch-kept',
    });

    const merged = featurePr(gh, 'feature/b');
    gh.manualMerge(merged.number);
    gh.push('feature/b'); // someone kept working on the branch
    expect(await handlePullRequestEvent(closed(merged.number), ctx(gh))).toMatchObject({
      status: 'branch-kept',
    });
    expect(gh.deleted).toEqual([]);
  });

  it('never deletes dev or main (promotion and sync PRs)', async () => {
    const { gh } = seededRepo();
    gh.push('dev');
    const promo = gh.openPr({ head: 'dev', base: 'main' });
    gh.manualMerge(promo.number, 'MERGE');
    const sync = gh.openPr({ head: 'main', base: 'dev' });
    gh.manualMerge(sync.number, 'MERGE');
    await handlePullRequestEvent(closed(promo.number), ctx(gh));
    await handlePullRequestEvent(closed(sync.number), ctx(gh));
    expect(gh.deleted).toEqual([]);
    expect(gh.branches.has('dev') && gh.branches.has('main')).toBe(true);
  });
});

describe('promotion dev → main', () => {
  async function approvedAndMerged(gh: FakeGitHub, name: string, files?: string[]) {
    const pr = featurePr(gh, name, files);
    await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh));
    gh.finishChecks(pr.number, true);
    return pr;
  }

  it('creates one promotion PR and auto-merges it (merge commit) only after its CI passes', async () => {
    const { gh } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    const devSha = gh.branches.get('dev');
    const out = await runPromotion(ctx(gh));
    expect(out).toMatchObject({ status: 'promotion-auto-merge', sha: devSha });
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    expect(promo).toMatchObject({ head: { ref: 'dev' }, author: { login: APP_BOT } });
    expect(gh.merges).toHaveLength(1); // only the feature merge so far

    gh.finishChecks(promo?.number ?? 0, true); // CI on the promotion PR
    expect(gh.merges.at(-1)).toMatchObject({ method: 'MERGE', sha: devSha });
    expect(gh.commits.get(gh.branches.get('main') ?? '')?.treeSha).toBe(
      gh.commits.get(devSha ?? '')?.treeSha,
    );
  });

  it('matches dev commits to PRs by merge commit even if the association API returns nothing', async () => {
    const { gh } = seededRepo();
    gh.associationApiWorks = false;
    await approvedAndMerged(gh, 'feature/a');
    expect((await runPromotion(ctx(gh))).status).toBe('promotion-auto-merge');
  });

  it('a second approved feature re-binds the promotion auto-merge to the new dev SHA', async () => {
    const { gh } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    await runPromotion(ctx(gh));
    await approvedAndMerged(gh, 'feature/b');
    const devSha = gh.branches.get('dev') ?? '';
    expect(await runPromotion(ctx(gh))).toMatchObject({
      status: 'promotion-auto-merge',
      sha: devSha,
    });
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    expect(gh.autoMerge.get(promo?.number ?? 0)).toEqual({ method: 'MERGE', sha: devSha });
  });

  it('failed CI on the promotion PR keeps main unchanged', async () => {
    const { gh, root } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    await runPromotion(ctx(gh));
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    gh.finishChecks(promo?.number ?? 0, false);
    expect(gh.branches.get('main')).toBe(root);
  });

  it('does not promote unapproved PRs: the promotion PR stays open without auto-merge', async () => {
    const { gh, root } = seededRepo();
    const pr = featurePr(gh, 'feature/manual');
    gh.manualMerge(pr.number); // merged by a human, never approved for publishing
    const out = await runPromotion(ctx(gh));
    expect(out).toMatchObject({ status: 'promotion-blocked' });
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    gh.finishChecks(promo?.number ?? 0, true);
    expect(gh.branches.get('main')).toBe(root);
    expect(gh.statusOf(gh.branches.get('dev') ?? '', cfg.promotionContext)?.state).toBe('failure');
  });

  it('unrelated dev changes block the promotion even next to an approved PR', async () => {
    const { gh, root } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    const direct = gh.push('dev', ['src/other.ts']); // admin push without PR
    const out = await runPromotion(ctx(gh));
    expect(out.status).toBe('promotion-blocked');
    if (out.status === 'promotion-blocked') expect(out.reasons.join(' ')).toMatch(/direct push/);
    expect(direct).toBeTruthy();
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    expect(promo?.autoMergeEnabled).toBe(false);
    gh.finishChecks(promo?.number ?? 0, true);
    expect(gh.branches.get('main')).toBe(root);
  });

  it('Dependabot changes are never promoted automatically', async () => {
    const { gh, root } = seededRepo();
    gh.branches.set('dependabot/npm/x', gh.branches.get('dev') ?? '');
    gh.push('dependabot/npm/x', ['package.json']);
    const bump = gh.openPr({
      head: 'dependabot/npm/x',
      base: 'dev',
      author: DEPENDABOT,
      files: ['package.json'],
    });
    gh.manualMerge(bump.number);
    const out = await runPromotion(ctx(gh));
    expect(out.status).toBe('promotion-blocked');
    if (out.status === 'promotion-blocked') expect(out.reasons.join(' ')).toMatch(/Dependabot/);
    expect(gh.branches.get('main')).toBe(root);
  });

  it('pipeline/workflow changes in dev are never promoted automatically', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh, 'feature/ci', ['.github/workflows/deploy-pages.yml']);
    gh.manualMerge(pr.number);
    expect((await runPromotion(ctx(gh))).status).toBe('promotion-blocked');
  });

  it('a later approval of an already merged PR unblocks the promotion', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh, 'feature/late');
    gh.manualMerge(pr.number);
    expect((await runPromotion(ctx(gh))).status).toBe('promotion-blocked');
    expect((await handleApprovalComment(approval(pr.number, pr.head.sha), ctx(gh))).status).toBe(
      'recorded',
    );
    expect((await runPromotion(ctx(gh))).status).toBe('promotion-auto-merge');
  });

  it('new unapproved dev commits revoke auto-merge on an existing promotion PR', async () => {
    const { gh, root } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    await runPromotion(ctx(gh));
    gh.push('dev', ['src/sneaky.ts']);
    expect((await runPromotion(ctx(gh))).status).toBe('promotion-blocked');
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    gh.finishChecks(promo?.number ?? 0, true);
    expect(gh.branches.get('main')).toBe(root);
  });

  it('duplicate push events reuse the single promotion PR and merge once', async () => {
    const { gh } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    await runPromotion(ctx(gh));
    await runPromotion(ctx(gh));
    const promos = [...gh.pulls.values()].filter((p) => p.base.ref === 'main');
    expect(promos).toHaveLength(1);
    gh.finishChecks(promos[0]?.number ?? 0, true);
    expect(await runPromotion(ctx(gh))).not.toMatchObject({ status: 'promotion-auto-merge' });
    expect(gh.merges.filter((m) => m.method === 'MERGE')).toHaveLength(1);
  });

  it('after a promotion: syncs main back into dev (content-neutral), then stops — no loop', async () => {
    const { gh } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    await runPromotion(ctx(gh));
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    gh.finishChecks(promo?.number ?? 0, true); // main now has a merge commit dev lacks
    const devTreeBefore = gh.commits.get(gh.branches.get('dev') ?? '')?.treeSha;

    const sync = await runPromotion(ctx(gh)); // push to main
    expect(sync.status).toBe('sync-pending');
    const syncPr = [...gh.pulls.values()].find(
      (p) => p.head.ref === 'main' && p.base.ref === 'dev',
    );
    gh.finishChecks(syncPr?.number ?? 0, true);
    expect(gh.commits.get(gh.branches.get('dev') ?? '')?.treeSha).toBe(devTreeBefore);

    expect(await runPromotion(ctx(gh))).toEqual({ status: 'up-to-date' }); // push to dev
    expect([...gh.pulls.values()].filter((p) => p.state === 'open')).toHaveLength(0);

    // The next approved feature is promoted normally on top of the sync commit.
    await approvedAndMerged(gh, 'feature/b');
    expect((await runPromotion(ctx(gh))).status).toBe('promotion-auto-merge');
  });

  it('refuses to sync when main has content dev does not have', async () => {
    const { gh } = seededRepo();
    gh.push('main', ['src/hotfix.ts']);
    const out = await runPromotion(ctx(gh));
    expect(out.status).toBe('sync-blocked');
    expect([...gh.pulls.values()]).toHaveLength(0);
  });

  it('nothing to promote when main already has dev content', async () => {
    const { gh } = seededRepo();
    expect(await runPromotion(ctx(gh))).toEqual({ status: 'up-to-date' });
    expect(gh.pulls.size).toBe(0);
  });

  it('a failing run leaves an existing promotion auto-merge switched OFF (fail closed)', async () => {
    const { gh, root } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    await runPromotion(ctx(gh));
    const promo = [...gh.pulls.values()].find((p) => p.base.ref === 'main');
    expect(promo?.autoMergeEnabled).toBe(true);
    // An unapproved change lands in dev, and the next promotion run crashes mid-way.
    const other = featurePr(gh, 'feature/unapproved');
    gh.manualMerge(other.number);
    gh.failOn.set('getCommit', new Error('rate limited'));
    await expect(runPromotion(ctx(gh))).rejects.toThrow('rate limited');
    expect(promo?.autoMergeEnabled).toBe(false);
    gh.finishChecks(promo?.number ?? 0, true);
    expect(gh.branches.get('main')).toBe(root);
  });

  it('a failure while creating the promotion PR stops without merging', async () => {
    const { gh, root } = seededRepo();
    await approvedAndMerged(gh, 'feature/a');
    gh.failOn.set('createPullRequest', new Error('boom'));
    await expect(runPromotion(ctx(gh))).rejects.toThrow('boom');
    expect(gh.branches.get('main')).toBe(root);
  });
});
