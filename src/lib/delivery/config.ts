/**
 * Delivery pipeline configuration.
 *
 * Everything project-specific comes from GitHub repository variables, so the
 * same code works for any site built from this starter. The pipeline is inert
 * until `DELIVERY_REPOSITORY` equals the running repository — that variable is
 * the explicit activation switch (forks and template copies stay inactive).
 */

export interface DeliveryConfig {
  /** "owner/name" of the repository the pipeline is allowed to act on. */
  repository: string;
  owner: string;
  devBranch: string;
  mainBranch: string;
  /** Only branches with this prefix are eligible for approval and cleanup. */
  featurePrefix: string;
  /** Lower-cased GitHub logins whose `/publish-approve` comments count. */
  approvers: readonly string[];
  /** Commit status that records an approval (written only by the App). */
  approvalContext: string;
  /** Commit status on the dev head that explains the promotion decision. */
  promotionContext: string;
  /**
   * Paths the automation never merges on its own: the pipeline itself and the
   * workflows. Changes there need a human merge (and the App has no
   * `workflows` permission, so GitHub would refuse anyway).
   */
  manualOnlyPaths: readonly string[];
}

export interface DeliveryEnv {
  GITHUB_REPOSITORY?: string | undefined;
  DELIVERY_REPOSITORY?: string | undefined;
  DELIVERY_APPROVERS?: string | undefined;
  DELIVERY_DEV_BRANCH?: string | undefined;
  DELIVERY_MAIN_BRANCH?: string | undefined;
}

export class DeliveryNotActivatedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeliveryNotActivatedError';
  }
}

const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const DEFAULT_MANUAL_ONLY_PATHS: readonly string[] = [
  '.github/',
  'scripts/delivery/',
  'src/lib/delivery/',
];

function branch(value: string | undefined, fallback: string): string {
  const name = (value ?? '').trim() || fallback;
  if (!BRANCH_RE.test(name)) throw new Error(`Invalid branch name in delivery config: ${name}`);
  return name;
}

export function loadDeliveryConfig(env: DeliveryEnv): DeliveryConfig {
  const actual = (env.GITHUB_REPOSITORY ?? '').trim();
  const expected = (env.DELIVERY_REPOSITORY ?? '').trim();
  if (!expected) {
    throw new DeliveryNotActivatedError(
      'DELIVERY_REPOSITORY is not set: delivery automation is not activated.',
    );
  }
  if (!REPO_RE.test(expected)) throw new Error('DELIVERY_REPOSITORY must look like "owner/name".');
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new DeliveryNotActivatedError(
      `Running in ${actual || '(unknown)'}, but delivery is activated only for ${expected}.`,
    );
  }
  const [owner = ''] = expected.split('/');

  const approvers = (env.DELIVERY_APPROVERS ?? '')
    .split(',')
    .map((login) => login.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean);
  for (const login of approvers) {
    if (!LOGIN_RE.test(login)) throw new Error(`Invalid approver login: ${login}`);
  }

  const devBranch = branch(env.DELIVERY_DEV_BRANCH, 'dev');
  const mainBranch = branch(env.DELIVERY_MAIN_BRANCH, 'main');
  if (devBranch === mainBranch) throw new Error('dev and main branches must differ.');

  return {
    repository: expected,
    owner,
    devBranch,
    mainBranch,
    featurePrefix: 'feature/',
    // Default: only the repository owner may approve.
    approvers: approvers.length > 0 ? approvers : [owner.toLowerCase()],
    approvalContext: 'delivery/approval',
    promotionContext: 'delivery/promotion',
    manualOnlyPaths: DEFAULT_MANUAL_ONLY_PATHS,
  };
}
