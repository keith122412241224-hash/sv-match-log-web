#!/usr/bin/env python3
"""Prepare pinned test tooling; run the standard suite or all integration files."""
import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import sys
import shutil
import signal
import subprocess
import tempfile
import time

sys.dont_write_bytecode = True
from cloud_guard import Reservation, drain_children, supervised
from cloud_local import ROOT, STATE, LOCAL, Stack, install_tools, local_env, output, preflight, prepare, require, run

# These four suites exercise real Postgres, and three also use GoTrue and PostgREST.
# Two require 56322 with incompatible histories, so give each a fresh project.
NATIVE = {
    "environment-schedule": (56321, None, None),
    "environment-dashboard": (56321, "20260930040027", "e1-evidence/start.log"),
    "multi-rank": (57321, "20260930071612", "e12/keys.json"),
    "environment-dashboard-v3": (58321, "20261001080455", "ux-evidence/keys.json"),
}


def test_env():
    modules = install_tools("qa")
    versions = {"@electric-sql/pglite": "0.5.8", "pg": "8.16.3"}
    packages = {name: modules / name for name in versions}
    for name, path in packages.items():
        require(json.loads((path / "package.json").read_text())["version"] == versions[name],
                "Test tool version mismatch: " + name)
    return {**local_env(), "PGLITE_MODULE": str(packages["@electric-sql/pglite"]),
            "PG_MODULE": str(packages["pg"])}


def checkout(dest):
    # Preserve Git objects for git-show assertions; bring current tracked edits along.
    run(["git", "clone", "-q", "--no-hardlinks", "--no-checkout", ROOT, dest])
    run(["git", "checkout", "-q", "--detach", output(["git", "rev-parse", "HEAD"], cwd=ROOT)], cwd=dest)
    patch = run(["git", "diff", "--binary", "HEAD"], cwd=ROOT, stdout=subprocess.PIPE).stdout
    if patch:
        run(["git", "apply", "--binary", "-"], cwd=dest, input=patch)
    new = output(["git", "ls-files", "--others", "--exclude-standard", "-z",
                  "--", "src", "tests", "supabase/migrations"], cwd=ROOT)
    for name in filter(None, new.split("\0")):
        require(not (ROOT / name).is_symlink(), "Symlink in untracked test inputs")
        (dest / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, dest / name)
    (dest / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)
    (dest / "build").mkdir()


def remove_work(kind):
    directory = STATE / ("work-" + kind)
    if not directory.exists():
        return
    owner = directory / "owner"
    require(not directory.is_symlink() and owner.is_file() and not owner.is_symlink()
            and owner.read_text() == workspace_stamp(directory), "Unknown test workspace; leaving it intact.")
    shutil.rmtree(directory)


def workspace_stamp(directory):
    stat = directory.stat()
    return json.dumps([str(directory.resolve()), stat.st_dev, stat.st_ino,
                       os.getxattr(directory, "user.svml.run").hex()])


@contextmanager
def test_checkout(kind):
    directory = STATE / ("work-" + kind)
    require(not directory.exists(), "Previous test workspace exists; run cleanup first.")
    directory.mkdir()
    os.setxattr(directory, "user.svml.run", os.urandom(32), os.XATTR_CREATE)
    (directory / "owner").write_text(workspace_stamp(directory))
    dest = directory / "checkout"
    checkout(dest)
    yield dest
    drain_children()
    remove_work(kind)


def strict_result(data, files, code):
    keys = {"tests": "tests", "pass": "passed", "fail": "failed", "skipped": "skipped",
            "cancelled": "cancelled", "todo": "todo"}
    totals = {}
    observed = {}
    try:
        for line in data.splitlines():
            if not line.startswith("E03 "):
                continue
            row = json.loads(line[4:])
            counts = {key: row["counts"][field] for key, field in keys.items()}
            if not all(type(v) is int and v >= 0 for v in counts.values()):
                return False, {}
            file = row["file"]
            if file is None:
                if totals:
                    return False, {}
                totals = counts
            else:
                if file in observed:
                    return False, totals
                observed[file] = counts
            if row["success"] is not True:
                code = 1
        good = (code == 0 and bool(files) and sorted(files) == sorted(observed)
                and bool(totals) and all(totals[k] == sum(c[k] for c in observed.values()) for k in keys)
                and all(c["tests"] > 0 and c["tests"] == c["pass"] and
                        not any(c[k] for k in ("fail", "skipped", "cancelled", "todo")) for c in observed.values()))
        return good, totals
    except (TypeError, ValueError, KeyError, AttributeError):
        return False, {}


def suite(label, cmd, cwd, env, report, files):
    print(f"Running {label}", flush=True)
    # Native fixtures may include synthetic sessions in assertion failures. Keep raw
    # output inside the private disposable checkout; print only counts and test names.
    with tempfile.TemporaryFile(mode="w+") as log:
        start = time.monotonic()
        reporter = ROOT / "scripts/cloud-test-reporter.cjs"
        test_environment = {**env, "NODE_OPTIONS": "--test-reporter=" + json.dumps(str(reporter))}
        process = subprocess.Popen(cmd, cwd=cwd, env=test_environment, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        try:
            code = process.wait()
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait()
            raise
        finally:
            drain_children()
        log.seek(0)
        data = log.read()
    ok, counts = strict_result(data, files, code)
    entry = {"suite": label, "exit": code, "seconds": round(time.monotonic()-start),
             "expected_files": len(files), "verified": ok, **counts}
    report.append(entry)
    print(json.dumps(entry), flush=True)
    if code and re.search(r"ENOSPC|no space left on device", data, re.I):
        raise RuntimeError("Test filesystem full; stopped before the next suite.")
    return ok


def memory_files(dest):
    files = json.loads(output(["node", "tests/run-integration.cjs", "--list"], cwd=dest))
    files.extend(name + ".integration.cjs" for name in
                 ("environment-review-db", "environment-review-snapshot", "public-encounters", "security-audit"))
    native = {name + ".integration.cjs" for name in NATIVE}
    discovered = {p.name for p in (dest / "tests").glob("*.integration.cjs")}
    require(len(files) == len(set(files)) and not set(files) & native and discovered == set(files) | native,
            "Integration inventory changed: classify the new suite and its resources first.")
    return sorted("tests/" + name for name in files)


def integrate(dest, env, report, native_only=None):
    files = memory_files(dest)
    ok = True
    if not native_only:
        ok = suite("PGlite", ["node", "--require", "./tests/register.cjs", "--test", "--test-concurrency=2",
                              *files], dest, env, report, files)
    for name, (port, last, fixture) in NATIVE.items():
        if native_only and name not in native_only:
            continue
        directory = STATE / ("test-" + name)
        require(not directory.exists(), "Previous native stack remains; inspect before cleanup.")
        stack = Stack(directory, port, last, test=True, source=dest)
        stack.up()
        if fixture:
            target = dest / "build" / fixture
            target.parent.mkdir()
            target.write_text(json.dumps({"API_URL": f"http://{LOCAL}:{port}",
                "DB_URL": f"postgresql://postgres:postgres@{LOCAL}:{port+1}/postgres",
                "ANON_KEY": stack.anon, "SERVICE_ROLE_KEY": stack.service}))
        filename = "tests/" + name + ".integration.cjs"
        ok = suite(name, ["node", "--test", filename], dest, env, report, [filename]) and ok
        stack.stop(discard=True)
        shutil.rmtree(stack.dir)
    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["prepare", "standard", "integration", "cleanup"])
    parser.add_argument("--native-only", choices=NATIVE, nargs="+", help="Run selected native suites after a setup failure")
    args = parser.parse_args()
    os.umask(0o077)
    if args.native_only and args.action != "integration":
        parser.error("--native-only requires integration")
    def interrupt(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupt)
    if args.native_only and len(set(args.native_only)) != len(args.native_only):
        parser.error("Duplicate native test file")
    preflight(cleanup=args.action == "cleanup")
    sys.stdout.flush()
    sys.exit(supervised(lambda: execute(args), Reservation("tests")))


def execute(args):
    with (STATE / ("standard.lock" if args.action == "standard" else "integration.lock")).open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == "cleanup":
            for name, (port, last, _) in NATIVE.items():
                directory = STATE / ("test-" + name)
                if directory.exists():
                    Stack(directory, port, last, test=True).stop(discard=True)
                    shutil.rmtree(directory)
            remove_work("integration")
            with (STATE / "standard.lock").open("a") as standard_lock:
                fcntl.flock(standard_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                remove_work("standard")
            return
        prepare(cli_needed=args.action != "standard")
        with (STATE / "qa.lock").open("a") as prep_lock:
            fcntl.flock(prep_lock, fcntl.LOCK_EX)
            env = test_env()
        if args.action == "prepare":
            return
        report = []
        with test_checkout(args.action) as dest:
            try:
                if args.action == "standard":
                    files = sorted(str(p.relative_to(dest)) for p in (dest / "tests").glob("*.test.cjs"))
                    ok = suite("standard", ["npm", "test"], dest, env, report, files)
                else:
                    ok = integrate(dest, env, report, args.native_only)
            finally:
                label = "-".join(args.native_only) if args.native_only else args.action
                (STATE / (label + "-result.json")).write_text(json.dumps(report, indent=2))
            require(ok, "Suite failed; see the counts above")


if __name__ == "__main__":
    main()
