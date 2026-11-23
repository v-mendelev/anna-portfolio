import { describe, expect, it } from 'vitest';
import { DeliveryNotActivatedError, loadDeliveryConfig } from './config.ts';
import {
  commenterMayApprove,
  evaluateCleanup,
  evaluateSync,
  isApprovalRecorded,
  isFeatureBranch,
  isProtectedBranch,
  parseApprovalCommand,
} from './policy.ts';
import { APP_BOT, REPO, sha, testConfig } from './testing.ts';
import type { PullRequest } from './types.ts';

const cfg = testConfig();
const SHA = sha('x');

describe('parseApprovalCommand', () => {
  it('accepts exactly "/publish-approve <full sha>"', () => {
    expect(parseApprovalCommand(`/publish-approve ${SHA}`)).toBe(SHA);
    expect(parseApprovalCommand(`  /publish-approve ${SHA.toUpperCase()}\n`)).toBe(SHA);
  });

  it.each([
    ['short sha', `/publish-approve ${SHA.slice(0, 12)}`],
    ['no sha', '/publish-approve'],
    ['prose around it', `LGTM /publish-approve ${SHA}`],
    ['quoted reply', `> /publish-approve ${SHA}`],
    ['trailing text', `/publish-approve ${SHA} please`],
    ['second line', `ok\n/publish-approve ${SHA}`],
    ['other command', `/approve ${SHA}`],
  ])('rejects %s', (_label, body) => {
    expect(parseApprovalCommand(body)).toBeNull();
  });
});

describe('branches', () => {
  it.each(['feature/hero', 'feature/design-v2-concepts', 'feature/a/b', 'feature/x_1.2'])(
    '%s is a feature branch',
    (ref) => {
      expect(isFeatureBranch(ref, cfg)).toBe(true);
    },
  );
  it.each([
    'dev',
    'main',
    'feature/',
    'feature/../main',
    'feature/a//b',
    'feature/x.lock',
    'feature/-x',
    'features/x',
    'hotfix/x',
  ])('%s is not a feature branch', (ref) => {
    expect(isFeatureBranch(ref, cfg)).toBe(false);
  });
  it('dev, main, gh-pages and anything non-feature are protected', () => {
    for (const ref of ['dev', 'main', 'gh-pages', 'release/1'])
      expect(isProtectedBranch(ref, cfg)).toBe(true);
    expect(isProtectedBranch('feature/x', cfg)).toBe(false);
  });
});

describe('approvers', () => {
  it('only listed humans with write association may approve', () => {
    expect(commenterMayApprove({ login: 'Owner', type: 'User', association: 'OWNER' }, cfg)).toBe(
      true,
    );
    expect(
      commenterMayApprove({ login: 'owner', type: 'User', association: 'CONTRIBUTOR' }, cfg),
    ).toBe(false);
    expect(
      commenterMayApprove({ login: 'other', type: 'User', association: 'COLLABORATOR' }, cfg),
    ).toBe(false);
  });
});

describe('isApprovalRecorded', () => {
  const ok = {
    context: cfg.approvalContext,
    state: 'success' as const,
    creatorLogin: APP_BOT,
    description: '',
  };
  it('needs the newest App-authored approval status to be success', () => {
    expect(isApprovalRecorded([ok], cfg, APP_BOT)).toBe(true);
    expect(isApprovalRecorded([{ ...ok, state: 'failure' }, ok], cfg, APP_BOT)).toBe(false);
    expect(isApprovalRecorded([{ ...ok, creatorLogin: 'owner' }], cfg, APP_BOT)).toBe(false);
    expect(isApprovalRecorded([{ ...ok, context: 'ci' }], cfg, APP_BOT)).toBe(false);
    expect(isApprovalRecorded([], cfg, APP_BOT)).toBe(false);
  });
});

describe('evaluateCleanup', () => {
  const merged: PullRequest = {
    number: 1,
    nodeId: 'n',
    state: 'closed',
    merged: true,
    draft: false,
    title: 't',
    htmlUrl: '',
    author: { login: 'owner', type: 'User' },
    base: { ref: 'dev', repoFullName: REPO },
    head: { ref: 'feature/x', sha: SHA, repoFullName: REPO },
    mergeCommitSha: sha('m'),
    autoMergeEnabled: false,
  };
  it('deletes only when every condition holds', () => {
    expect(
      evaluateCleanup({ pr: merged, branchSha: SHA, openPullRequestsFromBranch: 0 }, cfg),
    ).toEqual({ action: 'delete' });
    expect(
      evaluateCleanup({ pr: merged, branchSha: SHA, openPullRequestsFromBranch: 1 }, cfg).action,
    ).toBe('skip');
    expect(
      evaluateCleanup(
        {
          pr: { ...merged, head: { ...merged.head, ref: 'dev' } },
          branchSha: SHA,
          openPullRequestsFromBranch: 0,
        },
        cfg,
      ).action,
    ).toBe('skip');
    expect(
      evaluateCleanup(
        {
          pr: { ...merged, base: { ...merged.base, ref: 'main' } },
          branchSha: SHA,
          openPullRequestsFromBranch: 0,
        },
        cfg,
      ).action,
    ).toBe('skip');
  });
});

describe('evaluateSync', () => {
  const base = {
    mainSha: 'm',
    mainTree: 'T1',
    devTree: 'T2',
    mergeBaseSha: 'b',
    mergeBaseTree: 'T0',
  };
  it('in-sync when main is an ancestor of dev', () => {
    expect(evaluateSync({ ...base, mergeBaseSha: 'm' })).toBe('in-sync');
  });
  it('syncs only content-neutral main commits', () => {
    expect(evaluateSync({ ...base, mainTree: 'T0' })).toBe('sync'); // main gained only merge commits
    expect(evaluateSync({ ...base, mainTree: 'T2' })).toBe('sync'); // squash of exactly dev's content
    expect(evaluateSync(base)).toBe('blocked'); // real change only on main
  });
});

describe('loadDeliveryConfig', () => {
  it('is inert until DELIVERY_REPOSITORY matches the running repository', () => {
    expect(() => loadDeliveryConfig({ GITHUB_REPOSITORY: REPO })).toThrow(
      DeliveryNotActivatedError,
    );
    expect(() =>
      loadDeliveryConfig({ GITHUB_REPOSITORY: 'fork/site', DELIVERY_REPOSITORY: REPO }),
    ).toThrow(DeliveryNotActivatedError);
  });
  it('defaults approvers to the owner and parses a list', () => {
    expect(cfg.approvers).toEqual(['owner']);
    const custom = loadDeliveryConfig({
      GITHUB_REPOSITORY: REPO,
      DELIVERY_REPOSITORY: REPO,
      DELIVERY_APPROVERS: '@Owner, second',
    });
    expect(custom.approvers).toEqual(['owner', 'second']);
  });
  it('rejects malformed values', () => {
    expect(() =>
      loadDeliveryConfig({ GITHUB_REPOSITORY: 'x', DELIVERY_REPOSITORY: 'x' }),
    ).toThrow();
    expect(() =>
      loadDeliveryConfig({
        GITHUB_REPOSITORY: REPO,
        DELIVERY_REPOSITORY: REPO,
        DELIVERY_APPROVERS: 'a b',
      }),
    ).toThrow();
    expect(() =>
      loadDeliveryConfig({
        GITHUB_REPOSITORY: REPO,
        DELIVERY_REPOSITORY: REPO,
        DELIVERY_DEV_BRANCH: 'main',
      }),
    ).toThrow();
  });
});
