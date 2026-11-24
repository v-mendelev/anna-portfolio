/**
 * Contract tests for the GitHub Actions wiring of the delivery pipeline.
 * The decision logic is tested in src/lib/delivery; these tests pin the
 * event wiring and the security properties of the workflow files themselves.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(process.cwd(), '.github', 'workflows');
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8');
const source = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), 'utf8');
const DELIVERY = ['delivery-approve.yml', 'delivery-merge.yml', 'delivery-promote.yml'];

/** Text of a top-level YAML block (e.g. "on"), up to the next top-level key. */
function block(yaml: string, key: string): string {
  const match = new RegExp(`^${key}:\\n((?:[ #].*\\n|\\n)*)`, 'm').exec(yaml);
  return match?.[1] ?? '';
}

/** Lines of all `run:` steps (single-line and block scalars). */
function runScripts(yaml: string): string {
  const out: string[] = [];
  const lines = yaml.split('\n');
  lines.forEach((line, i) => {
    const m = /^(\s*)(- )?run:\s*(.*)$/.exec(line);
    if (!m) return;
    out.push(m[3] ?? '');
    // Indent of the `run` key itself; its block content is indented deeper.
    const keyIndent = (m[1] ?? '').length + (m[2] ? 2 : 0);
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? '';
      if (next.trim() !== '' && next.search(/\S/) <= keyIndent) break;
      out.push(next);
    }
  });
  return out.join('\n');
}

describe('CI and deploy wiring', () => {
  it('CI runs on every PR into dev and main (feature, promotion and sync PRs)', () => {
    const on = block(read('ci.yml'), 'on');
    expect(on).toMatch(/pull_request:\n\s+branches: \[main, dev\]/);
  });

  it('the Pages deploy runs on every push to main, after the full CI', () => {
    const yaml = read('deploy-pages.yml');
    expect(block(yaml, 'on')).toMatch(/push:\n\s+branches: \[main\]/);
    expect(yaml).toMatch(/checks:\n\s+name: Checks\n\s+uses: \.\/\.github\/workflows\/ci\.yml/);
  });

  it('the deploy records its commit and the live smoke verifies exactly that SHA', () => {
    const yaml = read('deploy-pages.yml');
    expect(yaml).toContain('> public/build-info.json');
    expect(yaml).toContain('run: node scripts/delivery/run.ts live-smoke');
    expect(yaml).toContain('EXPECTED_SHA: ${{ needs.build.outputs.sha }}');
    expect(yaml).toContain('context="delivery/live"');
    // Rollback stays possible: manual deploy of any ref.
    expect(block(yaml, 'on')).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+ref:/);
  });
});

describe('delivery workflows', () => {
  it.each(DELIVERY)(
    '%s: no default token permissions, App key only via the delivery environment',
    (name) => {
      const yaml = read(name);
      expect(yaml).toMatch(/^permissions: \{\}$/m);
      expect(yaml).toContain('environment: delivery');
      expect(yaml).toContain('vars.DELIVERY_REPOSITORY == github.repository'); // activation switch
      expect(yaml).toContain('DELIVERY_APP_PRIVATE_KEY: ${{ secrets.DELIVERY_APP_PRIVATE_KEY }}');
      // The workflow token is read-only; every write uses the App token.
      expect(yaml).not.toMatch(/:\s*write\b|write-all|read-all/);
    },
  );

  it.each(DELIVERY)('%s: never checks out or executes pull request code', (name) => {
    const yaml = read(name);
    expect(yaml).not.toMatch(
      /github\.event\.pull_request\.head|github\.head_ref|refs\/pull\/|workflow_run\.head_sha/,
    );
    expect(yaml).not.toMatch(/\bref:|\brepository:/); // default = the trusted default branch
    expect(yaml).toContain('persist-credentials: false');
    // No dependency install next to the App key: only Node built-ins run.
    expect(runScripts(yaml)).not.toMatch(/\b(pnpm|npm|npx|yarn)\b/);
  });

  it.each(DELIVERY)(
    '%s: never downloads artifacts or restores caches next to the App key',
    (name) => {
      const yaml = read(name);
      expect(yaml).not.toMatch(/download-artifact|actions\/cache|gh run download|\bcache:/);
    },
  );

  it.each(DELIVERY)('%s: untrusted event text is never interpolated into shell', (name) => {
    expect(runScripts(read(name))).not.toContain('${{');
  });

  it("approval starts only from the repository owner's own comment (fail-closed gate)", () => {
    const yaml = read('delivery-approve.yml');
    expect(block(yaml, 'on')).toMatch(/issue_comment:\n\s+types: \[created\]/);
    const gate = /approve:\n\s+name: [^\n]+\n\s+if: >-\n((?:\s{6}.+\n)+)/.exec(yaml)?.[1] ?? '';
    expect(gate).toContain('vars.DELIVERY_REPOSITORY == github.repository');
    expect(gate).toContain('github.event.issue.pull_request');
    expect(gate).toContain(`startsWith(github.event.comment.body, '/publish-approve ')`);
    expect(gate).toContain("github.event.comment.user.type == 'User'");
    expect(gate).toContain('github.event.comment.user.login == github.repository_owner');
    expect(gate).not.toContain('||'); // every condition is required
  });

  it('the gate diagnosis holds no secrets, environment, checkout or token permissions', () => {
    const yaml = read('delivery-approve.yml');
    const diagnose = yaml.slice(yaml.indexOf('\n  diagnose:'));
    expect(diagnose.length).toBeGreaterThan(20);
    expect(diagnose).toMatch(/permissions: \{\}/);
    expect(diagnose).not.toMatch(/secrets\.|environment:|uses:|github\.token|comment\.body \}\}/);
    expect(runScripts(diagnose)).not.toContain('${{');
  });

  it('the merge runs when CI completes for feature branches, from the default branch only', () => {
    const yaml = read('delivery-merge.yml');
    expect(block(yaml, 'on')).toMatch(
      /workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \['feature\/\*\*'\]/,
    );
    // Job-level gate: activated, successful, a pull_request run, same repository.
    expect(yaml).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(yaml).toContain("github.event.workflow_run.event == 'pull_request'");
    expect(yaml).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    );
    expect(yaml).toContain('run: node scripts/delivery/run.ts merge');
    expect(yaml).toMatch(/cancel-in-progress: false/);
    // The workflow it listens to is the CI with the required check.
    expect(read('ci.yml')).toMatch(/^name: CI$/m);
    expect(read('ci.yml')).toMatch(/name: CI passed/);
  });

  it('read-only CI access: approve and merge get only contents/actions/checks read', () => {
    for (const name of ['delivery-approve.yml', 'delivery-merge.yml']) {
      const yaml = read(name);
      expect(yaml, name).toMatch(
        /permissions:\n\s+contents: read\n\s+actions: read\n\s+checks: read\n\s+steps:/,
      );
      expect(yaml, name).toContain('GITHUB_TOKEN: ${{ github.token }}');
    }
    expect(read('delivery-promote.yml')).not.toMatch(/GITHUB_TOKEN|github\.token/);
  });

  it("promotion runs after pushes to main and after CI of pushes to dev — always main's code", () => {
    const yaml = read('delivery-promote.yml');
    const on = block(yaml, 'on');
    expect(on).toMatch(/push:\n\s+branches: \[main\]/);
    expect(on).not.toMatch(/push:\n\s+branches: \[[^\]]*dev/); // dev's own file never runs with the key
    expect(on).toMatch(
      /workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \[dev\]/,
    );
    expect(yaml).toContain("github.event.workflow_run.event == 'push'");
    expect(yaml).toMatch(/concurrency:\n\s+group: delivery-promote\n\s+cancel-in-progress: false/);
  });

  // issue_comment always runs the default branch's file, so delivery-approve.yml
  // relies on that plus the main-only `delivery` environment.
  it.each(['delivery-merge.yml', 'delivery-promote.yml'])(
    '%s: runs only from the default branch (defence in depth)',
    (name) => {
      expect(read(name)).toContain(
        "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)",
      );
    },
  );

  it.each(DELIVERY)(
    '%s: concurrency is job-level, so runs filtered out by `if:` never occupy the queue',
    (name) => {
      const yaml = read(name);
      expect(block(yaml, 'concurrency')).toBe(''); // no workflow-level concurrency
      expect(yaml).toMatch(/^ {4}concurrency:\n {6}group: delivery-/m);
    },
  );

  it('merges use the App token and the SHA; GITHUB_TOKEN only reads CI results', () => {
    const runner = source('scripts', 'delivery', 'run.ts');
    expect(runner).toContain('createInstallationToken(');
    expect(runner).toContain('readAppCredentials(process.env)');
    const uses = runner.split('\n').filter((l) => l.includes("'GITHUB_TOKEN'"));
    expect(uses).toHaveLength(1);
    expect(uses[0]).toContain('createCiReader(');
    const merge = source('src', 'lib', 'delivery', 'merge.ts');
    expect(merge).toContain('api.mergePullRequest(number, expectedSha, FEATURE_MERGE_METHOD)');
    expect(merge).not.toContain('enableAutoMerge');
    expect(source('src', 'lib', 'delivery', 'approve.ts')).not.toContain('enableAutoMerge');
  });

  it('commands holding the App key statically import only manual-merge-only pipeline code', () => {
    const runner = source('scripts', 'delivery', 'run.ts');
    const imports = [...runner.matchAll(/\bfrom '([^']+)'/g)].map((m) => m[1] ?? '');
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(spec).toMatch(/^(node:|\.\.\/\.\.\/src\/lib\/delivery\/)/);
  });

  it.each(DELIVERY)(
    '%s: third-party actions next to the App key are pinned by commit SHA',
    (name) => {
      for (const [, ref = ''] of read(name).matchAll(/uses: [\w./-]+@(\S+)/g))
        expect(ref).toMatch(/^[0-9a-f]{40}$/);
    },
  );

  it('no workflow uses pull_request_target; workflow_run only in delivery-merge/promote', () => {
    const files = readdirSync(DIR);
    expect(files).not.toContain('delivery-pr.yml');
    for (const name of files) {
      const yaml = read(name);
      expect(yaml, name).not.toContain('pull_request_target');
      if (!['delivery-merge.yml', 'delivery-promote.yml'].includes(name))
        expect(block(yaml, 'on'), name).not.toContain('workflow_run');
    }
  });
});
