#!/usr/bin/env python3
"""Reserve exact-source release identities and publish native Audnexus outputs."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time


class ReleaseError(Exception):
    pass


VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\Z")
OID = re.compile(r"[0-9a-f]{40}\Z")
REPOSITORY = re.compile(r"(?:git@github\.com:|https://github\.com/)([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?/?\Z")


def semver(value):
    match = VERSION.fullmatch(value)
    if not match:
        raise ReleaseError(f"Invalid release version: {value!r}; expected X.Y.Z")
    return tuple(map(int, match.groups()))


def require(condition, message):
    if not condition:
        raise ReleaseError(message)


def isolated_git_environment():
    return {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}


class Repository:
    def __init__(self, root="."):
        self.root = Path(root).resolve()

    @staticmethod
    def proc(args, cwd):
        return subprocess.run(args, cwd=cwd, env=isolated_git_environment(), text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def run(self, *args, ok=(0,)):
        result = self.proc(args, self.root)
        require(result.returncode in ok, f"{' '.join(args)}: {result.stderr.strip() or result.stdout.strip()}")
        return result.stdout.strip()

    def git(self, *args):
        return self.run("git", *args)

    def repository(self):
        match = REPOSITORY.fullmatch(self.git("remote", "get-url", "origin"))
        push = REPOSITORY.fullmatch(self.git("remote", "get-url", "--push", "origin"))
        require(match and push and match.group(1).lower() == push.group(1).lower(),
                "origin fetch/push must identify the same GitHub repository")
        return match.group(1)

    def api(self, endpoint, method="GET", fields=None):
        args = ["gh", "api", "--hostname", "github.com", endpoint]
        if method != "GET":
            args += ["--method", method]
        for key, value in (fields or {}).items():
            args += ["-f", f"{key}={value}"]
        value = self.run(*args)
        return json.loads(value) if value else None

    def api_asset_download(self, repository, asset_id):
        result = subprocess.run(
            ["gh", "api", "--hostname", "github.com", f"repos/{repository}/releases/assets/{asset_id}",
             "--header", "Accept: application/octet-stream"], capture_output=True)
        require(result.returncode == 0,
                f"gh api release asset download failed: {result.stderr.decode(errors='replace').strip()}")
        return result.stdout

    def oid(self, ref):
        require(isinstance(ref, str) and not ref.startswith("-"), "Invalid git reference")
        value = self.git("rev-parse", "--verify", f"{ref}^{{commit}}")
        require(OID.fullmatch(value), "Expected a full commit object ID")
        return value

    def exact_oid(self, value):
        require(isinstance(value, str) and OID.fullmatch(value), "Expected a full commit object ID")
        require(self.oid(value) == value, "Commit object ID did not resolve exactly")
        return value

    def ancestor(self, older, newer):
        result = self.proc(["git", "merge-base", "--is-ancestor", older, newer], self.root)
        require(result.returncode in (0, 1), result.stderr.strip() or "Cannot inspect ancestry")
        return result.returncode == 0

    def fetch(self):
        self.repository()
        self.git("fetch", "--prune", "--no-prune-tags", "--no-tags", "origin",
                 "+refs/heads/main:refs/remotes/origin/main",
                 "+refs/heads/develop:refs/remotes/origin/develop",
                 "+refs/tags/*:refs/audnexus-release/tags/*")

    def tags(self, ref):
        tags = []
        for tag in self.git("for-each-ref", f"--merged={ref}", "--format=%(refname:strip=3)",
                            "refs/audnexus-release/tags/v*").splitlines():
            if VERSION.fullmatch(tag[1:]):
                tags.append((semver(tag[1:]), tag))
        return sorted(tags)

    def tag_target(self, tag):
        ref = f"refs/audnexus-release/tags/{tag}"
        result = self.proc(["git", "show-ref", "--verify", "--quiet", ref], self.root)
        require(result.returncode in (0, 1), "Cannot inspect release tag")
        return self.oid(ref) if result.returncode == 0 else None

    def api_tag_target(self, tag):
        """Resolve a remote tag to its commit, peeling annotated tag objects."""
        repository = self.repository()
        try:
            target = self.api(f"repos/{repository}/git/ref/tags/{tag}")["object"]
        except ReleaseError as error:
            require("HTTP 404" in str(error), str(error))
            return None
        for _ in range(10):
            if target["type"] != "tag":
                break
            target = self.api(f"repos/{repository}/git/tags/{target['sha']}")["object"]
        require(target["type"] == "commit", f"Tag {tag} does not resolve to a commit")
        return target["sha"]

    def select(self, sha, version=None, bump="auto", automatic=False):
        sha = self.exact_oid(sha)
        main = self.oid("origin/main")
        require(self.ancestor(sha, main), "Publication source must belong to main history")
        tags = self.tags(sha)
        exact = [tag for _, tag in tags if self.tag_target(tag) == sha]
        require(len(exact) <= 1, "Ambiguous exact-source release reservations")
        if version:
            version = "v" + version.removeprefix("v")
            semver(version[1:])
            require(not exact or exact == [version], "Source already reserved as a different version")
            target = self.tag_target(version)
            require(target is None or target == sha, "Version is reserved by another source")
            if target:
                return version
        elif exact:
            return exact[0]
        if automatic:
            for _, tag in self.tags(main):
                target = self.tag_target(tag)
                if target != sha and self.ancestor(sha, target):
                    return None  # Superseded automatic candidate; no reservation yet.
        baseline, previous = tags[-1] if tags else ((0, 0, 0), None)
        if version:
            require(semver(version[1:]) > baseline, "New version must exceed the reachable reservation baseline")
            return version
        if not previous:
            return "v0.1.0"
        if bump == "auto":
            messages = self.git("log", "--format=%B", f"refs/audnexus-release/tags/{previous}..{sha}")
            if re.search(r"(?m)^BREAKING[ -]CHANGE:|^[a-zA-Z][\w-]*(?:\([^\n)]*\))?!:", messages):
                bump = "major"
            elif re.search(r"(?m)^feat(?:\([^\n)]*\))?:", messages):
                bump = "minor"
            else:
                bump = "patch"
        major, minor, patch = baseline
        require(bump in ("major", "minor", "patch"), "Invalid bump level")
        parts = {"major": (major + 1, 0, 0), "minor": (major, minor + 1, 0), "patch": (major, minor, patch + 1)}[bump]
        selected = "v" + ".".join(map(str, parts))
        require(self.tag_target(selected) in (None, sha), "Version is reserved by another source")
        return selected

    def reserve(self, sha, version=None, bump="auto", automatic=False):
        self.fetch()
        tag = self.select(sha, version, bump, automatic)
        if tag is None:
            return None
        repository = self.repository()
        try:
            self.api(f"repos/{repository}/git/refs", "POST", {"ref": f"refs/tags/{tag}", "sha": sha})
        except ReleaseError:
            # Create-only REST ref writes cannot move a concurrent reservation.
            target = self.api(f"repos/{repository}/git/ref/tags/{tag}")["object"]
            while target["type"] == "tag":
                target = self.api(f"repos/{repository}/git/tags/{target['sha']}")["object"]
            require(target["type"] == "commit" and target["sha"] == sha,
                    "Concurrent reservation points at a different source")
        return tag

    def release_records(self, repository):
        """Complete authenticated release listing; drafts included, errors propagate.

        GET releases/tags/{tag} is a published-release lookup only, so every
        draft lifecycle caller must use the paginated listing instead."""
        records, page = [], 1
        while True:
            batch = self.api(f"repos/{repository}/releases?per_page=100&page={page}")
            require(isinstance(batch, list), f"Unexpected release listing response on page {page}")
            records.extend(batch)
            if len(batch) < 100:
                return records
            page += 1

    def release_tag_record(self, repository, tag):
        """Exact-tag draft-aware release lookup; duplicates and listing failures fail closed."""
        matches = [record for record in self.release_records(repository) if record.get("tag_name") == tag]
        require(len(matches) <= 1, f"Multiple release records share tag {tag}; failing closed")
        return matches[0] if matches else None

    def release(self, tag, source, publish=False):
        semver(tag.removeprefix("v"))
        require(isinstance(source, str) and OID.fullmatch(source), "Expected a full commit object ID")
        repository = self.repository()
        require(self.api_tag_target(tag) == source, f"Tag {tag} does not point at the frozen source")
        existing = self.release_tag_record(repository, tag)
        if existing is None:
            require(not publish, "Cannot finalize a missing draft release")
            self.run("gh", "release", "create", tag, "--repo", repository, "--verify-tag", "--draft", "--title", f"Release {tag}", "--notes", "")
            return
        if publish and existing.get("draft"):
            target = semver(tag.removeprefix("v"))
            stable = []
            for record in self.release_records(repository):
                if record.get("draft") or record.get("prerelease"):
                    continue
                match = VERSION.fullmatch(str(record.get("tag_name", "")).removeprefix("v"))
                if match:
                    stable.append(tuple(map(int, match.groups())))
            # GitHub "Latest" tracks the highest published stable release, not
            # this publish call: a delayed lower completion must not roll it
            # back, so publish with --latest=false when a higher stable exists.
            higher_published = any(version > target for version in stable)
            self.run("gh", "release", "edit", tag, "--repo", repository, "--draft=false",
                     f"--latest={'true' if not higher_published else 'false'}")


DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
DOCS_ASSET = "index.html"
DOCS_LABEL = re.compile(
    r"source=(?P<source>[0-9a-f]{40}) "
    r"version=(?P<version>v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)) "
    r"sha256=(?P<sha256>[0-9a-f]{64})\Z")


class RegistryCommandError(ReleaseError):
    def __init__(self, error):
        self.streams = " ".join(part for part in (
            (getattr(error, "stderr", b"") or b"").decode(errors="replace").strip(),
            (getattr(error, "stdout", b"") or b"").decode(errors="replace").strip()) if part)
        super().__init__(f"registry command failed (exit {getattr(error, 'returncode', 1)}): {self.streams}")


def registry_run(*args):
    try:
        return subprocess.run(args, check=True, capture_output=True).stdout
    except subprocess.CalledProcessError as error:
        raise RegistryCommandError(error) from None


def inspect(ref, field="Manifest", missing=False):
    try:
        return json.loads(registry_run("docker", "buildx", "imagetools", "inspect", ref,
                              "--format", "{{json ." + field + "}}"))
    except RegistryCommandError as error:
        message = error.streams.lower()
        # Only an explicit registry manifest-not-found response permits creation.
        # Authentication, transport, throttling and malformed responses fail closed.
        absent = "manifest unknown" in message or f"{ref.lower()}: not found" in message
        if missing and absent and not any(word in message for word in
                                         ("unauthorized", "denied", "timeout", "forbidden")):
            return None
        raise


def digest(value):
    if not isinstance(value, str) or not DIGEST.fullmatch(value):
        raise ValueError(f"Invalid registry digest: {value!r}")
    return value


def image(image_name, ref, sha, version, arch, missing=False):
    manifest = inspect(ref, missing=missing)
    if manifest is None:
        return None
    if "manifests" in manifest:
        raise ValueError(f"Expected one native image at {ref}")
    value = digest(manifest["digest"])
    config = inspect(f"{image_name}@{value}", "Image")
    labels = config.get("config", {}).get("Labels", {})
    if (config.get("os"), config.get("architecture"),
        labels.get("org.opencontainers.image.revision"),
        labels.get("org.opencontainers.image.version")) != ("linux", arch, sha, version):
        raise ValueError(f"Image provenance mismatch at {ref}")
    return value


def publish_image(repository, source, version):
    require(OID.fullmatch(source), "Image source must be a full SHA")
    semver(version.removeprefix("v"))
    image_name = "ghcr.io/" + repository.lower()
    staging = f"{image_name}:sha-{source}-amd64"
    reserved = image(image_name, f"{image_name}:{version}", source, version, "amd64", missing=True)
    existing = image(image_name, staging, source, version, "amd64", missing=True)
    if existing is None and reserved is not None:
        existing = reserved
    if existing is None:
        registry_run("docker", "buildx", "build", "--platform", "linux/amd64", "--provenance=false", "--sbom=false", "--build-arg", f"VERSION={version}", "--build-arg", f"GIT_COMMIT={source}", "--tag", staging, "--push", ".")
        existing = image(image_name, staging, source, version, "amd64")
    require(reserved is None or reserved == existing, "Existing version image has conflicting bytes")
    if reserved is None:
        registry_run("docker", "buildx", "imagetools", "create", "--prefer-index=false", "--tag", f"{image_name}:{version}", f"{image_name}@{existing}")
    require(image(image_name, f"{image_name}:{version}", source, version, "amd64") == existing, "Version image read-back differs")
    print(f"Published immutable image: {image_name}@{existing}")


def sha256_file(path):
    value = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def docs_label(source, version, sha256):
    return f"source={source} version={version} sha256={sha256}"


def release_assets(repo, tag):
    """Release asset lookup by the draft-aware exact-tag listing; no uploads bypass it."""
    record = repo.release_tag_record(repo.repository(), tag)
    if record is None:
        raise ReleaseError(f"Release {tag} has no source-bound release record")
    assets = [asset for asset in record.get("assets") or [] if asset.get("name") == DOCS_ASSET]
    require(len(assets) <= 1, f"Ambiguous {DOCS_ASSET} release assets")
    return assets[0] if assets else None


def asset_sha256(repo, asset):
    remote = asset.get("digest")
    if remote:
        require(isinstance(remote, str) and DIGEST.fullmatch(remote),
                f"Invalid release asset digest: {remote!r}")
        return remote.removeprefix("sha256:")
    return hashlib.sha256(repo.api_asset_download(repo.repository(), asset["id"])).hexdigest()


def verify_docs_asset(repo, asset, source, version, built):
    repository = repo.repository()
    require(asset.get("name") == DOCS_ASSET, "Docs asset identity mismatch")
    actual = asset_sha256(repo, asset)
    label = asset.get("label") or ""
    if label:
        match = DOCS_LABEL.fullmatch(label)
        require(match, f"Unrecognized docs asset provenance: {label!r}")
        require(match["source"] == source, "Release docs asset is bound to another source")
        require(match["version"] == version, "Release docs asset is bound to another version")
        require(match["sha256"] == actual, "Release docs asset bytes differ from the recorded digest")
    require(actual == built, "Release docs asset bytes differ from the built documentation")
    expected = docs_label(source, version, built)
    if label != expected:
        updated = repo.api(f"repos/{repository}/releases/assets/{asset['id']}", "PATCH",
                           {"label": expected})
        require(updated.get("label") == expected, "Docs asset provenance was not recorded")


def publish_docs_asset(repo, source, version):
    require(isinstance(source, str) and OID.fullmatch(source), "Docs source must be a full SHA")
    tag = "v" + version.removeprefix("v")
    semver(tag[1:])
    require(repo.api_tag_target(tag) == source, f"Tag {tag} does not point at the frozen source")
    built_path = repo.root / "docs" / DOCS_ASSET
    require(built_path.is_file(), f"Missing built documentation: {built_path}")
    built = sha256_file(built_path)
    repository = repo.repository()
    asset = release_assets(repo, tag)
    if asset is not None:
        verify_docs_asset(repo, asset, source, tag, built)
        print(f"Verified immutable release docs: {tag} {source} {asset['browser_download_url']}")
        return
    label = docs_label(source, tag, built)
    created = False
    try:
        repo.run("gh", "release", "upload", tag,
                 f"{built_path.relative_to(repo.root).as_posix()}#{label}", "--repo", repository)
    except ReleaseError as error:
        # A concurrent upload is acceptable only when it is byte/provenance-identical.
        asset = release_assets(repo, tag)
        require(asset is not None, f"Documentation upload for {tag} failed: {error}")
    else:
        created = True
        deadline = time.monotonic() + 120
        while asset is None and time.monotonic() < deadline:
            time.sleep(2)
            asset = release_assets(repo, tag)
        require(asset is not None, f"Uploaded documentation for {tag} was not visible")
    verify_docs_asset(repo, asset, source, tag, built)
    action = "Published" if created else "Verified"
    print(f"{action} immutable release docs: {tag} {source} {asset['browser_download_url']}")


def verify_release_docs(repo, tag, source):
    require(repo.api_tag_target(tag) == source, f"Tag {tag} does not point at the frozen source")
    asset = release_assets(repo, tag)
    require(asset is not None, f"Release {tag} has no immutable {DOCS_ASSET} documentation asset")
    label = asset.get("label") or ""
    match = DOCS_LABEL.fullmatch(label)
    require(match, "Release docs asset provenance is missing or unrecognized")
    require(match["source"] == source, "Release docs asset is bound to another source")
    require(match["version"] == tag, "Release docs asset is bound to another version")
    require(match["sha256"] == asset_sha256(repo, asset),
            "Release docs asset bytes differ from the recorded digest")
    return asset


def dispatch_docs(repo, source, version, correlation):
    tag = "v" + version.removeprefix("v")
    semver(tag[1:])
    require(isinstance(source, str) and OID.fullmatch(source), "Docs source must be a full SHA")
    require(re.fullmatch(r"[0-9]+-[0-9]+", correlation), "Invalid docs correlation ID")
    repo.run("gh", "workflow", "run", "deploy-docs.yml", "--repo", repo.repository(), "--ref", tag, "-f", f"version={tag}", "-f", f"source={source}", "-f", f"release_run={correlation}")
    expected_title = f"Release docs {correlation}"
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        runs = repo.api(f"repos/{repo.repository()}/actions/workflows/deploy-docs.yml/runs?event=workflow_dispatch&per_page=100")["workflow_runs"]
        matches = [run for run in runs if run.get("display_title") == expected_title and run.get("head_sha") == source]
        require(len(matches) <= 1, "Ambiguous docs dispatch run")
        if matches:
            repo.run("gh", "run", "watch", str(matches[0]["id"]), "--repo", repo.repository(), "--exit-status", "--interval", "10")
            print(f"Verified docs run: {matches[0]['html_url']}")
            asset = verify_release_docs(repo, tag, source)
            print(f"Verified immutable release docs: {tag} {source} {asset['browser_download_url']}")
            jobs = repo.api(f"repos/{repo.repository()}/actions/runs/{matches[0]['id']}/jobs?per_page=100")["jobs"]
            deploy = [job for job in jobs if job.get("name") == "deploy"]
            require(len(deploy) <= 1, "Ambiguous docs deploy job")
            # The job-level conclusion also covers the in-deploy-job freshness
            # guard, so a successfully skipped result must not count as deployed:
            # inspect the actual deploy-pages step conclusion instead.
            step_conclusion = None
            if deploy:
                steps = repo.api(f"repos/{repo.repository()}/actions/jobs/{deploy[0]['id']}")["steps"]
                page_steps = [step for step in steps
                              if str(step.get("name", "")).startswith("Deploy to GitHub Pages")]
                require(len(page_steps) <= 1, "Ambiguous Pages deployment step")
                if page_steps:
                    step_conclusion = page_steps[0].get("conclusion")
            if step_conclusion == "success":
                print("Verified Pages deployment for the exact source")
            elif step_conclusion == "skipped":
                print("Pages intentionally retained its newer main source; immutable release docs remain authoritative")
            elif deploy and deploy[0].get("conclusion") == "skipped":
                print("Pages intentionally retained its newer main source; immutable release docs remain authoritative")
            else:
                print("Pages deployment was not observed; immutable release docs remain authoritative")
            return
        time.sleep(2)
    raise ReleaseError("The exact-source docs dispatch was not observed within 120 seconds")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    reserve = commands.add_parser("reserve")
    reserve.add_argument("--sha", required=True)
    reserve.add_argument("--version")
    reserve.add_argument("--bump", choices=("auto", "patch", "minor", "major"), default="auto")
    reserve.add_argument("--automatic", action="store_true")
    for name in ("image", "docs"):
        action = commands.add_parser(name)
        action.add_argument("--source", required=True)
        action.add_argument("--version", required=True)
        if name == "docs":
            action.add_argument("--correlation", required=True)
    docs_asset = commands.add_parser("docs-asset")
    docs_asset.add_argument("--source", required=True)
    docs_asset.add_argument("--version", required=True)
    finish = commands.add_parser("release")
    finish.add_argument("--tag", required=True)
    finish.add_argument("--source", required=True)
    finish.add_argument("--publish", action="store_true")
    args = parser.parse_args(argv)
    repo = Repository()
    try:
        repository = repo.repository()
        if args.command == "reserve":
            print(repo.reserve(args.sha, args.version, args.bump, args.automatic) or "")
        elif args.command == "release":
            repo.release(args.tag, args.source, args.publish)
        elif args.command == "image":
            publish_image(repository, args.source, args.version)
        elif args.command == "docs-asset":
            publish_docs_asset(repo, args.source, args.version)
        else:
            dispatch_docs(repo, args.source, args.version, args.correlation)
        return 0
    except (ReleaseError, OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        print(f"release: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
