import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createAppJwt,
  createCiReader,
  createGitHubApi,
  createInstallationToken,
  TOKEN_PERMISSIONS,
  type Fetch,
} from './rest.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

interface Call {
  method: string;
  url: string;
  auth: string;
  body: unknown;
}

function fakeFetch(routes: Record<string, { status: number; body?: unknown }>): {
  fetch: Fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    calls.push({
      method,
      url,
      auth: headers.get('Authorization') ?? '',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const route = routes[`${method} ${url.replace('https://api.github.com', '')}`] ?? {
      status: 404,
      body: { message: 'Not Found' },
    };
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), {
      status: route.status,
    });
  };
  return { fetch: impl as Fetch, calls };
}

describe('createAppJwt', () => {
  it('produces an RS256 JWT signed with the App key, short-lived and backdated for clock skew', () => {
    const jwt = createAppJwt('12345', PEM, 1_000_000);
    const [header = '', payload = '', signature = ''] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iat: 999_940,
      exp: 1_000_540,
      iss: '12345',
    });
    const verify = createVerify('RSA-SHA256');
    verify.update(`${header}.${payload}`);
    expect(verify.verify(publicKey, signature, 'base64url')).toBe(true);
  });

  it('accepts keys stored with escaped newlines and rejects bad App ids', () => {
    expect(() => createAppJwt('12345', PEM.replace(/\n/g, '\\n'))).not.toThrow();
    expect(() => createAppJwt('12; rm', PEM)).toThrow(/App ID/);
  });
});

describe('createInstallationToken', () => {
  it('mints a token scoped to one repository with least-privilege permissions and can revoke it', async () => {
    const f = fakeFetch({
      'GET /app': { status: 200, body: { slug: 'site-delivery' } },
      'GET /repos/owner/site/installation': { status: 200, body: { id: 7 } },
      'POST /app/installations/7/access_tokens': { status: 201, body: { token: 'ghs_secret' } },
      'DELETE /installation/token': { status: 204 },
    });
    const app = await createInstallationToken({
      appId: '1',
      privateKey: PEM,
      repository: 'owner/site',
      fetch: f.fetch,
    });
    expect(app.botLogin).toBe('site-delivery[bot]');
    const mint = f.calls.find((c) => c.url.endsWith('/access_tokens'));
    expect(mint?.body).toEqual({ repositories: ['site'], permissions: TOKEN_PERMISSIONS });
    expect(TOKEN_PERMISSIONS).toEqual({
      contents: 'write',
      pull_requests: 'write',
      statuses: 'write',
    });
    await app.revoke();
    expect(f.calls.at(-1)).toMatchObject({ method: 'DELETE', auth: 'token ghs_secret' });
  });

  it('fails clearly (without echoing secrets) when the App is not installed', async () => {
    const f = fakeFetch({ 'GET /app': { status: 200, body: { slug: 's' } } });
    const error = await createInstallationToken({
      appId: '1',
      privateKey: PEM,
      repository: 'owner/site',
      fetch: f.fetch,
    }).catch((e: unknown) => e);
    expect(String(error)).toMatch(/not installed/);
    expect(String(error)).not.toContain('PRIVATE KEY');
  });
});

describe('createGitHubApi', () => {
  const pr = {
    number: 3,
    node_id: 'PR_3',
    state: 'open',
    merged: false,
    draft: false,
    title: 't',
    html_url: 'u',
    user: { login: 'owner', type: 'User' },
    base: { ref: 'dev', repo: { full_name: 'owner/site' } },
    head: { ref: 'feature/x', sha: 'a'.repeat(40), repo: { full_name: 'owner/site' } },
    merge_commit_sha: null,
    auto_merge: null,
  };

  it('maps pull requests and treats a deleted fork as a foreign head', async () => {
    const f = fakeFetch({
      'GET /repos/owner/site/pulls/3': { status: 200, body: pr },
      'GET /repos/owner/site/pulls/4': {
        status: 200,
        body: { ...pr, number: 4, head: { ...pr.head, repo: null } },
      },
    });
    const api = createGitHubApi({ token: 't', repository: 'owner/site', fetch: f.fetch });
    expect(await api.getPullRequest(3)).toMatchObject({
      number: 3,
      autoMergeEnabled: false,
      head: { repoFullName: 'owner/site' },
    });
    expect((await api.getPullRequest(4)).head.repoFullName).toBe('');
  });

  it('maps auto-merge GraphQL answers: enabled, clean status, unexpected error', async () => {
    const answers = [
      { data: {} },
      { errors: [{ message: 'Pull request Pull request is in clean status' }] },
      { errors: [{ message: 'nope' }] },
    ];
    let i = 0;
    const impl = (async () =>
      new Response(JSON.stringify(answers[i++]), { status: 200 })) as unknown as Fetch;
    const api = createGitHubApi({ token: 't', repository: 'owner/site', fetch: impl });
    const p = { nodeId: 'PR_3' } as Parameters<typeof api.enableAutoMerge>[0];
    expect(await api.enableAutoMerge(p, 'SQUASH', 'a'.repeat(40))).toBe('enabled');
    expect(await api.enableAutoMerge(p, 'SQUASH', 'a'.repeat(40))).toBe('clean');
    await expect(api.enableAutoMerge(p, 'SQUASH', 'a'.repeat(40))).rejects.toThrow(/nope/);
  });

  it('merges with the SHA guard and reports a moved head', async () => {
    const f = fakeFetch({
      'PUT /repos/owner/site/pulls/3/merge': {
        status: 409,
        body: { message: 'Head branch was modified' },
      },
    });
    const api = createGitHubApi({ token: 't', repository: 'owner/site', fetch: f.fetch });
    expect(await api.mergePullRequest(3, 'a'.repeat(40), 'SQUASH')).toBe('head-moved');
    expect(f.calls[0]?.body).toEqual({ sha: 'a'.repeat(40), merge_method: 'squash' });
  });

  it('deletes refs by exact name and tolerates an already deleted branch', async () => {
    const f = fakeFetch({
      'DELETE /repos/owner/site/git/refs/heads/feature/a%23b': { status: 204 },
      'DELETE /repos/owner/site/git/refs/heads/feature/gone': {
        status: 422,
        body: { message: 'Reference does not exist' },
      },
    });
    const api = createGitHubApi({ token: 't', repository: 'owner/site', fetch: f.fetch });
    await api.deleteBranch('feature/a#b');
    await api.deleteBranch('feature/gone');
    expect(f.calls.map((c) => c.url)).toEqual([
      'https://api.github.com/repos/owner/site/git/refs/heads/feature/a%23b',
      'https://api.github.com/repos/owner/site/git/refs/heads/feature/gone',
    ]);
  });

  it('includes renamed-from paths in PR files so moving a workflow out is still detected', async () => {
    const f = fakeFetch({
      'GET /repos/owner/site/pulls/3/files?per_page=100&page=1': {
        status: 200,
        body: [{ filename: 'docs/ci.yml', previous_filename: '.github/workflows/ci.yml' }],
      },
    });
    const api = createGitHubApi({ token: 't', repository: 'owner/site', fetch: f.fetch });
    expect(await api.listPullRequestFiles(3)).toEqual({
      files: ['docs/ci.yml', '.github/workflows/ci.yml'],
      truncated: false,
    });
  });
});

describe('App credentials at runtime', () => {
  it('invalid credentials (GitHub answers 401) stop the run without echoing secrets', async () => {
    const f = fakeFetch({
      'GET /app': { status: 401, body: { message: 'A JSON web token could not be decoded' } },
    });
    const error = await createInstallationToken({
      appId: '1',
      privateKey: PEM,
      repository: 'owner/site',
      fetch: f.fetch,
    }).catch((e: unknown) => e);
    expect(String(error)).toMatch(/Cannot authenticate as the App/);
    expect(String(error)).not.toContain('PRIVATE KEY');
    expect(f.calls.filter((c) => c.url.includes('access_tokens'))).toHaveLength(0);
  });
});

describe('approval comment lookup', () => {
  it('maps the comment and the PR it belongs to; a deleted comment is null', async () => {
    const f = fakeFetch({
      'GET /repos/owner/site/issues/comments/42': {
        status: 200,
        body: {
          id: 42,
          body: '/publish-approve abc',
          issue_url: 'https://api.github.com/repos/owner/site/issues/7',
          author_association: 'OWNER',
          user: { login: 'owner', type: 'User' },
        },
      },
    });
    const api = createGitHubApi({ token: 't', repository: 'owner/site', fetch: f.fetch });
    expect(await api.getIssueComment(42)).toEqual({
      id: 42,
      issueNumber: 7,
      body: '/publish-approve abc',
      author: { login: 'owner', type: 'User' },
      association: 'OWNER',
    });
    expect(await api.getIssueComment(43)).toBeNull();
  });
});

describe('createCiReader (GITHUB_TOKEN, read-only)', () => {
  const restRun = {
    id: 11,
    name: 'CI',
    path: '.github/workflows/ci.yml@refs/pull/7/merge',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: 'a'.repeat(40),
    head_branch: 'feature/x',
    head_repository: { full_name: 'owner/site' },
    pull_requests: [
      { number: 7, base: { ref: 'dev', repo: { url: 'https://api.github.com/repos/owner/site' } } },
      { number: 3, base: { ref: 'dev', repo: { url: 'https://api.github.com/repos/evil/site' } } },
    ],
    check_suite_id: 500,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('reads runs and checks; keeps only PR associations of this repository', async () => {
    const sha = 'a'.repeat(40);
    const f = fakeFetch({
      [`GET /repos/owner/site/actions/workflows/ci.yml/runs?head_sha=${sha}&event=pull_request&per_page=50`]:
        { status: 200, body: { workflow_runs: [restRun] } },
      'GET /repos/owner/site/actions/runs/11': { status: 200, body: restRun },
      'GET /repos/owner/site/check-suites/500/check-runs?check_name=CI+passed&filter=latest&per_page=100':
        {
          status: 200,
          body: {
            check_runs: [
              {
                name: 'CI passed',
                status: 'completed',
                conclusion: 'success',
                head_sha: sha,
                app: { slug: 'github-actions' },
                check_suite: { id: 500 },
              },
            ],
          },
        },
    });
    const ci = createCiReader({ token: 'gh-token', repository: 'owner/site', fetch: f.fetch });
    const [run] = await ci.listWorkflowRuns('ci.yml', sha);
    expect(run).toMatchObject({
      path: '.github/workflows/ci.yml',
      pullRequests: [{ number: 7, baseRef: 'dev' }],
      checkSuiteId: 500,
      headRepoFullName: 'owner/site',
    });
    expect(await ci.getWorkflowRun(11)).toEqual(run);
    expect(await ci.listCheckRuns(500, 'CI passed')).toEqual([
      {
        name: 'CI passed',
        status: 'completed',
        conclusion: 'success',
        appSlug: 'github-actions',
        checkSuiteId: 500,
        headSha: sha,
      },
    ]);
    expect(f.calls.every((c) => c.method === 'GET' && c.auth === 'Bearer gh-token')).toBe(true);
  });

  it('fails closed on API errors', async () => {
    const ci = createCiReader({ token: 't', repository: 'owner/site', fetch: fakeFetch({}).fetch });
    await expect(ci.getWorkflowRun(1)).rejects.toThrow(/404/);
  });
});

describe('commit statuses', () => {
  it('reads every page so a flood of other statuses cannot hide the App record', async () => {
    const sha = 'b'.repeat(40);
    const other = { context: 'x', state: 'success', description: null, creator: { login: 'x' } };
    const own = {
      context: 'delivery/approval',
      state: 'success',
      description: 'd',
      creator: { login: 'site-delivery[bot]' },
    };
    const f = fakeFetch({
      [`GET /repos/owner/site/commits/${sha}/statuses?per_page=100&page=1`]: {
        status: 200,
        body: Array.from({ length: 100 }, () => other),
      },
      [`GET /repos/owner/site/commits/${sha}/statuses?per_page=100&page=2`]: {
        status: 200,
        body: [own],
      },
    });
    const api = createGitHubApi({ token: 't', repository: 'owner/site', fetch: f.fetch });
    const list = await api.listStatuses(sha);
    expect(list).toHaveLength(101);
    expect(list.at(-1)).toMatchObject({
      context: 'delivery/approval',
      creatorLogin: 'site-delivery[bot]',
    });
  });
});
