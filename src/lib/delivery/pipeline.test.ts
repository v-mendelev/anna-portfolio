/**
 * End-to-end scenarios of the delivery pipeline against the in-memory GitHub:
 * approval → merge at the approved SHA when CI passed (workflow_run) → branch
 * cleanup → promotion → main.
 */
import { describe, expect, it } from 'vitest';
import { handleApprovalComment, type IssueCommentEvent } from './approve.ts';
import { cleanupMergedBranches } from './cleanup.ts';
import { formatApprovalRecord } from './policy.ts';
import { runPromotion } from './promote.ts';
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
import type { Actor, WorkflowRun } from './types.ts';
import { handleWorkflowRun, type WorkflowRunEvent } from './workflow-run.ts';

const cfg = testConfig();

function ctx(gh: FakeGitHub) {
  return { api: gh, ci: gh, cfg, appBotLogin: APP_BOT, log: silentLogger() };
}

/** The approver writes `/publish-approve <sha>` on PR `number` (stored in the fake + event). */
function approval(
  gh: FakeGitHub,
  number: number,
  headSha: string,
  who: { login: string; type?: string; association?: string } = { login: OWNER.login },
): IssueCommentEvent {
  const author: Actor = { login: who.login, type: who.type ?? 'User' };
  const association = who.association ?? 'OWNER';
  const c = gh.writeComment(number, `/publish-approve ${headSha}`, author, association);
  return {
    action: 'created',
    repository: { full_name: REPO },
    issue: { number, pull_request: {} },
    comment: {
      id: c.id,
      body: c.body,
      html_url: `https://github.com/${REPO}/pull/${number}#issuecomment-${c.id}`,
      author_association: association,
      user: author,
    },
  };
}

function runEvent(run: WorkflowRun, headSha = run.headSha): WorkflowRunEvent {
  return {
    action: 'completed',
    repository: { full_name: REPO },
    workflow_run: { id: run.id, head_sha: headSha },
  };
}

/** CI finishes for the PR's current head; returns the workflow_run event GitHub would send. */
function ciDone(gh: FakeGitHub, number: number, passed = true): WorkflowRunEvent {
  return runEvent(gh.finishChecks(number, passed));
}

/** feature branch with one commit + open PR into dev. */
function featurePr(gh: FakeGitHub, name = 'feature/hero', files = ['src/site/content.ts']) {
  gh.branches.set(name, gh.branches.get('dev') ?? '');
  gh.push(name, files);
  return gh.openPr({ head: name, base: 'dev', files });
}

function statuses(out: Awaited<ReturnType<typeof handleWorkflowRun>>): string[] {
  return out.status === 'evaluated' ? out.results.map((r) => r.status) : [out.status];
}

describe('approval → merge into dev at the approved SHA', () => {
  it.each(['OWNER', 'CONTRIBUTOR', 'NONE'])(
    "the repository owner's real comment event is accepted (author_association %s)",
    async (association) => {
      const { gh } = seededRepo();
      const pr = featurePr(gh);
      await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)); // CI already green, unapproved
      const event = approval(gh, pr.number, pr.head.sha, { login: 'owner', association });
      expect(await handleApprovalComment(event, ctx(gh))).toEqual({
        status: 'merged',
        sha: pr.head.sha,
      });
      expect(gh.merges).toEqual([{ number: pr.number, method: 'SQUASH', sha: pr.head.sha }]);
    },
  );

  it('valid approval, then successful CI: the App merges (squash) exactly that SHA', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    const out = await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(out).toEqual({ status: 'approved', sha: pr.head.sha, merge: 'waiting-for-ci' });
    expect(gh.statusOf(pr.head.sha, cfg.approvalContext)).toMatchObject({
      state: 'success',
      creatorLogin: APP_BOT,
      description: expect.stringMatching(new RegExp(`^Approved PR #${pr.number} by owner `)),
    });
    expect(gh.merges).toHaveLength(0); // waits for CI
    expect(gh.autoMerge.size).toBe(0); // no native auto-merge for feature PRs

    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual(['merged']);
    expect(gh.merges).toEqual([{ number: pr.number, method: 'SQUASH', sha: pr.head.sha }]);
  });

  it('CI already passed: the approval merges immediately (still SHA-bound)', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    // Green but unapproved: the CI-completed run merges nothing.
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-approved',
    ]);
    expect(gh.merges).toHaveLength(0);
    const out = await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(out).toEqual({ status: 'merged', sha: pr.head.sha });
    expect(gh.merges).toHaveLength(1);
  });

  it('without any approval a green PR is never merged', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    await runPromotion(ctx(gh));
    expect(gh.merges).toHaveLength(0);
    expect(gh.pulls.get(pr.number)?.state).toBe('open');
  });

  it('failed CI: nothing is merged; a later successful re-run of the same SHA merges', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(await handleWorkflowRun(ciDone(gh, pr.number, false), ctx(gh))).toEqual({
      status: 'ignored',
      reason: 'CI did not succeed',
    });
    expect(gh.merges).toHaveLength(0);
    // Approving while the latest CI run is red reports it and merges nothing.
    const again = await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(again).toMatchObject({ status: 'approved', merge: 'ci-failed' });
    expect(gh.merges).toHaveLength(0);
    // Re-run of the same SHA passes → merged.
    gh.startChecks(pr.number);
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual(['merged']);
  });

  it('pending CI: the approval waits; nothing merges until the run completes', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    const out = await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(out).toMatchObject({ merge: 'waiting-for-ci' });
    expect(gh.comments.at(-1)?.body).toMatch(/when CI passes for exactly this commit/);
    expect(gh.merges).toHaveLength(0);
  });

  it.each([
    ['a stranger', { login: 'stranger', association: 'NONE' }],
    ['a contributor', { login: 'contributor', association: 'CONTRIBUTOR' }],
    ['a collaborator not on the approver list', { login: 'helper', association: 'COLLABORATOR' }],
    ['a bot', { login: 'owner[bot]', type: 'Bot', association: 'OWNER' }],
    ['a non-owner claiming the OWNER association', { login: 'mallory', association: 'OWNER' }],
  ])('unauthorized approver: command from %s is ignored silently', async (_label, who) => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const out = await handleApprovalComment(approval(gh, pr.number, pr.head.sha, who), ctx(gh));
    expect(out.status).toBe('ignored');
    expect(gh.statuses.size).toBe(0);
    expect(gh.comments).toHaveLength(0);
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    expect(gh.merges).toHaveLength(0);
  });

  it.each([
    ['Dependabot', () => ({ author: DEPENDABOT, head: 'dependabot/npm/astro-8' })],
    ['a Dependabot-authored feature branch', () => ({ author: DEPENDABOT })],
    ['a fork', () => ({ fork: true })],
    ['a draft', () => ({ draft: true })],
    ['a non-feature branch', () => ({ head: 'hotfix/x' })],
    ['a PR into main', () => ({ base: 'main' })],
  ])('rejects approval of %s and never merges it', async (_label, variant) => {
    const { gh } = seededRepo();
    const v = variant() as {
      author?: typeof DEPENDABOT;
      head?: string;
      base?: string;
      fork?: boolean;
      draft?: boolean;
    };
    const head = v.head ?? 'feature/x';
    gh.branches.set(head, gh.branches.get('dev') ?? '');
    gh.push(head);
    const pr = gh.openPr({
      head,
      base: v.base ?? 'dev',
      ...(v.author ? { author: v.author } : {}),
      fork: v.fork ?? false,
      draft: v.draft ?? false,
    });
    const out = await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(out.status).toBe('rejected');
    expect(gh.statuses.size).toBe(0);
    expect(gh.comments.at(-1)?.body).toMatch(/rejected/);
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    expect(gh.merges).toHaveLength(0);
  });

  it('rejects an approval of a stale SHA (new commits before the approval)', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const reviewed = pr.head.sha;
    gh.pushToPr(pr.number);
    const out = await handleApprovalComment(approval(gh, pr.number, reviewed), ctx(gh));
    expect(out.status).toBe('rejected');
    expect(gh.statuses.size).toBe(0);
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    expect(gh.merges).toHaveLength(0);
  });

  it('new commits after the approval: neither the old nor the new head is merged', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const approved = pr.head.sha;
    gh.startChecks(pr.number);
    await handleApprovalComment(approval(gh, pr.number, approved), ctx(gh));
    const oldRun = gh.runs.at(-1);
    if (!oldRun) throw new Error('no run');
    gh.pushToPr(pr.number); // the head moves before CI of the approved SHA finished
    oldRun.status = 'completed';
    oldRun.conclusion = 'success';
    // CI of the OLD (approved) SHA completes: stale, the head is no longer that SHA.
    expect(statuses(await handleWorkflowRun(runEvent(oldRun), ctx(gh)))).toEqual(['stale']);
    // CI of the NEW head passes: there is no approval for it.
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-approved',
    ]);
    expect(gh.merges).toHaveLength(0);
  });

  it('an approval belongs to one PR: another PR with the same head SHA is not merged', async () => {
    const { gh } = seededRepo();
    const first = featurePr(gh, 'feature/a');
    gh.branches.set('feature/b', first.head.sha); // same commit, second branch + PR
    const second = gh.openPr({ head: 'feature/b', base: 'dev', files: ['src/site/content.ts'] });
    gh.startChecks(first.number);
    await handleApprovalComment(approval(gh, first.number, first.head.sha), ctx(gh));
    const out = await handleWorkflowRun(ciDone(gh, second.number), ctx(gh));
    expect(out.status).toBe('evaluated');
    const result = out.status === 'evaluated' ? out.results[0] : undefined;
    expect(result).toMatchObject({ pr: second.number, status: 'not-approved' });
    expect(result?.status === 'not-approved' ? result.reasons.join(' ') : '').toMatch(
      new RegExp(`belongs to PR #${first.number}`),
    );
    expect(gh.merges).toHaveLength(0);
  });

  it('a retargeted PR (dev → main after the approval) is not merged', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    const live = gh.pulls.get(pr.number);
    if (live) live.base.ref = 'main';
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-approved',
    ]);
    expect(gh.merges).toHaveLength(0);
  });

  it('a PR converted to draft after the approval is not merged', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    const live = gh.pulls.get(pr.number);
    if (live) live.draft = true;
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-approved',
    ]);
    expect(gh.merges).toHaveLength(0);
  });

  it('rejects PRs that change the pipeline or workflows (needs a human merge)', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh, 'feature/ci', ['.github/workflows/ci.yml']);
    const out = await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(out).toMatchObject({ status: 'rejected' });
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    expect(gh.merges).toHaveLength(0);
  });

  it('an approval status forged by another identity is not an approval', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    const c = gh.writeComment(pr.number, `/publish-approve ${pr.head.sha}`);
    gh.addStatus(pr.head.sha, {
      context: cfg.approvalContext,
      state: 'success',
      creatorLogin: 'github-actions[bot]',
      description: formatApprovalRecord({ pr: pr.number, approver: 'owner', commentId: c.id }),
    });
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-approved',
    ]);
    expect(gh.merges).toHaveLength(0);
  });

  it('an edited or deleted approval comment invalidates the approval', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    const event = approval(gh, pr.number, pr.head.sha);
    await handleApprovalComment(event, ctx(gh));
    const stored = gh.issueComments.get(event.comment.id);
    if (stored) stored.body = `/publish-approve ${'0'.repeat(40)}`; // edited afterwards
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-approved',
    ]);
    gh.issueComments.delete(event.comment.id); // deleted
    gh.startChecks(pr.number);
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-approved',
    ]);
    expect(gh.merges).toHaveLength(0);
  });

  it('only the PR’s own successful pull_request run of ci.yml can trigger a merge', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    const run = gh.runs.at(-1);
    if (!run) throw new Error('no run');
    run.status = 'completed';
    run.conclusion = 'success';
    const variants: Partial<WorkflowRun>[] = [
      { path: '.github/workflows/other.yml' },
      { event: 'push' },
      { headRepoFullName: 'evil/site' },
      { headBranch: 'hotfix/x' },
      { conclusion: 'failure' },
    ];
    for (const variant of variants) {
      const original = { ...run };
      Object.assign(run, variant);
      expect((await handleWorkflowRun(runEvent(run), ctx(gh))).status).toBe('ignored');
      Object.assign(run, original);
    }
    // An event that names another SHA than the run itself is ignored as well.
    expect((await handleWorkflowRun(runEvent(run, 'f'.repeat(40)), ctx(gh))).status).toBe(
      'ignored',
    );
    expect(gh.merges).toHaveLength(0);
  });

  it('duplicate workflow_run events and a concurrent approval merge exactly once', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.startChecks(pr.number);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    const event = ciDone(gh, pr.number);
    const [a, b] = await Promise.all([
      handleWorkflowRun(event, ctx(gh)),
      handleWorkflowRun(event, ctx(gh)),
    ]);
    expect([...statuses(a), ...statuses(b)].sort()).toEqual(['already-merged', 'merged']);
    expect(statuses(await handleWorkflowRun(event, ctx(gh)))).toEqual(['already-merged']);
    // A late duplicate approval comment only records; it never merges twice.
    const replay = await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(replay.status).toBe('recorded');
    expect(gh.merges).toHaveLength(1);
  });

  it.each([
    [
      'retargeted to main',
      (gh: FakeGitHub, n: number) => {
        const live = gh.pulls.get(n);
        if (live) live.base.ref = 'main';
      },
    ],
    [
      'converted to draft',
      (gh: FakeGitHub, n: number) => {
        const live = gh.pulls.get(n);
        if (live) live.draft = true;
      },
    ],
    [
      'approval comment deleted',
      (gh: FakeGitHub) => {
        gh.issueComments.clear();
      },
    ],
  ])(
    'state changes while the gate verifies (%s): re-validation stops the merge',
    async (_label, change) => {
      const { gh } = seededRepo();
      const pr = featurePr(gh);
      gh.startChecks(pr.number);
      await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
      const event = ciDone(gh, pr.number);
      gh.onCall.set('listCheckRuns', () => change(gh, pr.number)); // after the first read
      expect(statuses(await handleWorkflowRun(event, ctx(gh)))).toEqual(['not-approved']);
      expect(gh.merges).toHaveLength(0);
    },
  );

  it('a merge conflict: GitHub refuses, nothing is merged, the PR stays open', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.conflicts.add(pr.number);
    gh.startChecks(pr.number);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    expect(statuses(await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh)))).toEqual([
      'not-mergeable',
    ]);
    expect(gh.merges).toHaveLength(0);
    expect(gh.pulls.get(pr.number)?.state).toBe('open');
  });

  it.each(['getIssueComment', 'listWorkflowRuns', 'mergePullRequest'])(
    'an API failure in %s stops safely: nothing merged (fail closed)',
    async (method) => {
      const { gh } = seededRepo();
      const pr = featurePr(gh);
      gh.startChecks(pr.number);
      await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
      gh.failOn.set(method, new Error('GitHub is down'));
      await expect(handleWorkflowRun(ciDone(gh, pr.number), ctx(gh))).rejects.toThrow(
        'GitHub is down',
      );
      expect(gh.merges).toHaveLength(0);
    },
  );

  it('a failure while recording the approval stops before anything is merged', async () => {
    const { gh } = seededRepo();
    const pr = featurePr(gh);
    gh.failOn.set('createStatus', new Error('GitHub is down'));
    await expect(
      handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh)),
    ).rejects.toThrow('GitHub is down');
    gh.failOn.clear();
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    expect(gh.merges).toHaveLength(0);
  });
});

describe('branch cleanup after merge (on push to dev)', () => {
  async function publish(gh: FakeGitHub, name: string) {
    const pr = featurePr(gh, name);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    return pr;
  }

  it('deletes only the merged, approved feature/* branch; idempotent', async () => {
    const { gh } = seededRepo();
    await publish(gh, 'feature/hero');
    featurePr(gh, 'feature/open'); // open, unmerged
    expect(await cleanupMergedBranches(ctx(gh))).toEqual(['feature/hero']);
    expect(gh.branches.has('feature/hero')).toBe(false);
    expect(gh.branches.has('feature/open')).toBe(true);
    expect(await cleanupMergedBranches(ctx(gh))).toEqual([]); // duplicate run
    expect(gh.deleted).toEqual(['feature/hero']);
  });

  it('keeps manually merged branches and branches with commits after the merge', async () => {
    const { gh } = seededRepo();
    const manual = featurePr(gh, 'feature/manual');
    gh.manualMerge(manual.number); // a human merged it without publish approval
    await publish(gh, 'feature/b');
    gh.push('feature/b'); // someone kept working on the branch
    expect(await cleanupMergedBranches(ctx(gh))).toEqual([]);
    expect(gh.deleted).toEqual([]);
  });

  it('never deletes dev or main (promotion and sync PRs)', async () => {
    const { gh } = seededRepo();
    gh.push('dev');
    const promo = gh.openPr({ head: 'dev', base: 'main' });
    gh.manualMerge(promo.number, 'MERGE');
    const sync = gh.openPr({ head: 'main', base: 'dev' });
    gh.manualMerge(sync.number, 'MERGE');
    expect(await cleanupMergedBranches(ctx(gh))).toEqual([]);
    expect(gh.branches.has('dev') && gh.branches.has('main')).toBe(true);
  });
});

describe('promotion dev → main', () => {
  async function approvedAndMerged(gh: FakeGitHub, name: string, files?: string[]) {
    const pr = featurePr(gh, name, files);
    await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh));
    await handleWorkflowRun(ciDone(gh, pr.number), ctx(gh));
    expect(gh.pulls.get(pr.number)?.merged).toBe(true);
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
    expect(
      (await handleApprovalComment(approval(gh, pr.number, pr.head.sha), ctx(gh))).status,
    ).toBe('recorded');
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
