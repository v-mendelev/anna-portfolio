/**
 * GitHub REST/GraphQL client for the delivery pipeline + GitHub App auth.
 *
 * Tokens: a short-lived (≤ 1 h) installation token is minted per workflow run
 * from the App's private key, scoped to ONE repository and to the minimum
 * permissions, kept only in memory and revoked when the run ends. Nothing in
 * this module logs or returns a token or the private key.
 */
import { createSign } from 'node:crypto';
import type {
  AutoMergeResult,
  CommitInfo,
  CommitStatus,
  Comparison,
  GitHubApi,
  MergeMethod,
  MergeResult,
  PullRequest,
} from './types.ts';

export const API_URL = 'https://api.github.com';

export type Fetch = typeof fetch;

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

/** Permissions the pipeline requests for its installation tokens (never more). */
export const TOKEN_PERMISSIONS = {
  contents: 'write',
  pull_requests: 'write',
  statuses: 'write',
} as const;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** RS256 JWT that authenticates as the App itself (valid 9 minutes, clock skew tolerant). */
export function createAppJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  if (!/^\d+$/.test(appId.trim()) && !/^Iv[0-9A-Za-z.]+$/.test(appId.trim())) {
    throw new Error('DELIVERY_APP_ID must be the numeric App ID or the App client ID.');
  }
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iat: nowSeconds - 60, exp: nowSeconds + 540, iss: appId.trim() }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${signer.sign(privateKeyPem.replace(/\\n/g, '\n'), 'base64url')}`;
}

async function call<T>(
  fetchImpl: Fetch,
  auth: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetchImpl(path.startsWith('http') ? path : `${API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: auth,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'delivery-pipeline',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, data };
}

function apiMessage(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof data.message === 'string'
  ) {
    return data.message;
  }
  return 'request failed';
}

export interface AppToken {
  token: string;
  /** Login of the App's bot user, e.g. "my-app[bot]" (the creator of its statuses). */
  botLogin: string;
  revoke(): Promise<void>;
}

/** Mints a repository-scoped, least-privilege installation token. */
export async function createInstallationToken(options: {
  appId: string;
  privateKey: string;
  repository: string;
  fetch?: Fetch;
}): Promise<AppToken> {
  const fetchImpl = options.fetch ?? fetch;
  const [owner = '', repo = ''] = options.repository.split('/');
  const jwt = `Bearer ${createAppJwt(options.appId, options.privateKey)}`;

  const app = await call<{ slug?: string }>(fetchImpl, jwt, 'GET', '/app');
  if (app.status !== 200 || !app.data.slug)
    throw new GitHubError(app.status, `Cannot authenticate as the App: ${apiMessage(app.data)}`);
  const installation = await call<{ id?: number }>(
    fetchImpl,
    jwt,
    'GET',
    `/repos/${owner}/${repo}/installation`,
  );
  if (installation.status !== 200 || typeof installation.data.id !== 'number') {
    throw new GitHubError(
      installation.status,
      `The App is not installed on ${options.repository}.`,
    );
  }
  const minted = await call<{ token?: string }>(
    fetchImpl,
    jwt,
    'POST',
    `/app/installations/${installation.data.id}/access_tokens`,
    { repositories: [repo], permissions: TOKEN_PERMISSIONS },
  );
  const token = minted.data.token;
  if (minted.status !== 201 || !token) {
    throw new GitHubError(
      minted.status,
      `Cannot mint an installation token: ${apiMessage(minted.data)}`,
    );
  }
  return {
    token,
    botLogin: `${app.data.slug}[bot]`,
    revoke: async () => {
      await call(fetchImpl, `token ${token}`, 'DELETE', '/installation/token');
    },
  };
}

// ---- REST response shapes (only the fields we read) ----

interface RestPull {
  number: number;
  node_id: string;
  state: 'open' | 'closed';
  merged?: boolean;
  merged_at?: string | null;
  draft?: boolean;
  title: string;
  html_url: string;
  user: { login: string; type: string } | null;
  base: { ref: string; repo: { full_name: string } | null };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  merge_commit_sha: string | null;
  auto_merge: unknown;
}

interface RestCommit {
  sha: string;
  commit?: { tree: { sha: string } };
  tree?: { sha: string };
  parents: { sha: string }[];
}

export function mapPull(p: RestPull): PullRequest {
  return {
    number: p.number,
    nodeId: p.node_id,
    state: p.state,
    merged: p.merged ?? Boolean(p.merged_at),
    draft: p.draft ?? false,
    title: p.title,
    htmlUrl: p.html_url,
    author: { login: p.user?.login ?? 'ghost', type: p.user?.type ?? 'User' },
    base: { ref: p.base.ref, repoFullName: p.base.repo?.full_name ?? '' },
    head: { ref: p.head.ref, sha: p.head.sha, repoFullName: p.head.repo?.full_name ?? '' },
    mergeCommitSha: p.merge_commit_sha,
    autoMergeEnabled: p.auto_merge !== null && p.auto_merge !== undefined,
  };
}

function mapCommit(c: RestCommit): CommitInfo {
  const tree = c.commit?.tree.sha ?? c.tree?.sha;
  if (!tree) throw new Error(`Commit ${c.sha} has no tree in the API response.`);
  return { sha: c.sha, treeSha: tree, parents: c.parents.map((p) => p.sha) };
}

function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

const MERGE_METHODS: Record<MergeMethod, string> = {
  MERGE: 'merge',
  SQUASH: 'squash',
  REBASE: 'rebase',
};

export function createGitHubApi(options: {
  token: string;
  repository: string;
  fetch?: Fetch;
}): GitHubApi {
  const fetchImpl = options.fetch ?? fetch;
  const auth = `token ${options.token}`;
  const repo = `/repos/${options.repository}`;
  const [owner = ''] = options.repository.split('/');

  async function rest<T>(
    method: string,
    path: string,
    body?: unknown,
    okStatuses: number[] = [200, 201, 204],
  ): Promise<T> {
    const { status, data } = await call<T>(fetchImpl, auth, method, path, body);
    if (!okStatuses.includes(status))
      throw new GitHubError(status, `${method} ${path}: ${status} ${apiMessage(data)}`);
    return data;
  }

  async function graphql(query: string, variables: Record<string, unknown>): Promise<string[]> {
    const { status, data } = await call<{ errors?: { message: string }[] }>(
      fetchImpl,
      auth,
      'POST',
      '/graphql',
      {
        query,
        variables,
      },
    );
    if (status !== 200) throw new GitHubError(status, `GraphQL: ${status} ${apiMessage(data)}`);
    return (data.errors ?? []).map((e) => e.message);
  }

  return {
    async getPullRequest(number) {
      return mapPull(await rest<RestPull>('GET', `${repo}/pulls/${number}`));
    },

    async listPullRequestFiles(number) {
      const files: string[] = [];
      for (let page = 1; page <= 30; page += 1) {
        const batch = await rest<{ filename: string; previous_filename?: string }[]>(
          'GET',
          `${repo}/pulls/${number}/files?per_page=100&page=${page}`,
        );
        for (const f of batch)
          files.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
        if (batch.length < 100) return { files, truncated: false };
      }
      return { files, truncated: true };
    },

    async findOpenPullRequests(head, base) {
      const query = new URLSearchParams({
        state: 'open',
        head: `${owner}:${head}`,
        per_page: '50',
      });
      if (base) query.set('base', base);
      return (await rest<RestPull[]>('GET', `${repo}/pulls?${query.toString()}`)).map(mapPull);
    },

    async listPullRequestsForCommit(sha) {
      return (await rest<RestPull[]>('GET', `${repo}/commits/${sha}/pulls?per_page=50`)).map(
        mapPull,
      );
    },

    async listMergedPullRequests(base) {
      const query = new URLSearchParams({
        state: 'closed',
        base,
        sort: 'updated',
        direction: 'desc',
        per_page: '100',
      });
      return (await rest<RestPull[]>('GET', `${repo}/pulls?${query.toString()}`))
        .map(mapPull)
        .filter((pr) => pr.merged);
    },

    async createPullRequest(input) {
      return mapPull(
        await rest<RestPull>('POST', `${repo}/pulls`, { ...input, maintainer_can_modify: false }),
      );
    },

    async updatePullRequest(number, input) {
      await rest('PATCH', `${repo}/pulls/${number}`, input);
    },

    async enableAutoMerge(pr, method, expectedHeadSha): Promise<AutoMergeResult> {
      const errors = await graphql(
        `
          mutation ($id: ID!, $method: PullRequestMergeMethod!, $oid: GitObjectID!) {
            enablePullRequestAutoMerge(
              input: { pullRequestId: $id, mergeMethod: $method, expectedHeadOid: $oid }
            ) {
              pullRequest {
                number
              }
            }
          }
        `,
        { id: pr.nodeId, method, oid: expectedHeadSha },
      );
      if (errors.length === 0) return 'enabled';
      const text = errors.join(' ');
      if (/clean status|is in (a )?clean state/i.test(text)) return 'clean';
      if (/already (in auto[- ]?merge|enabled)/i.test(text)) return 'enabled';
      if (/expected head|head (oid|sha|ref).*(match|changed)|has been modified/i.test(text))
        return 'head-moved';
      throw new GitHubError(422, `enablePullRequestAutoMerge: ${text}`);
    },

    async disableAutoMerge(pr) {
      const errors = await graphql(
        `
          mutation ($id: ID!) {
            disablePullRequestAutoMerge(input: { pullRequestId: $id }) {
              pullRequest {
                number
              }
            }
          }
        `,
        { id: pr.nodeId },
      );
      const fatal = errors.filter(
        (m) => !/not (in auto[- ]?merge|enabled)|auto[- ]?merge is not/i.test(m),
      );
      if (fatal.length > 0)
        throw new GitHubError(422, `disablePullRequestAutoMerge: ${fatal.join(' ')}`);
    },

    async mergePullRequest(number, sha, method): Promise<MergeResult> {
      const { status } = await call(fetchImpl, auth, 'PUT', `${repo}/pulls/${number}/merge`, {
        sha,
        merge_method: MERGE_METHODS[method],
      });
      if (status === 200) return 'merged';
      if (status === 409) return 'head-moved';
      if (status === 405 || status === 422) return 'not-mergeable';
      throw new GitHubError(status, `merge PR #${number}: ${status}`);
    },

    async createComment(number, body) {
      await rest('POST', `${repo}/issues/${number}/comments`, { body });
    },

    async getBranchSha(branch) {
      const { status, data } = await call<{ object?: { sha: string } }>(
        fetchImpl,
        auth,
        'GET',
        `${repo}/git/ref/heads/${encodeRef(branch)}`,
      );
      if (status === 404) return null;
      if (status !== 200 || !data.object)
        throw new GitHubError(status, `GET ref ${branch}: ${status}`);
      return data.object.sha;
    },

    async deleteBranch(branch) {
      const { status, data } = await call(
        fetchImpl,
        auth,
        'DELETE',
        `${repo}/git/refs/heads/${encodeRef(branch)}`,
      );
      // 422 "Reference does not exist" = already deleted (duplicate event) — fine.
      if (status === 204 || (status === 422 && /does not exist/i.test(apiMessage(data)))) return;
      throw new GitHubError(status, `DELETE ref ${branch}: ${status} ${apiMessage(data)}`);
    },

    async getCommit(sha) {
      return mapCommit(await rest<RestCommit>('GET', `${repo}/git/commits/${sha}`));
    },

    async compare(base, head): Promise<Comparison> {
      const data = await rest<{
        ahead_by: number;
        behind_by: number;
        total_commits: number;
        merge_base_commit: RestCommit;
        commits: RestCommit[];
        files?: { filename: string; previous_filename?: string }[];
      }>('GET', `${repo}/compare/${encodeRef(base)}...${encodeRef(head)}?per_page=100`);
      const files = (data.files ?? []).flatMap((f) => [
        f.filename,
        ...(f.previous_filename ? [f.previous_filename] : []),
      ]);
      return {
        aheadBy: data.ahead_by,
        behindBy: data.behind_by,
        totalCommits: data.total_commits,
        mergeBase: mapCommit(data.merge_base_commit),
        commits: data.commits.map(mapCommit),
        files,
        // The compare API returns at most 300 files.
        filesTruncated: (data.files ?? []).length >= 300,
      };
    },

    async listStatuses(sha) {
      const data = await rest<
        {
          context: string;
          state: CommitStatus['state'];
          description: string | null;
          creator: { login: string } | null;
        }[]
      >('GET', `${repo}/commits/${sha}/statuses?per_page=100`);
      return data.map((s) => ({
        context: s.context,
        state: s.state,
        description: s.description ?? '',
        creatorLogin: s.creator?.login ?? '',
      }));
    },

    async createStatus(sha, status) {
      await rest('POST', `${repo}/statuses/${sha}`, {
        state: status.state,
        context: status.context,
        description: status.description.slice(0, 140),
        ...(status.targetUrl ? { target_url: status.targetUrl } : {}),
      });
    },
  };
}
