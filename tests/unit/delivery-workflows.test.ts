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
const DELIVERY = ['delivery-approve.yml', 'delivery-pr.yml', 'delivery-promote.yml'];

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
      expect(yaml).not.toMatch(/contents: write|pull-requests: write|statuses: write/);
    },
  );

  it.each(DELIVERY)('%s: never checks out or executes pull request code', (name) => {
    const yaml = read(name);
    expect(yaml).not.toMatch(/github\.event\.pull_request\.head|github\.head_ref|refs\/pull\//);
    expect(yaml).not.toMatch(/\bref:/); // default ref = trusted base/default branch
    expect(yaml).toContain('persist-credentials: false');
    // No dependency install next to the App key: only Node built-ins run.
    expect(runScripts(yaml)).not.toMatch(/\b(pnpm|npm|npx|yarn)\b/);
  });

  it.each(DELIVERY)('%s: untrusted event text is never interpolated into shell', (name) => {
    expect(runScripts(read(name))).not.toContain('${{');
  });

  it('approval comes only from issue_comment by write-access associations', () => {
    const yaml = read('delivery-approve.yml');
    expect(block(yaml, 'on')).toMatch(/issue_comment:\n\s+types: \[created\]/);
    expect(yaml).toContain(`startsWith(github.event.comment.body, '/publish-approve ')`);
    expect(yaml).toContain(
      `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)`,
    );
  });

  it('the guard/cleanup reacts to new commits and merges of PRs into dev', () => {
    const on = block(read('delivery-pr.yml'), 'on');
    expect(on).toMatch(
      /pull_request_target:\n\s+types: \[synchronize, converted_to_draft, reopened, edited, closed\]\n(?:\s+#.*\n)*\s+branches: \[dev, main\]/,
    );
  });

  it('promotion runs after every push to dev and main, serialized and never cancelled', () => {
    const yaml = read('delivery-promote.yml');
    expect(block(yaml, 'on')).toMatch(/push:\n\s+branches: \[dev, main\]/);
    expect(yaml).toMatch(/concurrency:\n\s+group: delivery-promote\n\s+cancel-in-progress: false/);
  });

  it('merges are made with the App installation token (GITHUB_TOKEN would not trigger CI or Pages)', () => {
    const runner = readFileSync(join(process.cwd(), 'scripts', 'delivery', 'run.ts'), 'utf8');
    expect(runner).toContain('createInstallationToken(');
    expect(runner).not.toContain('GITHUB_TOKEN');
    for (const name of DELIVERY) expect(read(name)).not.toMatch(/GITHUB_TOKEN|github\.token/);
  });

  it('commands holding the App key statically import only manual-merge-only pipeline code', () => {
    const runner = readFileSync(join(process.cwd(), 'scripts', 'delivery', 'run.ts'), 'utf8');
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

  it('no workflow uses workflow_run, and pull_request_target exists only in the guard', () => {
    for (const name of readdirSync(DIR)) {
      const on = block(read(name), 'on');
      expect(on, name).not.toContain('workflow_run');
      if (name !== 'delivery-pr.yml') expect(on, name).not.toContain('pull_request_target');
    }
  });
});
