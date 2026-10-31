"""Real git-history release reservations plus draft lifecycle, image, docs-asset
and dispatch regressions against a documented GitHub-faithful local store."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

import release

# The publish/dispatch polling loops sleep between store polls; the fake store
# resolves immediately, so elide the waits.
release.time.sleep = lambda seconds: None

DOCS_NAME = 'index.html'


class LocalGitHub(release.Repository):
    """Local git remote (tags/branches) plus a store that mirrors the documented
    GitHub boundary: releases/tags/{tag} returns published records only, while
    the authenticated paginated releases listing includes drafts."""

    GHCR = 'ghcr.io/example/m4b-merge'

    def __init__(self, root, remote):
        super().__init__(root)
        self.remote = remote
        self.releases = []
        self.release_commands = []
        self.latest = None
        self.assets = []
        self.upload_commands = []
        self.api_writes = []
        self.dispatches = []
        self.runs = []
        self.jobs = {}
        self.steps = {}
        self.run_conclusions = {}
        self.step_conclusions = {}
        self.download_bytes = None
        self.downloads = 0

    def repository(self):
        return 'example/m4b-merge'

    def remote_git(self, *args):
        return self.run('git', '--git-dir', str(self.remote), *args)

    def api(self, endpoint, method='GET', fields=None):
        path = endpoint.removeprefix('repos/example/m4b-merge/')
        if path == 'git/refs' and method == 'POST':
            self.remote_git('update-ref', fields['ref'], fields['sha'], '0' * 40)
            return {'ref': fields['ref']}
        if path.startswith('git/ref/'):
            ref = path.removeprefix('git/ref/')
            return {'object': {'type': 'commit',
                                'sha': self.remote_git('rev-parse', f'refs/{ref}^{{commit}}')}}
        if path.startswith('releases/tags/'):
            # GitHub documents releases/tags/{tag} as a published-release lookup.
            tag = path.removeprefix('releases/tags/')
            for record in self.releases:
                if record['tag_name'] == tag and not record['draft']:
                    return dict(record, assets=[dict(asset) for asset in self.assets])
            raise release.ReleaseError('HTTP 404: Not Found')
        if path == 'releases/latest':
            record = next((r for r in self.releases if r['tag_name'] == self.latest), None) \
                if self.latest is not None else None
            if record is None:
                raise release.ReleaseError('HTTP 404: Not Found')
            return dict(record)
        if path.startswith('releases?'):
            page = int(path.rsplit('page=', 1)[1])
            start = (page - 1) * 100
            return [dict(record, assets=[dict(asset) for asset in self.assets])
                    for record in self.releases[start:start + 100]]
        if path.startswith('releases/assets/'):
            asset_id = int(path.split('/')[2])
            asset = next((asset for asset in self.assets if asset['id'] == asset_id), None)
            if asset is None:
                raise release.ReleaseError('HTTP 404: Not Found')
            self.api_writes.append((method, fields))
            if method == 'PATCH':
                asset['label'] = fields['label']
            return dict(asset)
        if path.startswith('actions/workflows/'):
            return {'workflow_runs': [dict(run) for run in self.runs]}
        if path.startswith('actions/runs/') and path.endswith('/jobs'):
            run_id = int(path.split('/')[2])
            return {'jobs': [dict(job) for job in self.jobs.get(run_id, [])]}
        if path.startswith('actions/jobs/'):
            job_id = int(path.removeprefix('actions/jobs/'))
            return {'steps': [dict(step) for step in self.steps.get(job_id, [])]}
        raise AssertionError((endpoint, method, fields))

    def api_asset_download(self, repository, asset_id):
        self.downloads += 1
        if self.download_bytes is None:
            asset = next(asset for asset in self.assets if asset['id'] == asset_id)
            return asset['payload']
        return self.download_bytes

    def run(self, *args, ok=(0,)):
        if len(args) >= 4 and args[0] == 'gh' and args[1] == 'release' and args[2] in ('create', 'edit'):
            tag = args[3]
            existing = [record for record in self.releases if record['tag_name'] == tag]
            if args[2] == 'create':
                if existing:
                    raise release.ReleaseError(f'gh release create: release {tag} already exists')
                self.release_commands.append(('create', args))
                self.releases.append({'tag_name': tag, 'draft': '--draft' in args, 'prerelease': False})
                return ''
            self.release_commands.append(('edit', args))
            record = existing[0]
            if '--draft=false' in args:
                # A newly-published release defaults to GitHub Latest unless
                # the edit explicitly opts out (delayed lower completion).
                if record['draft'] and '--latest=false' not in args:
                    self.latest = record['tag_name']
                record['draft'] = False
            elif '--latest=true' in args:
                self.latest = record['tag_name']
            return ''
        if len(args) >= 5 and args[:3] == ('gh', 'release', 'upload'):
            tag, path_spec = args[3], args[4]
            name, _, label = path_spec.partition('#')
            name = name.rsplit('/', 1)[-1]  # gh release upload names assets by basename
            self.upload_commands.append(args)
            if not any(record['tag_name'] == tag for record in self.releases):
                raise release.ReleaseError(f'gh release upload: no release {tag}')
            payload = (self.root / 'docs' / DOCS_NAME).read_bytes()
            self.assets.append({'id': len(self.assets) + 1, 'name': name, 'payload': payload,
                                'label': label})
            return ''
        if len(args) >= 3 and args[:3] == ('gh', 'workflow', 'run', 'deploy-docs.yml'):
            inputs = {}
            for part in args[4:]:
                if part.startswith('-f'):
                    key, _, value = part[2:].partition('=')
                    inputs[key] = value
            run_id = len(self.runs) + 1
            self.dispatches.append(args)
            self.runs.append({'id': run_id,
                              'html_url': f'https://example.invalid/runs/{run_id}',
                              'display_title': f"Release docs {inputs.get('release_run')}",
                              'head_sha': inputs.get('source'),
                              'event': 'workflow_dispatch',
                              'status': 'completed'})
            self.jobs[run_id] = [{'id': run_id * 10 + 1, 'name': 'build-docs', 'conclusion': 'success'},
                                 {'id': run_id * 10 + 2, 'name': 'deploy', 'conclusion': 'success'}]
            self.steps[run_id * 10 + 2] = [
                {'name': 'Re-read the actual current main immediately before deploying',
                 'conclusion': 'success'},
                {'name': 'Verify the source is current main before deploying', 'conclusion': 'success'},
                {'name': 'Deploy to GitHub Pages', 'conclusion': 'success'},
            ]
            return ''
        if len(args) >= 3 and args[:3] == ('gh', 'run', 'watch'):
            run_id = int(args[3])
            conclusion = self.run_conclusions.get(run_id, 'success')
            job = self.jobs[run_id][-1]
            job['conclusion'] = conclusion
            if self.step_conclusions.get(run_id) is not None:
                for step in self.steps[job['id']]:
                    if str(step['name']).startswith('Deploy to GitHub Pages'):
                        step['conclusion'] = self.step_conclusions[run_id]
            if conclusion != 'success':
                raise release.ReleaseError(f'gh run watch: run {run_id} ended {conclusion}')
            return ''
        return super().run(*args, ok=ok)


class ReleaseBehavior(unittest.TestCase):

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='audnexus-release-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.remote = root / 'remote.git'
        self.checkout = root / 'checkout'
        self.cmd(root, 'git', 'init', '--bare', str(self.remote))
        self.cmd(root, 'git', 'init', '-b', 'main', str(self.checkout))
        self.repo = LocalGitHub(self.checkout, self.remote)
        for key, value in (('user.name', 'Release Test'), ('user.email', 'test@example.invalid'),
                           ('commit.gpgsign', 'false'), ('tag.gpgsign', 'false')):
            self.git('config', key, value)
        self.git('remote', 'add', 'origin', str(self.remote))
        self.commit('initial', 'one')
        self.git('tag', 'v1.0.0')
        self.git('push', 'origin', 'main', '--tags')
        self.git('switch', '-c', 'develop')
        self.commit('feat: new behavior', 'two')
        self.git('push', 'origin', 'develop')
        self.git('switch', 'main')
        self.git('merge', '--no-ff', 'develop', '-m', 'Promote develop')
        self.git('push', 'origin', 'main')
        self.source = self.git('rev-parse', 'HEAD')
        self.repo.fetch()

    def cmd(self, cwd, *args):
        result = subprocess.run(args, cwd=cwd, env=release.isolated_git_environment(), text=True,
                                capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def git(self, *args):
        return self.cmd(self.checkout, 'git', *args)

    def commit(self, message, content):
        (self.checkout / 'source.txt').write_text(content)
        self.git('add', 'source.txt')
        self.git('commit', '-m', message)

    def promote(self, message, content):
        self.git('switch', 'develop')
        (self.checkout / 'source.txt').write_text(content)
        self.git('add', 'source.txt')
        self.git('commit', '-m', message)
        self.git('push', 'origin', 'develop')
        self.git('switch', 'main')
        self.git('merge', '--no-ff', 'develop', '-m', 'Promote develop')
        self.git('push', 'origin', 'main')
        self.repo.fetch()
        return self.git('rev-parse', 'HEAD')

    def draft(self, version):
        self.assertEqual(self.repo.reserve(self.source, version=version), version)
        self.repo.fetch()
        self.repo.release(version, self.source)
        return self.repo.releases[-1]

    # --- reservation ------------------------------------------------------

    def test_reservation_reuses_exact_source_after_newer_release(self):
        tag = self.repo.reserve(self.source)
        self.assertEqual(tag, 'v1.1.0')
        newer = self.promote('fix: next behavior', 'three')
        self.assertEqual(self.repo.reserve(newer), 'v1.1.1')
        self.assertEqual(self.repo.reserve(self.source), tag)
        self.assertEqual(self.repo.remote_git('rev-parse', 'refs/tags/v1.1.0'), self.source)

    def test_unfinished_reservation_is_not_reallocated(self):
        self.assertEqual(self.repo.reserve(self.source), 'v1.1.0')
        self.assertEqual(self.repo.reserve(self.source, bump='major'), 'v1.1.0')
        self.assertEqual(self.repo.select(self.source, 'v1.1.0'), 'v1.1.0')
        with self.assertRaises(release.ReleaseError):
            self.repo.reserve(self.source, 'v2.0.0')

    def test_other_branch_tag_cannot_set_reachable_baseline(self):
        self.git('switch', '-c', 'unrelated', 'v1.0.0')
        self.commit('unrelated', 'elsewhere')
        self.git('tag', 'v99.0.0')
        self.git('push', 'origin', 'v99.0.0')
        self.repo.fetch()
        self.assertEqual(self.repo.select(self.source), 'v1.1.0')

    def test_explicit_different_source_collision_never_moves_tag(self):
        with self.assertRaises(release.ReleaseError):
            self.repo.reserve(self.source, 'v1.0.0')
        self.assertEqual(self.repo.remote_git('rev-parse', 'refs/tags/v1.0.0'),
                         self.git('rev-parse', 'v1.0.0'))

    def test_ambiguous_exact_source_reservations_fail(self):
        for tag in ('v1.1.0', 'v1.2.0'):
            self.git('tag', tag, self.source)
            self.git('push', 'origin', tag)
        self.repo.fetch()
        with self.assertRaises(release.ReleaseError):
            self.repo.select(self.source)

    def test_release_refuses_tag_pointing_at_another_source(self):
        initial = self.git('rev-parse', 'v1.0.0')
        self.assertNotEqual(initial, self.source)
        with self.assertRaisesRegex(release.ReleaseError, 'does not point at the frozen source'):
            self.repo.release('v1.0.0', self.source, publish=True)
        self.assertEqual(self.repo.remote_git('rev-parse', 'refs/tags/v1.0.0'), initial)

    def test_unreserved_automatic_candidate_is_coalesced_but_manual_is_not(self):
        old = self.source
        sha = self.promote('fix: next behavior', 'three')
        self.repo.reserve(sha, 'v1.2.0')
        self.repo.fetch()
        self.assertIsNone(self.repo.select(old, automatic=True))
        self.assertEqual(self.repo.select(old), 'v1.1.0')

    def test_automatic_candidate_is_superseded_by_later_main_release(self):
        later = self.promote('fix: next behavior', 'three')
        self.assertEqual(self.repo.reserve(later), 'v1.1.0')
        self.repo.fetch()
        # The automatic candidate for an older main source is moot once a
        # later main release was cut below it: no reservation is created.
        self.assertIsNone(self.repo.select(self.source, automatic=True))
        # Manual selection of that source still sees the identity conflict.
        with self.assertRaisesRegex(release.ReleaseError, 'reserved by another source'):
            self.repo.select(self.source)

    def test_bump_inference_major_minor_patch(self):
        # The feature branch already cut v1.1.0 on the base; bumping from
        # there exercises patch/minor/major inference off the baseline.
        self.assertEqual(self.repo.reserve(self.source), 'v1.1.0')
        patch = self.promote('fix: honor scopes', 'three')
        self.assertEqual(self.repo.select(patch), 'v1.1.1')
        minor = self.promote('feat: nested translations', 'four')
        self.assertEqual(self.repo.select(minor), 'v1.2.0')
        breaking = self.promote('BREAKING-CHANGE: rename scopes', 'five')
        self.assertEqual(self.repo.select(breaking), 'v2.0.0')
        # A breaking footer bumps major off the current baseline, too.
        self.assertEqual(self.repo.select(self.promote('feat!: drop rows', 'six')), 'v2.0.0')
        with self.assertRaisesRegex(release.ReleaseError, 'must exceed'):
            self.repo.select(breaking, 'v1.0.5')

    # --- draft-aware release lifecycle ------------------------------------

    def test_draft_is_invisible_to_by_tag_but_seen_by_lifecycle(self):
        draft = self.draft('v1.1.0')
        self.assertTrue(draft['draft'])
        with self.assertRaisesRegex(release.ReleaseError, 'HTTP 404'):
            self.repo.api('repos/example/m4b-merge/releases/tags/v1.1.0')
        record = self.repo.release_tag_record('example/m4b-merge', 'v1.1.0')
        self.assertIsNotNone(record)
        self.assertTrue(record['draft'])
        # The draft-aware asset lookup sees the (assetless) draft; absent tags
        # (not even a draft) fail closed.
        self.assertIsNone(release.release_assets(self.repo, 'v1.1.0'))
        with self.assertRaisesRegex(release.ReleaseError, 'no source-bound release record'):
            release.release_assets(self.repo, 'v0.0.1')

    def test_release_publish_cycle_advances_latest_for_highest_release(self):
        # v1.10.0 beats the published v1.9.0 numerically, not lexically.
        self.repo.releases.append({'tag_name': 'v1.9.0', 'draft': False, 'prerelease': False})
        self.repo.latest = 'v1.9.0'
        self.assertEqual(self.repo.api('repos/example/m4b-merge/releases/latest')['tag_name'],
                         'v1.9.0')
        draft = self.draft('v1.10.0')
        self.assertTrue(draft['draft'])
        self.repo.release('v1.10.0', self.source)
        self.assertEqual([name for name, _ in self.repo.release_commands], ['create'])
        self.assertIs(self.repo.releases[-1], draft)
        self.repo.release('v1.10.0', self.source, publish=True)
        self.assertEqual([name for name, _ in self.repo.release_commands], ['create', 'edit'])
        self.assertIn('--latest=true', self.repo.release_commands[-1][1])
        self.assertFalse(draft['draft'])
        self.assertEqual(self.repo.api('repos/example/m4b-merge/releases/latest')['tag_name'],
                         'v1.10.0')
        self.assertEqual(self.repo.remote_git('rev-parse', 'refs/tags/v1.10.0'), self.source)
        # An already-published retry is an idempotent no-op.
        self.repo.release('v1.10.0', self.source, publish=True)
        self.assertEqual([name for name, _ in self.repo.release_commands], ['create', 'edit'])
        self.assertEqual(len(self.repo.releases), 2)

    def test_delayed_lower_publish_does_not_rollback_latest(self):
        self.repo.releases.append({'tag_name': 'v1.3.0', 'draft': False, 'prerelease': False})
        self.repo.releases.append({'tag_name': 'v1.3.1-rc.1', 'draft': False, 'prerelease': True})
        self.repo.releases.append({'tag_name': 'v9.9.9', 'draft': True, 'prerelease': False})
        self.repo.latest = 'v1.3.0'
        self.assertEqual(self.repo.api('repos/example/m4b-merge/releases/latest')['tag_name'],
                         'v1.3.0')
        initial = self.git('rev-parse', 'v1.0.0')
        self.repo.release('v1.0.0', initial)
        self.repo.release('v1.0.0', initial, publish=True)
        self.assertIn('--latest=false', self.repo.release_commands[-1][1])
        self.assertEqual(self.repo.api('repos/example/m4b-merge/releases/latest')['tag_name'],
                         'v1.3.0')

    def test_release_listing_paginates_beyond_one_page(self):
        self.repo.releases.extend({'tag_name': f'v2.{index // 100}.{index % 100}',
                                   'draft': False, 'prerelease': False} for index in range(205))
        self.repo.latest = 'v2.2.4'
        self.assertEqual(self.repo.api('repos/example/m4b-merge/releases/latest')['tag_name'],
                         'v2.2.4')
        # A new highest stable advances Latest even when the listing spans pages.
        self.draft('v3.0.0')
        self.repo.release('v3.0.0', self.source, publish=True)
        self.assertIn('--latest=true', self.repo.release_commands[-1][1])
        self.assertEqual(self.repo.api('repos/example/m4b-merge/releases/latest')['tag_name'],
                         'v3.0.0')

    def test_duplicate_release_records_fail_closed_without_writes(self):
        records = [{'tag_name': 'v1.0.0', 'draft': False, 'prerelease': False},
                   {'tag_name': 'v1.0.0', 'draft': True, 'prerelease': False}]
        self.repo.releases.extend(records)
        initial = self.git('rev-parse', 'v1.0.0')
        with self.assertRaisesRegex(release.ReleaseError,
                                    'Multiple release records share tag v1.0.0'):
            self.repo.release('v1.0.0', initial, publish=True)
        self.assertEqual(self.repo.release_commands, [])
        self.assertEqual(self.repo.releases, records)

    def test_listing_failure_propagates_without_release_writes(self):
        def fail(repository):
            raise release.ReleaseError('HTTP 403: Resource forbidden by rate limit')

        self.repo.release_records = fail
        initial = self.git('rev-parse', 'v1.0.0')
        with self.assertRaisesRegex(release.ReleaseError, 'HTTP 403'):
            self.repo.release('v1.0.0', initial, publish=True)
        self.assertEqual(self.repo.release_commands, [])

    def test_malformed_listing_page_fails_closed(self):
        initial = self.git('rev-parse', 'v1.0.0')
        original_api = self.repo.api

        def malformed_api(endpoint, *args, **kwargs):
            if endpoint.startswith('repos/example/m4b-merge/releases?'):
                return {'page': 1}
            return original_api(endpoint, *args, **kwargs)

        self.repo.api = malformed_api
        with self.assertRaisesRegex(release.ReleaseError, 'Unexpected release listing'):
            self.repo.release('v1.0.0', initial)
        self.assertEqual(self.repo.release_commands, [])

    def test_missing_draft_cannot_be_finalized(self):
        initial = self.git('rev-parse', 'v1.0.0')
        with self.assertRaisesRegex(release.ReleaseError, 'Cannot finalize a missing draft release'):
            self.repo.release('v1.0.0', initial, publish=True)
        self.assertEqual(self.repo.release_commands, [])

    # --- registry failures ---------------------------------------------------

    def test_registry_failure_preserves_captured_streams_at_cli_boundary(self):
        stub = self.checkout / 'docker'
        stub.write_text("#!/bin/sh\necho 'buildx stdout-marker-72'\n"
                        "echo 'unauthorized: authentication required stderr-marker-73' >&2\nexit 1\n")
        stub.chmod(0o755)
        self.git('remote', 'set-url', 'origin', 'git@github.com:example/m4b-merge.git')
        environment = release.isolated_git_environment()
        environment['PATH'] = f"{self.checkout}" + os.pathsep + environment.get('PATH', '')
        try:
            result = subprocess.run([sys.executable, str(release.__file__), 'image',
                                     '--source', self.source, '--version', 'v9.9.9'],
                                    cwd=self.checkout, env=environment, text=True,
                                    capture_output=True)
        finally:
            stub.unlink()
            self.git('remote', 'set-url', 'origin', str(self.remote))
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn('stderr-marker-73', result.stderr)
        self.assertIn('stdout-marker-72', result.stderr)

    # --- image lifecycle (in-process fake registry) --------------------------

    def fake_registry(self, staging_digest=None, version_digest=None, config=None, fail=None):
        """Fake `docker buildx imagetools` through release.registry_run only, so the
        real inspect classification (not-found vs. hard failure) runs."""
        staging = f"{self.repo.GHCR}:sha-{self.source}-amd64"
        versioned = f"{self.repo.GHCR}:v1.1.0"
        ops = []
        config = config or ('linux', 'amd64', self.source, 'v1.1.0')
        state = {'versioned': version_digest, 'staging': staging_digest}

        def registry_run(*args):
            ref = args[4]
            digest = None
            if args[3] == 'inspect' and ref.startswith(f'{self.repo.GHCR}@'):
                digest = ref.removeprefix(f'{self.repo.GHCR}@')
            elif ref == versioned:
                digest = state['versioned']
            elif ref == staging:
                digest = state['staging']
            if args[3] == 'inspect':
                ops.append(('inspect', ref))
                if fail is not None:
                    fail()
                if digest is None:
                    # Explicit registry manifest-not-found response, wrapped
                    # like the real registry_run always wraps call failures.
                    raise release.RegistryCommandError(
                        subprocess.CalledProcessError(1, ['docker'],
                                                      stderr=b'Error: manifest unknown'))
                os_, arch, revision, version = config
                return json.dumps({'digest': digest, 'os': os_, 'architecture': arch,
                                   'config': {'Labels': {'org.opencontainers.image.revision': revision,
                                                         'org.opencontainers.image.version': version}}}).encode()
            ops.append((args[3], args))
            if args[3] == 'create':
                state['versioned'] = state['staging']
            elif args[3] == 'build':
                state['staging'] = staging_digest
            return b''

        return registry_run, ops, staging, versioned

    def test_image_reuses_staging_and_publishes_version(self):
        digest = 'sha256:' + 'a' * 64
        registry_run, ops, staging, versioned = self.fake_registry(staging_digest=digest)
        with unittest.mock.patch.object(release, 'registry_run', registry_run):
            release.publish_image('example/m4b-merge', self.source, 'v1.1.0')
        self.assertEqual([op for op, *_ in ops],
                         ['inspect', 'inspect', 'inspect', 'create', 'inspect', 'inspect'])
        self.assertEqual(ops[3], ('create', ('docker', 'buildx', 'imagetools', 'create',
                                             '--prefer-index=false', '--tag', versioned,
                                             f"{self.repo.GHCR}@{digest}")))
        # The publish left the versioned tag; a retry reuses it without a
        # second registry create.
        ops.clear()
        with unittest.mock.patch.object(release, 'registry_run', registry_run):
            release.publish_image('example/m4b-merge', self.source, 'v1.1.0')
            self.assertEqual([op for op, *_ in ops].count('create'), 0)

    def test_image_reuses_reserved_version_without_create(self):
        digest = 'sha256:' + 'a' * 64
        registry_run, ops, _, _ = self.fake_registry(version_digest=digest)
        with unittest.mock.patch.object(release, 'registry_run', registry_run):
            release.publish_image('example/m4b-merge', self.source, 'v1.1.0')
        self.assertEqual([op for op, *_ in ops],
                         ['inspect'] * 5)

    def test_image_conflicting_bytes_fail_closed_without_writes(self):
        registry_run, ops, _, _ = self.fake_registry(staging_digest='sha256:' + 'b' * 64,
                                                     version_digest='sha256:' + 'a' * 64)
        with unittest.mock.patch.object(release, 'registry_run', registry_run), \
                self.assertRaisesRegex(release.ReleaseError, 'conflicting bytes'):
            release.publish_image('example/m4b-merge', self.source, 'v1.1.0')
            # Reads happened; the create write never did.
            self.assertNotIn('create', [op for op, *_ in ops])
            self.assertNotIn('build', [op for op, *_ in ops])

    def test_image_provenance_mismatch_fails_closed_without_writes(self):
        digest = 'sha256:' + 'a' * 64
        registry_run, ops, _, _ = self.fake_registry(
            staging_digest=digest, version_digest=digest,
            config=('linux', 'amd64', 'c' * 40, 'v1.1.0'))
        with unittest.mock.patch.object(release, 'registry_run', registry_run), \
                self.assertRaisesRegex(ValueError, 'provenance mismatch'):
            release.publish_image('example/m4b-merge', self.source, 'v1.1.0')
            self.assertNotIn('create', [op for op, *_ in ops])
            self.assertNotIn('build', [op for op, *_ in ops])

    def test_image_unauthorized_registry_failure_propagates(self):
        def fail():
            raise release.RegistryCommandError(
                subprocess.CalledProcessError(1, ['docker'],
                                              stderr=b'unauthorized: authentication required'))
        registry_run, ops, _, _ = self.fake_registry(staging_digest='sha256:' + 'a' * 64, fail=fail)
        with unittest.mock.patch.object(release, 'registry_run', registry_run), \
                self.assertRaisesRegex(release.ReleaseError, 'unauthorized'):
            release.publish_image('example/m4b-merge', self.source, 'v1.1.0')
        self.assertEqual(ops, [('inspect', f"{self.repo.GHCR}:v1.1.0")])


class DocsAssetRepository(release.Repository):
    source = 'a' * 40

    def __init__(self, root):
        super().__init__(root)
        self.assets = []
        self.writes = []
        self.api_writes = []
        self.downloads = 0

    def repository(self):
        return 'example/m4b-merge'

    def api_tag_target(self, tag):
        return self.source

    def api(self, endpoint, method='GET', fields=None):
        path = endpoint.removeprefix('repos/example/m4b-merge/')
        if path.startswith('releases/tags/'):
            # By-tag published-only boundary: no release is published here.
            raise release.ReleaseError('HTTP 404: Not Found')
        if path.startswith('releases?'):
            return [{'tag_name': 'v1.2.0', 'draft': False, 'prerelease': False,
                     'assets': [dict(asset) for asset in self.assets]}]
        if path.startswith('releases/assets/'):
            self.api_writes.append((method, fields))
            asset = next(asset for asset in self.assets
                         if asset['id'] == int(path.split('/')[2]))
            if method == 'PATCH':
                asset['label'] = fields['label']
            return dict(asset)
        raise AssertionError((endpoint, method, fields))

    def api_asset_download(self, repository, asset_id):
        self.downloads += 1
        asset = next(asset for asset in self.assets if asset['id'] == asset_id)
        return asset['payload']

    def run(self, *args, ok=(0,)):
        self.writes.append(args)
        raise AssertionError(f'Unexpected release write: {args}')


class DocsAssetProvenance(unittest.TestCase):
    payload = b'<!doctype html><title>Audnexus release docs</title>'

    def asset(self, label=None, digest=None, payload=None):
        item = {'id': 7, 'name': DOCS_NAME,
                'payload': self.payload if payload is None else payload,
                'browser_download_url': 'https://example.invalid/index.html'}
        if label is not None:
            item['label'] = label
        if digest is not None:
            item['digest'] = digest
        return item

    def repo_with(self, assets):
        temp = tempfile.TemporaryDirectory(prefix='docs-asset-')
        self.addCleanup(temp.cleanup)
        (Path(temp.name) / 'docs').mkdir()
        (Path(temp.name) / 'docs' / DOCS_NAME).write_bytes(self.payload)
        repo = DocsAssetRepository(temp.name)
        repo.assets = assets
        return repo

    def test_conflicting_source_rejects_before_upload(self):
        built = hashlib.sha256(self.payload).hexdigest()
        repo = self.repo_with([self.asset(label=release.docs_label('b' * 40, 'v1.2.0', built),
                                          digest=f'sha256:{built}')])
        with self.assertRaisesRegex(release.ReleaseError, 'bound to another source'):
            release.publish_docs_asset(repo, repo.source, 'v1.2.0')
        self.assertEqual(repo.writes, [])
        # The recorded remote digest proves the bytes; no download is needed.
        with self.assertRaisesRegex(release.ReleaseError, 'bound to another source'):
            release.verify_docs_asset(repo, repo.assets[0], repo.source, 'v1.2.0', built)
        self.assertEqual(repo.downloads, 0)

    def test_conflicting_version_rejects_before_upload(self):
        built = hashlib.sha256(self.payload).hexdigest()
        repo = self.repo_with([self.asset(label=release.docs_label(DocsAssetRepository.source, 'v1.9.9', built))])
        with self.assertRaisesRegex(release.ReleaseError, 'bound to another version'):
            release.publish_docs_asset(repo, repo.source, 'v1.2.0')
        self.assertEqual(repo.writes, [])

    def test_stale_recorded_digest_rejects_before_download(self):
        repo = self.repo_with([self.asset(label=release.docs_label(DocsAssetRepository.source, 'v1.2.0',
                                                                   '0' * 64),
                                          digest=f"sha256:{'1' * 64}")])
        with self.assertRaisesRegex(release.ReleaseError, 'bytes differ from the recorded digest'):
            release.publish_docs_asset(repo, repo.source, 'v1.2.0')
        self.assertEqual(repo.writes, [])
        self.assertEqual(repo.downloads, 0)

    def test_unlabeled_matching_bytes_get_labeled(self):
        built = hashlib.sha256(self.payload).hexdigest()
        repo = self.repo_with([self.asset(label=None)])
        release.publish_docs_asset(repo, repo.source, 'v1.2.0')
        self.assertEqual(repo.assets[0]['label'],
                         release.docs_label(repo.source, 'v1.2.0', built))
        self.assertEqual(repo.api_writes,
                         [('PATCH', {'label': release.docs_label(repo.source, 'v1.2.0', built)})])

    def test_byte_mismatch_downloads_and_fails_closed(self):
        built = hashlib.sha256(self.payload).hexdigest()
        repo = self.repo_with([self.asset(label=release.docs_label(DocsAssetRepository.source, 'v1.2.0', built),
                                          payload=b'<html>stale</html>')])
        with self.assertRaisesRegex(release.ReleaseError,
                                    'bytes differ from the recorded digest'):
            release.publish_docs_asset(repo, repo.source, 'v1.2.0')
        self.assertEqual(repo.writes, [])
        self.assertEqual(repo.downloads, 1)

    def test_unrecognized_label_shape_rejects(self):
        built = hashlib.sha256(self.payload).hexdigest()
        repo = self.repo_with([self.asset(label=f'source={DocsAssetRepository.source} version=v1.2.0 sha256={built} ')])
        with self.assertRaisesRegex(release.ReleaseError, 'provenance'):
            release.publish_docs_asset(repo, repo.source, 'v1.2.0')



SMOKE_GIT_SHIM = r"""#!/usr/bin/env python3
# Passthrough `git` that keeps `remote get-url` output canonical.
#
# The local `url.insteadOf` rewrite needed to keep every transport local
# also rewrites `git remote get-url` output; release.py validates the
# canonical GitHub URL from there, so restore it on display.
import os
import subprocess
import sys

args = sys.argv[1:]
cwd = None
if args[:1] == ['-C']:
    cwd = args[1]
    del args[:2]
real_git = None
for entry in os.environ.get('PATH', '').split(os.pathsep)[1:]:
    candidate = os.path.join(entry, 'git')
    if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
        real_git = candidate
        break
if real_git is None:
    sys.exit(127)
result = subprocess.run([real_git, *args], cwd=cwd, capture_output=True)
out = result.stdout
if args[:2] == ['remote', 'get-url']:
    bare = os.environ.get('SMOKE_GIT_BARE', '')
    canonical = os.environ.get('SMOKE_GIT_CANONICAL_URL', '')
    if bare and canonical:
        out = out.replace(bare.encode('utf-8'), canonical.encode('utf-8'), 1)
sys.stdout.buffer.write(out)
sys.stderr.buffer.write(result.stderr)
sys.exit(result.returncode)
"""

SMOKE_GH_SHIM = r"""#!/usr/bin/env python3
# Stateful fake `gh` for the local Audnexus release lifecycle smoke.
#
# Serves the documented GitHub API surface from a JSON state file so no
# network write can occur. Endpoints handled (matching scripts/release.py):
#   api repos/{owner}/{repo}/git/refs                     POST (fields ref, sha)
#   api repos/{owner}/{repo}/git/ref/tags/{tag}           GET  (404 on absence)
#   api repos/{owner}/{repo}/releases?per_page=100&page=N GET  (paginated listing)
#   api repos/{owner}/{repo}/releases/assets/{id}         GET (label/digest) /
#                                                                POST|PATCH (label) /
#                                                                raw bytes
#   api repos/{owner}/{repo}/actions/... (runs/jobs/steps) GET
#   release create/edit/upload <tag> ...
#   workflow run deploy-docs.yml --repo ... --ref ... -f k=v ...
#   run watch <id> --exit-status
import hashlib
import json
import os
import sys
from pathlib import Path

store_path = Path(os.environ["FAKE_STORE"])
log_path = Path(os.environ["FAKE_LOG"])
store = json.loads(store_path.read_text())
log = json.loads(log_path.read_text())
argv = sys.argv[1:]
log.append(argv)
log_path.write_text(json.dumps(log))
repo = os.environ["FAKE_GIT_REMOTE_REPO"]  # owner/repo


def save():
    store_path.write_text(json.dumps(store))


def output(value):
    sys.stdout.write(value + "\n")


def fatal(message, code=1):
    sys.stderr.write(message + "\n")
    sys.exit(code)


def parse_api(args):
    endpoint = None
    method = "GET"
    fields = {}
    header = ""
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--method":
            method = args[i + 1]
            i += 2
            continue
        if arg in ("-f", "--field"):
            key, _, value = args[i + 1].partition("=")
            fields[key] = value
            i += 2
            continue
        if arg == "--header":
            header = args[i + 1]
            i += 2
            continue
        if arg in ("--hostname",):
            i += 2
            continue
        if arg is endpoint:
            i += 1
            continue
        if endpoint is None and not arg.startswith("-"):
            endpoint = arg
        i += 1
    return endpoint, method, fields, header


def main():
    if not argv:
        fatal("fake-gh: no args")
    if argv[0] == "api":
        endpoint, method, fields, header = parse_api(argv[1:])
        if endpoint is None:
            fatal("fake-gh: no endpoint")
        prefix = "repos/%s/" % repo
        if not endpoint.startswith(prefix):
            fatal("fake-gh: unhandled api %s" % endpoint, 3)
        path = endpoint[len(prefix):]
        if path == "git/refs" and method == "POST":
            ref, sha = fields["ref"], fields["sha"]
            store["refs"][ref] = sha
            save()
            output(json.dumps({"ref": ref, "object": {"type": "commit", "sha": sha}}))
            return
        if path.startswith("git/ref/tags/"):
            tag = path[len("git/ref/tags/"):]
            sha = store["refs"].get("refs/tags/%s" % tag)
            if sha is None:
                fatal("HTTP 404: Not Found", 404)
            output(json.dumps({"ref": "refs/tags/" + tag,
                               "object": {"type": "commit", "sha": sha}}))
            return
        if path.startswith("releases?"):
            query = dict(part.split("=", 1) for part in path.split("?", 1)[1].split("&"))
            if store.get("listing_page") is not None and \
                    int(query.get("page", "1")) == store["listing_page"]:
                save()
                fatal("HTTP 502: Bad Gateway", 502)
            if store.get("malformed_listing"):
                save()
                output(json.dumps({"page": int(query.get("page", "1"))}))
                return
            output(json.dumps(store["releases"]))
            return
        if path.endswith("?event=workflow_dispatch&per_page=100") and \
                path.startswith("actions/workflows/"):
            output(json.dumps({"workflow_runs": store["runs"]}))
            return
        for suffix in ("/jobs?per_page=100",):
            if path.startswith("actions/runs/") and path.endswith(suffix):
                run_id = path[len("actions/runs/"):-len(suffix)]
                output(json.dumps({"jobs": store["jobs"].get(run_id, [])}))
                return
        if path.startswith("actions/jobs/"):
            job_id = path[len("actions/jobs/"):]
            output(json.dumps({"steps": store["steps"].get(job_id, [])}))
            return
        if path.startswith("releases/assets/") and path.split("/")[-1].isdigit():
            asset_id = int(path.split("/")[-1])
            asset = next((a for release in store["releases"]
                          for a in release.get("assets") or []
                          if int(a["id"]) == asset_id), None)
            if asset is None:
                fatal("HTTP 404: Not Found", 404)
            if "octet-stream" in header:
                sys.stdout.buffer.write(bytes.fromhex(asset["digest"][7:]))
                save()
                return
            if method in ("POST", "PATCH"):
                if "label" in fields:
                    asset["label"] = fields["label"]
            save()
            output(json.dumps(asset))
            return
        fatal("fake-gh: unhandled api %s" % endpoint, 3)
    if argv[0] == "release" and argv[1] == "create":
        tag = argv[2]
        if any(r["tag_name"] == tag for r in store["releases"]):
            fatal("fake-gh: release %s already exists" % tag)
        record = {"id": store["next_id"], "tag_name": tag, "draft": True,
                  "prerelease": False, "latest": False,
                  "name": "Release %s" % tag, "body": "", "assets": []}
        store["releases"].append(record)
        store["next_id"] += 1
        save()
        output("https://github.com/%s/releases/%s" % (repo, tag))
        return
    if argv[0] == "release" and argv[1] == "edit":
        tag = argv[2]
        record = next((r for r in store["releases"] if r["tag_name"] == tag), None)
        if record is None:
            fatal("HTTP 404: Not Found", 404)
        if "--draft=false" in argv:
            record["draft"] = False
        latest_arg = next((a for a in argv if a.startswith("--latest=")), None)
        if latest_arg:
            is_latest = latest_arg.split("=", 1)[1] == "true"
            record["latest"] = is_latest
            if is_latest:
                store["github_latest"] = tag
        save()
        output("https://github.com/%s/releases/%s" % (repo, tag))
        return
    if argv[0] == "release" and argv[1] == "upload":
        tag = argv[2]
        spec = argv[3]
        file_path, _, label = spec.partition("#")
        record = next((r for r in store["releases"] if r["tag_name"] == tag), None)
        if record is None:
            fatal("fake-gh: no release %s" % tag)
        data = (Path(os.environ["FAKE_GIT"]) / file_path).read_bytes()
        name = Path(file_path).name
        asset = {"id": store["next_asset_id"], "name": name, "label": label,
                 "digest": "sha256:" + hashlib.sha256(data).hexdigest(),
                 "browser_download_url": "https://github.com/%s/releases/download/%s/%s"
                                         % (repo, tag, name)}
        record.setdefault("assets", []).append(asset)
        store["next_asset_id"] += 1
        save()
        return
    if argv[0] == "workflow" and argv[1] == "run":
        workflow = argv[2]
        fields = {}
        ref = None
        i = 3
        while i < len(argv):
            arg = argv[i]
            if arg == "-f":
                key, _, value = argv[i + 1].partition("=")
                fields[key] = value
                i += 2
            elif arg == "--ref":
                ref = argv[i + 1]
                i += 2
            else:
                i += 1
        store["dispatches"].append({"workflow": workflow, "ref": ref, "fields": fields})
        correlation = fields.get("release_run", "")
        run_id = store["next_run"]
        store["next_run"] += 1
        store["runs"].append({"id": run_id,
                              "html_url": "https://github.com/%s/actions/runs/%d" % (repo, run_id),
                              "display_title": "Release docs %s" % correlation,
                              "head_sha": fields.get("source", "")})
        deploy_job = {"id": run_id * 10 + 2, "name": "deploy"}
        store["jobs"][str(run_id)] = [{"id": run_id * 10 + 1, "name": "build-docs"},
                                      deploy_job]
        store["steps"][str(deploy_job["id"])] = [
            {"name": "Verify the source is current main before deploying",
             "conclusion": "success"},
            {"name": "Deploy to GitHub Pages",
             "conclusion": os.environ.get("FAKE_PAGE_CONCLUSION", "success")}]
        save()
        return
    if argv[0] == "run" and argv[1] == "watch":
        if os.environ.get("FAKE_RUN_CONCLUSION", "completed") != "completed":
            sys.exit(1)
        return
    fatal("fake-gh: unhandled %s" % " ".join(argv), 3)


main()
"""

class LocalLifecycleSubprocessSmoke(unittest.TestCase):
    """Real release.py subprocess CLIs against a local JSON-backed gh store.

    The PATH gh shim (no network) serves the documented GitHub surface, and
    the git remote is redirected with url.insteadOf to a local bare repo, so
    origin still identifies the GitHub repository while every fetch stays
    local. This is the no-live-publish draft/assets lifecycle boundary."""

    GIT = 'laxamentumtech/audnexus'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lifecycle-smoke-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.bare = root / 'remote.git'
        self.checkout = root / 'checkout'
        self.bin = root / 'bin'
        self.STORE = root / 'store.json'
        self.bin.mkdir(parents=True)
        (self.checkout / 'docs').mkdir(parents=True)
        self.payload = b'<!doctype html><title>Audnexus release docs</title>'
        (self.checkout / 'docs' / 'index.html').write_bytes(self.payload)
        self.built = hashlib.sha256(self.payload).hexdigest()
        self.env = release.isolated_git_environment()
        self.env['PATH'] = str(self.bin) + os.pathsep + self.env.get('PATH', '/usr/bin:/bin')
        for args in (('git', 'init', '--bare', str(self.bare)),
                     ('git', 'init', '-b', 'main', str(self.checkout))):
            result = subprocess.run(args, env=self.env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        for key, value in (('user.name', 'Smoke'), ('user.email', 'smoke@example.invalid')):
            self.git('config', key, value)
        self.git('remote', 'add', 'origin', f'https://github.com/{self.GIT}')
        self.git('config', f'url.{self.bare}.insteadOf', f'https://github.com/{self.GIT}')
        (self.bin / 'gh').write_text(SMOKE_GH_SHIM, encoding='utf-8')
        (self.bin / 'gh').chmod(0o755)
        # The store-backed `url.insteadOf` rewrite also rewrites `git remote
        # get-url`; release.py inspects the canonical GitHub URL from there,
        # so a passthrough restores it on display.
        (self.bin / 'git').write_text(SMOKE_GIT_SHIM, encoding='utf-8')
        (self.bin / 'git').chmod(0o755)
        self.env['SMOKE_GIT_BARE'] = str(self.bare)
        self.env['SMOKE_GIT_CANONICAL_URL'] = f'https://github.com/{self.GIT}'
        self.env['FAKE_GIT_REMOTE_REPO'] = self.GIT
        self.env['FAKE_STORE'] = str(self.STORE)
        (root / 'gh-log.json').write_text('[]', encoding='utf-8')
        self.env['FAKE_LOG'] = str(root / 'gh-log.json')
        self.env['FAKE_GIT'] = str(self.checkout)
        for key in ('FAKE_PAGE_CONCLUSION', 'FAKE_RUN_CONCLUSION'):
            self.env.pop(key, None)

    def git(self, *args):
        result = subprocess.run(['git', '-C', str(self.checkout), *args],
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def commit(self, message):
        self.git('commit', '--allow-empty', '-m', message)
        # `reserve` validates publication sources against origin/main after a
        # fetch, so test commits advance the remote main like CI does.
        self.git('push', 'origin', 'main')
        return self.git('rev-parse', 'HEAD')

    def seed(self):
        sha = self.commit('chore: baseline')
        self.git('tag', 'v1.0.0', sha)
        self.git('update-ref', 'refs/heads/develop', sha)
        self.git('push', 'origin', 'main', 'develop', '--tags')
        state = {'releases': [{'id': 1, 'tag_name': 'v1.0.0', 'draft': False,
                               'prerelease': False, 'latest': True, 'name': 'Release v1.0.0',
                               'assets': []}],
                 'next_id': 2, 'next_asset_id': 1, 'next_run': 1000,
                 'refs': {f'refs/tags/v1.0.0': sha},
                 'runs': [], 'jobs': {}, 'steps': {}, 'dispatches': []}
        self.STORE.write_text(json.dumps(state))
        return sha

    def draft_stub(self, tag, source):
        state = self.store()
        state['releases'].append({'id': state['next_id'], 'tag_name': tag, 'draft': True,
                                  'prerelease': False, 'latest': False,
                                  'name': f'Release {tag}', 'assets': []})
        state['next_id'] += 1
        self.STORE.write_text(json.dumps(state))

    def run_cli(self, *args, expect=0, **extra):
        result = subprocess.run([sys.executable, str(Path(release.__file__).resolve()), *args],
                                cwd=self.checkout,
                                env=dict(self.env, **extra),
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, expect,
                         f'{args} rc={result.returncode}\nstdout: {result.stdout}\nstderr: {result.stderr}')
        return result

    def store(self):
        return json.loads(self.STORE.read_text())

    def log(self):
        return json.loads(Path(self.env['FAKE_LOG']).read_text())

    def test_release_draft_publish_lifecycle_with_ordered_latest(self):
        self.seed()
        old = self.commit('chore: delayed source')
        featured = self.commit('feat: json loader')
        # Auto inference: baseline v1.0.0, log has a feat -> v1.1.0.
        self.run_cli('reserve', '--sha', featured)
        state = self.store()
        self.assertEqual(state['refs'][f'refs/tags/v1.1.0'], featured)
        # An explicit lower delayed reservation on the older main commit.
        self.run_cli('reserve', '--sha', old, '--version', 'v1.0.5')
        state = self.store()
        self.assertEqual(state['refs'][f'refs/tags/v1.0.5'], old)
        # CI's create step materialized a draft; docs-asset sees it via the
        # draft-aware listing (the by-tag published lookup stays 404).
        self.draft_stub('v1.1.0', featured)
        result = self.run_cli('docs-asset', '--source', featured, '--version', 'v1.1.0')
        self.assertIn('Published immutable release docs', result.stdout)
        draft = next(r for r in self.store()['releases'] if r['tag_name'] == 'v1.1.0')
        self.assertTrue(draft['draft'])
        asset = draft['assets'][0]
        self.assertEqual(asset['digest'], f'sha256:{self.built}')
        self.assertIn(f'source={featured}', asset['label'])
        # Changed bytes are refused; the immutable asset is untouched.
        (self.checkout / 'docs' / 'index.html').write_bytes(b'<!doctype html>changed')
        self.run_cli('docs-asset', '--source', featured, '--version', 'v1.1.0', expect=1)
        draft = next(r for r in self.store()['releases'] if r['tag_name'] == 'v1.1.0')
        self.assertEqual(draft['assets'][0]['digest'], f'sha256:{self.built}')
        # Byte-identical rebuild verifies without a second upload.
        (self.checkout / 'docs' / 'index.html').write_bytes(self.payload)
        result = self.run_cli('docs-asset', '--source', featured, '--version', 'v1.1.0')
        self.assertIn('Verified immutable release docs', result.stdout)
        self.assertEqual(len(draft['assets']), 1)
        # Publish: no higher published stable -> GitHub Latest advances.
        self.run_cli('release', '--tag', 'v1.1.0', '--source', featured, '--publish')
        published = next(r for r in self.store()['releases'] if r['tag_name'] == 'v1.1.0')
        self.assertFalse(published['draft'])
        self.assertTrue(published['latest'])
        # Idempotent published retry: read-only lookups only, no release writes.
        entries = len(self.log())
        self.run_cli('release', '--tag', 'v1.1.0', '--source', featured, '--publish')
        retry = self.log()[entries:]
        self.assertFalse(any(e[0] in ('release', 'workflow') for e in retry))
        self.assertTrue(all(e[0] == 'api' for e in retry))
        # The first publish (no higher stable) advanced Latest with --latest=true.
        edits = [entry for entry in self.log() if entry[:2] == ['release', 'edit']]
        self.assertIn('--latest=true', edits[0])
        # A delayed lower completion must not roll Latest back: --latest=false.
        self.draft_stub('v1.0.5', old)
        self.run_cli('docs-asset', '--source', old, '--version', 'v1.0.5')
        self.run_cli('release', '--tag', 'v1.0.5', '--source', old, '--publish')
        lower_edit = next(entry for entry in self.log()
                          if entry[:2] == ['release', 'edit'] and entry[2] == 'v1.0.5')
        self.assertIn('--latest=false', lower_edit)
        state = self.store()
        lower = next(r for r in state['releases'] if r['tag_name'] == 'v1.0.5')
        self.assertFalse(lower['draft'])
        self.assertFalse(lower['latest'])
        self.assertTrue(next(r for r in state['releases'] if r['tag_name'] == 'v1.1.0')['latest'])

    def test_docs_dispatch_correlation_and_pages_step_semantics(self):
        sha = self.seed()
        self.commit('feat: dispatch target')
        sha = self.git('rev-parse', 'HEAD')
        self.git('tag', 'v1.1.0', sha)
        self.git('push', 'origin', 'main', '--tags')
        state = self.store()
        state['refs'][f'refs/tags/v1.1.0'] = sha
        state['releases'].append({'id': state['next_id'], 'tag_name': 'v1.1.0',
                                  'draft': False, 'prerelease': False, 'latest': True,
                                  'name': 'Release v1.1.0', 'assets': []})
        state['next_id'] += 1
        self.STORE.write_text(json.dumps(state))
        result = self.run_cli('docs-asset', '--source', sha, '--version', 'v1.1.0')
        self.assertIn('Published immutable release docs', result.stdout)
        result = self.run_cli('docs', '--source', sha, '--version', 'v1.1.0', '--correlation', '111-1')
        self.assertIn('Verified Pages deployment', result.stdout)
        dispatch = self.store()['dispatches'][0]
        self.assertEqual(dispatch, {'workflow': 'deploy-docs.yml', 'ref': 'v1.1.0',
                                    'fields': {'version': 'v1.1.0', 'source': sha,
                                               'release_run': '111-1'}})
        # A successful deploy job whose Pages step was skipped is retained,
        # not deployed.
        self.run_cli('docs', '--source', sha, '--version', 'v1.1.0', '--correlation', '111-2',
                     FAKE_PAGE_CONCLUSION='skipped')
        # A failed Pages step is reported as not observed.
        result = self.run_cli('docs', '--source', sha, '--version', 'v1.1.0',
                              '--correlation', '111-3', FAKE_PAGE_CONCLUSION='failure')
        self.assertNotIn('Verified Pages deployment', result.stdout)
        self.assertIn('not observed', result.stdout)
        # A failed dispatch run exits nonzero at the watch boundary.
        result = self.run_cli('docs', '--source', sha, '--version', 'v1.1.0',
                              '--correlation', '111-4', FAKE_RUN_CONCLUSION='failure',
                              expect=1)
        self.assertIn('run watch', result.stderr)
        self.assertEqual(len(self.store()['dispatches']), 4)

    def test_listing_failures_and_duplicates_fail_closed_without_writes(self):
        sha = self.seed()
        self.git('tag', 'v1.0.2', sha)
        self.git('push', 'origin', 'main', '--tags')
        state = self.store()
        state['refs'][f'refs/tags/v1.0.2'] = sha
        state['releases'].append({'id': state['next_id'], 'tag_name': 'v1.0.2',
                                  'draft': True, 'prerelease': False, 'latest': False,
                                  'name': 'Release v1.0.2', 'assets': []})
        state['next_id'] += 1
        self.STORE.write_text(json.dumps(state))
        # A 5xx on the listing propagates with no upload and no create.
        state['listing_page'] = 1
        self.STORE.write_text(json.dumps(state))
        self.run_cli('docs-asset', '--source', sha, '--version', 'v1.0.2', expect=1)
        state = self.store()
        self.assertEqual(next(r for r in state['releases'] if r['tag_name'] == 'v1.0.2')['assets'], [])
        # A malformed listing page (object where list is required) fails closed.
        state['listing_page'] = None
        state['malformed_listing'] = True
        self.STORE.write_text(json.dumps(state))
        self.run_cli('docs-asset', '--source', sha, '--version', 'v1.0.2', expect=1)
        # Duplicate records on one tag fail closed before any upload.
        state['malformed_listing'] = False
        state['releases'].append({'id': state['next_id'], 'tag_name': 'v1.0.2',
                                  'draft': False, 'prerelease': False, 'latest': False,
                                  'name': 'dup', 'assets': []})
        self.STORE.write_text(json.dumps(state))
        result = self.run_cli('docs-asset', '--source', sha, '--version', 'v1.0.2', expect=1)
        self.assertIn('Multiple release records share tag', result.stderr)
        self.assertEqual([entry for entry in self.log() if entry[:2] == ['release', 'upload']], [])


if __name__ == '__main__':
    unittest.main()
