/**
 * workflow_run handler: CI finished for a feature/* pull request.
 *
 * GitHub runs this from the default branch's workflow file, so no PR code is
 * involved. The event payload is used only as a trigger: the run is re-read by
 * id and every PR is re-evaluated by the merge gate from fresh API state.
 * No artifacts are downloaded.
 */
import type { MergeContext, MergeOutcome } from './merge.ts';
import { mergeIfApproved } from './merge.ts';
import { isFeatureBranch } from './policy.ts';

export interface WorkflowRunEvent {
  action: string;
  repository: { full_name: string };
  workflow_run: { id: number; head_sha: string };
}

export type WorkflowRunOutcome =
  { status: 'ignored'; reason: string } | { status: 'evaluated'; results: MergeOutcome[] };

export async function handleWorkflowRun(
  event: WorkflowRunEvent,
  ctx: MergeContext,
): Promise<WorkflowRunOutcome> {
  const { api, ci, cfg, log } = ctx;
  const repo = cfg.repository.toLowerCase();
  if (event.repository.full_name.toLowerCase() !== repo)
    return { status: 'ignored', reason: 'event is not from the activated repository' };
  if (event.action !== 'completed') return { status: 'ignored', reason: 'run not completed' };

  // Authoritative copy of the run; the payload only tells us which one.
  const run = await ci.getWorkflowRun(event.workflow_run.id);
  if (run.headSha !== event.workflow_run.head_sha)
    return { status: 'ignored', reason: 'run does not match the event' };
  if (run.path !== cfg.ciWorkflowPath) return { status: 'ignored', reason: 'not the CI workflow' };
  if (run.event !== 'pull_request')
    return { status: 'ignored', reason: 'CI was not triggered by a pull request' };
  if (run.status !== 'completed' || run.conclusion !== 'success')
    return { status: 'ignored', reason: 'CI did not succeed' };
  if (run.headRepoFullName.toLowerCase() !== repo)
    return { status: 'ignored', reason: 'run is for a fork' };
  if (!isFeatureBranch(run.headBranch, cfg))
    return { status: 'ignored', reason: 'not a feature branch' };

  // PRs of this run: GitHub's association plus open PRs from the branch into dev.
  const numbers = new Set(run.pullRequests.map((p) => p.number));
  for (const pr of await api.findOpenPullRequests(run.headBranch, cfg.devBranch))
    numbers.add(pr.number);
  if (numbers.size === 0) return { status: 'ignored', reason: 'no pull request for this run' };

  const results: MergeOutcome[] = [];
  for (const number of [...numbers].sort((a, b) => a - b)) {
    const outcome = await mergeIfApproved(ctx, number, run.headSha);
    log.info(`PR #${number}: ${outcome.status}`);
    results.push(outcome);
  }
  return { status: 'evaluated', results };
}
