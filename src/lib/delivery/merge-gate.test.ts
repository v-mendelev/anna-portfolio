/**
 * Unit tests of the merge gate rules (pure functions): CI identity, approval
 * binding and App credential validation.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadDeliveryConfig, readAppCredentials } from './config.ts';
import {
  commenterMayApprove,
  evaluateCi,
  evaluateMerge,
  formatApprovalRecord,
  type CiVerdict,
  type MergeInput,
} from './policy.ts';
import { OWNER, REPO, sha, testConfig } from './testing.ts';
import type { CheckRun, IssueComment, PullRequest, WorkflowRun } from './types.ts';

const cfg = testConfig();
const HEAD = sha('head');

const pr: PullRequest = {
  number: 7,
  nodeId: 'PR_7',
  state: 'open',
  merged: false,
  draft: false,
  title: 't',
  htmlUrl: 'u',
  author: OWNER,
  base: { ref: 'dev', repoFullName: REPO },
  head: { ref: 'feature/x', sha: HEAD, repoFullName: REPO },
  mergeCommitSha: null,
  autoMergeEnabled: false,
};

const run: WorkflowRun = {
  id: 11,
  name: 'CI',
  path: '.github/workflows/ci.yml',
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
  headSha: HEAD,
  headBranch: 'feature/x',
  headRepoFullName: REPO,
  pullRequests: [{ number: 7, baseRef: 'dev' }],
  checkSuiteId: 500,
  createdAt: '2026-01-01T00:00:10Z',
};

const check: CheckRun = {
  name: 'CI passed',
  status: 'completed',
  conclusion: 'success',
  appSlug: 'github-actions',
  checkSuiteId: 500,
  headSha: HEAD,
};

describe('evaluateCi: the result must belong to this PR and this commit', () => {
  it('passes for the newest successful pull_request run of ci.yml with its required check', () => {
    expect(evaluateCi({ pr, runs: [run], checks: [check] }, cfg)).toEqual({
      state: 'passed',
      reason: 'CI run 11 passed',
      runId: 11,
    });
  });

  it.each<[string, Partial<WorkflowRun>]>([
    ['another workflow file', { path: '.github/workflows/other.yml' }],
    ['a push-triggered run', { event: 'push' }],
    ['another commit', { headSha: sha('other') }],
    ['another branch', { headBranch: 'feature/y' }],
    ['a fork', { headRepoFullName: 'evil/site' }],
    ['another PR', { pullRequests: [{ number: 8, baseRef: 'dev' }] }],
    [
      'this PR as a PR into main (tested against main)',
      { pullRequests: [{ number: 7, baseRef: 'main' }] },
    ],
    ['no PR association', { pullRequests: [] }],
  ])('ignores %s', (_label, change) => {
    expect(evaluateCi({ pr, runs: [{ ...run, ...change }], checks: [check] }, cfg).state).toBe(
      'missing',
    );
  });

  it('uses the NEWEST run: a later failed or running attempt wins over an older success', () => {
    const later = { ...run, id: 12, checkSuiteId: 501, createdAt: '2026-01-01T00:00:20Z' };
    expect(
      evaluateCi({ pr, runs: [run, { ...later, conclusion: 'failure' }], checks: [check] }, cfg)
        .state,
    ).toBe('failed');
    expect(
      evaluateCi(
        { pr, runs: [run, { ...later, status: 'in_progress', conclusion: null }], checks: [check] },
        cfg,
      ).state,
    ).toBe('pending');
  });

  it.each<[string, Partial<CheckRun>, CiVerdict['state']]>([
    ['the check from another app', { appSlug: 'evil-app' }, 'missing'],
    ['the check from another run', { checkSuiteId: 999 }, 'missing'],
    ['the check on another commit', { headSha: sha('other') }, 'missing'],
    ['a failed required check', { conclusion: 'failure' }, 'failed'],
    ['a running required check', { status: 'in_progress', conclusion: null }, 'pending'],
  ])('does not pass with %s', (_label, change, state) => {
    expect(evaluateCi({ pr, runs: [run], checks: [{ ...check, ...change }] }, cfg).state).toBe(
      state,
    );
  });
});

describe('evaluateMerge: approval bound to repository, PR, approver, comment and SHA', () => {
  const comment: IssueComment = {
    id: 42,
    issueNumber: 7,
    body: `/publish-approve ${HEAD}`,
    author: OWNER,
    association: 'OWNER',
  };
  const ok: MergeInput = {
    pr,
    files: ['src/site/content.ts'],
    filesTruncated: false,
    approval: {
      state: 'success',
      record: { pr: 7, approver: 'owner', commentId: 42 },
    },
    comment,
    ci: { state: 'passed', reason: '', runId: 11 },
  };
  const reasons = (input: MergeInput): string => {
    const d = evaluateMerge(input, cfg);
    return d.decision === 'reject' ? d.reasons.join(' | ') : d.decision;
  };

  it('merges only when everything holds', () => {
    expect(evaluateMerge(ok, cfg)).toEqual({ decision: 'merge' });
    expect(formatApprovalRecord({ pr: 7, approver: 'owner', commentId: 42 })).toBe(
      'Approved PR #7 by owner (comment 42)',
    );
  });

  it.each<[string, Partial<MergeInput>, RegExp]>([
    ['no approval', { approval: null }, /no publish approval/],
    ['a revoked/failed record', { approval: { state: 'failure', record: null } }, /not "success"/],
    ['a legacy record', { approval: { state: 'success', record: null } }, /malformed/],
    [
      "another PR's approval",
      { approval: { state: 'success', record: { pr: 9, approver: 'owner', commentId: 42 } } },
      /belongs to PR #9/,
    ],
    ['a deleted comment', { comment: null }, /no longer exists/],
    ['a comment on another PR', { comment: { ...comment, issueNumber: 9 } }, /on #9/],
    [
      'a comment approving a stale SHA',
      { comment: { ...comment, body: `/publish-approve ${sha('old')}` } },
      /current head SHA/,
    ],
    [
      'a comment by an unauthorized account',
      { comment: { ...comment, author: { login: 'stranger', type: 'User' } } },
      /not from an authorized approver/,
    ],
    [
      'a comment by a non-owner claiming the OWNER association',
      {
        comment: { ...comment, author: { login: 'mallory', type: 'User' }, association: 'OWNER' },
      },
      /not from an authorized approver/,
    ],
    [
      'a record naming another approver',
      { approval: { state: 'success', record: { pr: 7, approver: 'helper', commentId: 42 } } },
      /does not match the record/,
    ],
    [
      'a record pointing at another comment',
      { approval: { state: 'success', record: { pr: 7, approver: 'owner', commentId: 43 } } },
      /id mismatch/,
    ],
    ['a retargeted PR', { pr: { ...pr, base: { ...pr.base, ref: 'main' } } }, /retargeted/],
    ['a draft', { pr: { ...pr, draft: true } }, /draft/],
    ['a fork', { pr: { ...pr, head: { ...pr.head, repoFullName: 'evil/site' } } }, /forks/],
    [
      'Dependabot',
      { pr: { ...pr, author: { login: 'dependabot[bot]', type: 'Bot' } } },
      /Dependabot/,
    ],
    ['a non-feature branch', { pr: { ...pr, head: { ...pr.head, ref: 'hotfix/x' } } }, /feature/],
    ['a closed PR', { pr: { ...pr, state: 'closed' } }, /not open/],
    ['workflow changes', { files: ['.github/workflows/ci.yml'] }, /workflow files/],
    ['pipeline changes', { files: ['src/lib/delivery/merge.ts'] }, /workflow files/],
    ['a truncated diff', { filesTruncated: true }, /too large/],
  ])('rejects %s', (_label, change, pattern) => {
    expect(reasons({ ...ok, ...change })).toMatch(pattern);
  });

  it('waits for pending or missing CI and reports failed CI — never merges', () => {
    expect(evaluateMerge({ ...ok, ci: { state: 'pending', reason: 'r', runId: 1 } }, cfg)).toEqual({
      decision: 'wait',
      reason: 'r',
    });
    expect(
      evaluateMerge({ ...ok, ci: { state: 'missing', reason: 'm', runId: null } }, cfg),
    ).toEqual({ decision: 'wait', reason: 'm' });
    expect(evaluateMerge({ ...ok, ci: { state: 'failed', reason: 'f', runId: 1 } }, cfg)).toEqual({
      decision: 'ci-failed',
      reason: 'f',
    });
  });

  it('a rule violation wins over passed CI', () => {
    expect(evaluateMerge({ ...ok, approval: null }, cfg).decision).toBe('reject');
  });
});

describe('readAppCredentials: missing or invalid App credentials fail before any call', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

  it('accepts a numeric App ID and a PEM key (also with escaped newlines)', () => {
    expect(readAppCredentials({ DELIVERY_APP_ID: '123', DELIVERY_APP_PRIVATE_KEY: pem })).toEqual({
      appId: '123',
      privateKey: pem.trim(),
    });
    expect(
      readAppCredentials({
        DELIVERY_APP_ID: '123',
        DELIVERY_APP_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
      }).privateKey,
    ).toBe(pem.trim());
  });

  it.each([
    ['missing App ID', { DELIVERY_APP_PRIVATE_KEY: 'x' }, /DELIVERY_APP_ID is not set/],
    ['bad App ID', { DELIVERY_APP_ID: '12; rm -rf', DELIVERY_APP_PRIVATE_KEY: 'x' }, /App ID/],
    ['missing key', { DELIVERY_APP_ID: '123' }, /DELIVERY_APP_PRIVATE_KEY is not set/],
    [
      'not a PEM key',
      { DELIVERY_APP_ID: '123', DELIVERY_APP_PRIVATE_KEY: 'ghp_notakey' },
      /not a PEM private key/,
    ],
  ])('rejects %s without echoing the value', (_label, env, pattern) => {
    const error = (() => {
      try {
        readAppCredentials(env);
        return '';
      } catch (e) {
        return String(e);
      }
    })();
    expect(error).toMatch(pattern);
    expect(error).not.toContain('ghp_notakey');
    expect(error).not.toContain('rm -rf');
  });
});

describe('approver identity for this repository (v-mendelev/anna-portfolio)', () => {
  const real = loadDeliveryConfig({
    GITHUB_REPOSITORY: 'v-mendelev/anna-portfolio',
    DELIVERY_REPOSITORY: 'v-mendelev/anna-portfolio',
    DELIVERY_APPROVERS: 'v-mendelev',
  });

  it.each(['OWNER', 'CONTRIBUTOR', 'NONE'])(
    'v-mendelev may approve (author_association %s)',
    (association) => {
      expect(commenterMayApprove({ login: 'v-mendelev', type: 'User', association }, real)).toBe(
        true,
      );
    },
  );

  it.each([
    ['another user with write access', 'collaborator', 'COLLABORATOR', 'User'],
    ['an outsider', 'stranger', 'NONE', 'User'],
    ['an account claiming OWNER', 'mallory', 'OWNER', 'User'],
    ['a bot under the owner name', 'v-mendelev[bot]', 'OWNER', 'Bot'],
  ])('%s may not approve', (_label, login, association, type) => {
    expect(commenterMayApprove({ login, type, association }, real)).toBe(false);
  });
});
