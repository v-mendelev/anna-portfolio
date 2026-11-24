/**
 * In-memory GitHub used by the delivery unit tests. It models the parts of
 * GitHub behaviour the pipeline relies on: commit graph, branches, PRs,
 * commit statuses, native auto-merge (merges only after required checks pass,
 * bound to the expected head SHA) and the merge API's SHA guard.
 * Test-only: never imported by the site or by scripts/delivery/run.ts.
 */
import { createHash } from 'node:crypto';
import type { DeliveryConfig } from './config.ts';
import { loadDeliveryConfig } from './config.ts';
import type {
  Actor,
  AutoMergeResult,
  CheckRun,
  CiApi,
  CommitInfo,
  CommitStatus,
  Comparison,
  GitHubApi,
  IssueComment,
  Logger,
  MergeMethod,
  MergeResult,
  PullRequest,
  WorkflowRun,
} from './types.ts';

export const REPO = 'owner/site';
export const APP_BOT = 'site-delivery[bot]';
export const OWNER: Actor = { login: 'owner', type: 'User' };
export const DEPENDABOT: Actor = { login: 'dependabot[bot]', type: 'Bot' };

export function testConfig(): DeliveryConfig {
  return loadDeliveryConfig({ GITHUB_REPOSITORY: REPO, DELIVERY_REPOSITORY: REPO });
}

export function sha(label: string): string {
  return createHash('sha1').update(label).digest('hex');
}

export function silentLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return { lines, info: (m) => lines.push(m), warn: (m) => lines.push(`WARN ${m}`) };
}

let counter = 0;

export class FakeGitHub implements GitHubApi, CiApi {
  readonly commits = new Map<string, CommitInfo>();
  readonly commitFiles = new Map<string, string[]>();
  readonly branches = new Map<string, string>();
  readonly pulls = new Map<number, PullRequest>();
  readonly pullFiles = new Map<number, string[]>();
  readonly commitPulls = new Map<string, Set<number>>();
  readonly statuses = new Map<string, CommitStatus[]>();
  readonly comments: { number: number; body: string }[] = [];
  readonly merges: { number: number; method: MergeMethod; sha: string }[] = [];
  readonly deleted: string[] = [];
  readonly autoMerge = new Map<number, { method: MergeMethod; sha: string }>();
  /** PRs whose required checks are already green (GitHub answers "clean status"). */
  readonly greenChecks = new Set<number>();
  /** Inject failures: method name → error. */
  readonly failOn = new Map<string, Error>();
  /** Comments people wrote (looked up by the merge gate). */
  readonly issueComments = new Map<number, IssueComment>();
  readonly runs: WorkflowRun[] = [];
  readonly checkRuns: CheckRun[] = [];
  /** PRs GitHub refuses to merge (merge conflict). */
  readonly conflicts = new Set<number>();
  private nextPr = 1;
  private nextRun = 1;
  private nextComment = 5000;

  // ---------- builders ----------

  commit(parents: string[], files: string[] = [], tree?: string): string {
    counter += 1;
    const id = sha(`commit-${counter}`);
    const parentTree = parents[0] ? this.commits.get(parents[0])?.treeSha : undefined;
    const treeSha =
      tree ?? (files.length === 0 && parentTree ? parentTree : sha(`tree-${counter}`));
    this.commits.set(id, { sha: id, treeSha, parents });
    this.commitFiles.set(id, files);
    return id;
  }

  /** Adds a commit on top of a branch (a push). */
  push(branch: string, files: string[] = ['src/x.ts']): string {
    const tip = this.branches.get(branch);
    const id = this.commit(tip ? [tip] : [], files);
    this.branches.set(branch, id);
    for (const pr of this.pulls.values()) {
      if (pr.state === 'open' && pr.head.ref === branch) {
        pr.head.sha = id;
        this.greenChecks.delete(pr.number);
      }
    }
    return id;
  }

  openPr(input: {
    head: string;
    base: string;
    author?: Actor;
    draft?: boolean;
    files?: string[];
    fork?: boolean;
  }): PullRequest {
    const headSha = this.branches.get(input.head);
    if (!headSha) throw new Error(`no branch ${input.head}`);
    const number = this.nextPr++;
    const pr: PullRequest = {
      number,
      nodeId: `PR_${number}`,
      state: 'open',
      merged: false,
      draft: input.draft ?? false,
      title: `PR ${number}`,
      htmlUrl: `https://github.com/${REPO}/pull/${number}`,
      author: input.author ?? OWNER,
      base: { ref: input.base, repoFullName: REPO },
      head: { ref: input.head, sha: headSha, repoFullName: input.fork ? 'evil/site' : REPO },
      mergeCommitSha: null,
      autoMergeEnabled: false,
    };
    this.pulls.set(number, pr);
    this.pullFiles.set(number, input.files ?? ['src/x.ts']);
    return pr;
  }

  /** A person comments on a PR; returns the comment (its id is what approvals reference). */
  writeComment(
    number: number,
    body: string,
    author: Actor = OWNER,
    association = 'OWNER',
  ): IssueComment {
    const comment = { id: this.nextComment++, issueNumber: number, body, author, association };
    this.issueComments.set(comment.id, comment);
    return structuredClone(comment);
  }

  /** CI starts for a PR's current head (workflow run + required check in progress). */
  startChecks(number: number): WorkflowRun {
    const pr = this.pull(number);
    const id = this.nextRun++;
    const run: WorkflowRun = {
      id,
      name: 'CI',
      path: '.github/workflows/ci.yml',
      event: 'pull_request',
      status: 'in_progress',
      conclusion: null,
      headSha: pr.head.sha,
      headBranch: pr.head.ref,
      headRepoFullName: pr.head.repoFullName,
      pullRequests: pr.head.repoFullName === REPO ? [{ number, baseRef: pr.base.ref }] : [],
      checkSuiteId: 900 + id,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
    };
    this.runs.push(run);
    this.checkRuns.push({
      name: 'CI passed',
      status: 'in_progress',
      conclusion: null,
      appSlug: 'github-actions',
      checkSuiteId: run.checkSuiteId,
      headSha: pr.head.sha,
    });
    return structuredClone(run);
  }

  /**
   * Simulates the end of the required checks ("CI passed") for a PR's current
   * head: completes the latest CI run (or a new one) and returns it, so tests
   * can deliver the matching workflow_run event.
   */
  finishChecks(number: number, passed: boolean): WorkflowRun {
    const pr = this.pull(number);
    let run = [...this.runs]
      .reverse()
      .find(
        (r) =>
          r.headSha === pr.head.sha && r.headBranch === pr.head.ref && r.status !== 'completed',
      );
    if (!run) {
      this.startChecks(number);
      run = this.runs.at(-1);
    }
    if (!run) throw new Error('no run');
    run.status = 'completed';
    run.conclusion = passed ? 'success' : 'failure';
    const suite = run.checkSuiteId;
    for (const c of this.checkRuns.filter((x) => x.checkSuiteId === suite)) {
      c.status = 'completed';
      c.conclusion = passed ? 'success' : 'failure';
    }
    if (!passed) {
      this.greenChecks.delete(number);
      return structuredClone(run);
    }
    this.greenChecks.add(number);
    const auto = this.autoMerge.get(number);
    if (auto && pr.state === 'open' && !pr.draft && auto.sha === pr.head.sha)
      this.performMerge(pr, auto.method);
    return structuredClone(run);
  }

  /** A human merges in the UI (no automation involved). */
  manualMerge(number: number, method: MergeMethod = 'SQUASH'): void {
    this.performMerge(this.pull(number), method);
  }

  /** Pushes a new commit to a PR's head branch. */
  pushToPr(number: number, files: string[] = ['src/y.ts']): string {
    return this.push(this.pull(number).head.ref, files);
  }

  statusOf(target: string, context: string): CommitStatus | undefined {
    return this.statuses.get(target)?.find((s) => s.context === context);
  }

  private pull(number: number): PullRequest {
    const pr = this.pulls.get(number);
    if (!pr) throw new Error(`no PR #${number}`);
    return pr;
  }

  private maybeFail(method: string): void {
    const error = this.failOn.get(method);
    if (error) throw error;
    // One-shot hook: simulates someone changing the PR while the gate is reading.
    const hook = this.onCall.get(method);
    if (hook) {
      this.onCall.delete(method);
      hook();
    }
  }

  /** Method name → action run once when that method is next called. */
  readonly onCall = new Map<string, () => void>();

  private ancestors(start: string): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const p of this.commits.get(id)?.parents ?? []) stack.push(p);
    }
    return order;
  }

  private performMerge(pr: PullRequest, method: MergeMethod): void {
    const baseTip = this.branches.get(pr.base.ref);
    const head = this.commits.get(pr.head.sha);
    if (!baseTip || !head) throw new Error('bad merge');
    const prCommits = this.ancestors(pr.head.sha).filter(
      (c) => !this.ancestors(baseTip).includes(c),
    );
    const files = [...new Set(prCommits.flatMap((c) => this.commitFiles.get(c) ?? []))];
    const baseTree = this.commits.get(baseTip)?.treeSha;
    // A merge that brings in no file changes keeps the base tree (content-neutral).
    const tree = files.length === 0 && baseTree ? baseTree : head.treeSha;
    const parents = method === 'SQUASH' ? [baseTip] : [baseTip, pr.head.sha];
    const merged = this.commit(parents, method === 'SQUASH' ? files : [], tree);
    if (method !== 'SQUASH') this.commitFiles.set(merged, []);
    this.branches.set(pr.base.ref, merged);
    for (const c of method === 'SQUASH' ? [merged] : [...prCommits, merged]) {
      const set = this.commitPulls.get(c) ?? new Set<number>();
      set.add(pr.number);
      this.commitPulls.set(c, set);
    }
    pr.state = 'closed';
    pr.merged = true;
    pr.mergeCommitSha = merged;
    pr.autoMergeEnabled = false;
    this.autoMerge.delete(pr.number);
    this.merges.push({ number: pr.number, method, sha: pr.head.sha });
    // Open PRs whose head is the base branch follow it (e.g. promotion PR head = dev).
    for (const other of this.pulls.values()) {
      if (other.state === 'open' && other.head.ref === pr.base.ref) {
        other.head.sha = merged;
        this.greenChecks.delete(other.number);
      }
    }
  }

  // ---------- GitHubApi ----------

  async getPullRequest(number: number): Promise<PullRequest> {
    this.maybeFail('getPullRequest');
    return structuredClone(this.pull(number));
  }

  async listPullRequestFiles(number: number): Promise<{ files: string[]; truncated: boolean }> {
    return { files: [...(this.pullFiles.get(number) ?? [])], truncated: false };
  }

  async findOpenPullRequests(head: string, base?: string): Promise<PullRequest[]> {
    return [...this.pulls.values()]
      .filter(
        (p) =>
          p.state === 'open' &&
          p.head.ref === head &&
          p.head.repoFullName === REPO &&
          (!base || p.base.ref === base),
      )
      .map((p) => structuredClone(p));
  }

  async listPullRequestsForCommit(id: string): Promise<PullRequest[]> {
    if (!this.associationApiWorks) return [];
    const numbers = new Set(this.commitPulls.get(id) ?? []);
    // GitHub also lists open PRs that contain the commit.
    for (const pr of this.pulls.values()) {
      if (pr.state === 'open' && this.ancestors(pr.head.sha).includes(id)) numbers.add(pr.number);
    }
    return [...numbers].map((n) => structuredClone(this.pull(n)));
  }

  /** When false, the association API knows nothing about dev commits (worst case). */
  associationApiWorks = true;

  async listMergedPullRequests(base: string): Promise<PullRequest[]> {
    return [...this.pulls.values()]
      .filter((p) => p.merged && p.base.ref === base)
      .map((p) => structuredClone(p));
  }

  async createPullRequest(input: {
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<PullRequest> {
    this.maybeFail('createPullRequest');
    const pr = this.openPr({
      head: input.head,
      base: input.base,
      author: { login: APP_BOT, type: 'Bot' },
    });
    pr.title = input.title;
    return structuredClone(pr);
  }

  async updatePullRequest(number: number, input: { title: string; body: string }): Promise<void> {
    this.pull(number).title = input.title;
  }

  async enableAutoMerge(
    pr: PullRequest,
    method: MergeMethod,
    expectedHeadSha: string,
  ): Promise<AutoMergeResult> {
    this.maybeFail('enableAutoMerge');
    const live = this.pull(pr.number);
    if (live.head.sha !== expectedHeadSha) return 'head-moved';
    if (this.greenChecks.has(pr.number)) return 'clean';
    live.autoMergeEnabled = true;
    this.autoMerge.set(pr.number, { method, sha: expectedHeadSha });
    return 'enabled';
  }

  async disableAutoMerge(pr: PullRequest): Promise<void> {
    const live = this.pull(pr.number);
    live.autoMergeEnabled = false;
    this.autoMerge.delete(pr.number);
  }

  async mergePullRequest(number: number, id: string, method: MergeMethod): Promise<MergeResult> {
    this.maybeFail('mergePullRequest');
    const pr = this.pull(number);
    if (pr.head.sha !== id) return 'head-moved';
    // Branch protection: required "CI passed" for the head; no draft; no conflict.
    if (
      pr.state !== 'open' ||
      pr.draft ||
      !this.greenChecks.has(number) ||
      this.conflicts.has(number)
    )
      return 'not-mergeable';
    this.performMerge(pr, method);
    return 'merged';
  }

  async createComment(number: number, body: string): Promise<void> {
    this.comments.push({ number, body });
  }

  async getIssueComment(id: number): Promise<IssueComment | null> {
    this.maybeFail('getIssueComment');
    const c = this.issueComments.get(id);
    return c ? structuredClone(c) : null;
  }

  // ---------- CiApi ----------

  async listWorkflowRuns(workflowFile: string, headSha: string): Promise<WorkflowRun[]> {
    this.maybeFail('listWorkflowRuns');
    return this.runs
      .filter(
        (r) =>
          r.path.endsWith(`/${workflowFile}`) &&
          r.headSha === headSha &&
          r.event === 'pull_request',
      )
      .map((r) => structuredClone(r));
  }

  async getWorkflowRun(id: number): Promise<WorkflowRun> {
    const run = this.runs.find((r) => r.id === id);
    if (!run) throw new Error(`no run ${id}`);
    return structuredClone(run);
  }

  async listCheckRuns(checkSuiteId: number, name: string): Promise<CheckRun[]> {
    this.maybeFail('listCheckRuns');
    return this.checkRuns
      .filter((c) => c.checkSuiteId === checkSuiteId && c.name === name)
      .map((c) => structuredClone(c));
  }

  async getBranchSha(branch: string): Promise<string | null> {
    return this.branches.get(branch) ?? null;
  }

  async deleteBranch(branch: string): Promise<void> {
    this.maybeFail('deleteBranch');
    this.branches.delete(branch);
    this.deleted.push(branch);
  }

  async getCommit(id: string): Promise<CommitInfo> {
    this.maybeFail('getCommit');
    const c =
      this.commits.get(id) ??
      [...this.commits.values()].find((x) => x.sha === this.branches.get(id));
    if (!c) throw new Error(`no commit ${id}`);
    return structuredClone(c);
  }

  async compare(base: string, head: string): Promise<Comparison> {
    const baseSha = this.branches.get(base) ?? base;
    const headSha = this.branches.get(head) ?? head;
    const baseAnc = this.ancestors(baseSha);
    const headAnc = this.ancestors(headSha);
    const ahead = headAnc.filter((c) => !baseAnc.includes(c)).reverse();
    const behind = baseAnc.filter((c) => !headAnc.includes(c));
    const common = headAnc.filter((c) => baseAnc.includes(c));
    const mergeBaseSha = common[0];
    const mergeBase = mergeBaseSha ? this.commits.get(mergeBaseSha) : undefined;
    if (!mergeBase) throw new Error('no merge base');
    const files = [...new Set(ahead.flatMap((c) => this.commitFiles.get(c) ?? []))];
    return {
      aheadBy: ahead.length,
      behindBy: behind.length,
      totalCommits: ahead.length,
      mergeBase: structuredClone(mergeBase),
      commits: ahead.map((c) => structuredClone(this.commits.get(c) as CommitInfo)),
      files,
      filesTruncated: false,
    };
  }

  async listStatuses(id: string): Promise<CommitStatus[]> {
    return structuredClone(this.statuses.get(id) ?? []);
  }

  async createStatus(
    id: string,
    status: { state: CommitStatus['state']; context: string; description: string },
  ): Promise<void> {
    this.maybeFail('createStatus');
    this.addStatus(id, { ...status, creatorLogin: APP_BOT });
  }

  /** Statuses written by someone else (e.g. GITHUB_TOKEN in a PR workflow). */
  addStatus(id: string, status: CommitStatus): void {
    const list = this.statuses.get(id) ?? [];
    list.unshift(status);
    this.statuses.set(id, list);
  }
}

/** Repository with main and dev at the same commit, like after a promotion. */
export function seededRepo(): { gh: FakeGitHub; root: string } {
  const gh = new FakeGitHub();
  const root = gh.commit([], ['README.md']);
  gh.branches.set('main', root);
  gh.branches.set('dev', root);
  return { gh, root };
}
