"""Linux E-03 regression checks. Docker arbitration uses a unique, never-started carrier."""
import copy
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import cloud_local as local
import cloud_tests as runner
from cloud_guard import Reservation, supervised


class Engine:
    def __init__(self):
        self.containers = {}
        self.volumes = {}
        self.peers = {}
        self.project_names = {}
        self.generation = "b" * 64
        self.network_id = "c" * 64
        self.mutations = []
        self.other_user = False

    def configure(self, stack):
        self.generation = stack.info["generation"]
        for i, service in enumerate(("db", "auth", "rest", "storage", "kong"), 1):
            self.containers["supabase_" + service + "_" + stack.id] = f"{i:064x}"
        self.volumes = {name: ["created", "local"] for name in stack.volume_names()}
        self.peers = dict.fromkeys(self.containers.values(), {})
        self.project_names = {"container": list(self.containers), "volume": list(self.volumes)}

    def __call__(self, kind, command, *args):
        if kind == "info":
            return "test-daemon"
        if command == "ls":
            if "--filter" in args:
                return "\n".join(self.project_names[kind])
            return "\n".join(self.containers if kind == "container" else self.volumes)
        if (kind, command) == ("ps", "-aq"):
            name = args[-1].removeprefix("volume=")
            return self.containers[name] + ("\nforeign" if self.other_user else "")
        if command == "inspect":
            if kind == "container":
                if "Mounts" in args[1]:
                    return json.dumps([{"Type": "volume", "Name": name} for name in self.volumes
                                       if self.containers[name] == args[-1]])
                return self.containers[args[-1]]
            if kind == "volume":
                return " ".join(self.volumes[args[-1]])
            if "Containers" in args[1]:
                return json.dumps(self.peers)
            return self.network_id + " " + self.generation
        if command in ("stop", "rm"):
            self.mutations.append((kind, command, args[-1]))
            return args[-1]
        raise AssertionError((kind, command, args))


class Ownership(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.directory = Path(tmp.name) / "stack"
        self.engine = Engine()
        docker = patch.object(local, "docker", self.engine)
        self.addCleanup(docker.stop)
        docker.start()
        self.stack = local.Stack(self.directory, test=True)
        self.engine.configure(self.stack)
        self.stack.info["resources"] = self.stack.inventory()
        self.stack.save()

    def retained(self):
        with self.assertRaises((RuntimeError, ValueError)):
            local.Stack(self.directory, test=True).stop(discard=True)
        self.assertEqual(self.engine.mutations, [])

    def test_verified_stop_by_id_and_test_cleanup(self):
        self.stack.stop(discard=True)
        removed = {(kind, value) for kind, op, value in self.engine.mutations if op == "rm"}
        self.assertEqual(removed, {("container", x) for x in self.engine.containers.values()}
                         | {("network", self.engine.network_id)})
        self.assertEqual({x for _, op, x in self.engine.mutations if op == "stop"}, set(self.engine.containers.values()))

    def test_normal_stop_preserves_volumes_and_containers(self):
        self.stack.stop()
        self.assertTrue(all(op == "stop" for _, op, _ in self.engine.mutations))
        self.assertEqual(len(self.engine.mutations), 5)

    def test_old_owner(self):
        self.stack.info.pop("schema")
        self.stack.save()
        self.retained()

    def test_stale_snapshot_same_name_new_container(self):
        self.engine.containers[self.stack.db] = "f" * 64
        self.retained()

    def test_same_name_recreated_volume(self):
        self.engine.volumes[self.stack.db] = ["later", "local"]
        self.retained()

    def test_same_name_new_network(self):
        self.engine.network_id = "f" * 64
        self.retained()

    def test_corrupt_and_missing_manifest(self):
        self.stack.manifest.write_text("{")
        self.retained()
        self.stack.manifest.unlink()
        self.retained()

    def test_manifest_lost_while_test_runs(self):
        self.stack.manifest.unlink()
        with self.assertRaises(RuntimeError):
            self.stack.stop(discard=True)
        self.assertEqual(self.engine.mutations, [])

    def test_partial_start_has_no_enrolled_resources(self):
        self.stack.info["resources"] = None
        self.stack.save()
        self.retained()

    def test_foreign_project(self):
        self.engine.project_names["volume"].remove(self.stack.db)
        self.retained()

    def test_attached_foreign_volume_or_network_user(self):
        self.engine.other_user = True
        self.retained()
        self.engine.other_user = False
        self.engine.peers["another-container"] = {}
        self.retained()


class Results(unittest.TestCase):
    def setUp(self):
        self.file = "tests/synthetic.test.cjs"
        counts = dict(tests=1, passed=1, failed=0, skipped=0, cancelled=0, todo=0)
        self.rows = [dict(file=self.file, success=True, counts=counts),
                     dict(file=None, success=True, counts=counts.copy())]

    def check(self, rows, files=None, code=0):
        data = "\n".join("E03 " + json.dumps(r) for r in rows)
        return runner.strict_result(data, [self.file] if files is None else files, code)[0]

    def test_pass(self):
        self.assertTrue(self.check(self.rows))

    def test_skip_fail_cancel_todo(self):
        for status in ("skipped", "failed", "cancelled", "todo"):
            with self.subTest(status=status):
                rows = copy.deepcopy(self.rows)
                for row in rows:
                    row["counts"][status] = 1
                self.assertFalse(self.check(rows))

    def test_zero_and_missing_result(self):
        for row in self.rows:
            row["counts"].update(tests=0, passed=0)
        self.assertFalse(self.check(self.rows))
        self.assertFalse(self.check([]))
        self.assertFalse(runner.strict_result("E03 {", [self.file], 0)[0])

    def test_nonzero_exit_and_counts(self):
        self.assertFalse(self.check(self.rows, code=1))
        self.rows[-1]["counts"]["tests"] = 2
        self.assertFalse(self.check(self.rows))

    def test_missing_duplicate_or_extra_file(self):
        self.assertFalse(self.check(self.rows, files=[self.file, self.file]))
        self.assertFalse(self.check(self.rows + [self.rows[0]]))
        self.assertFalse(self.check(self.rows, files=["tests/different.test.cjs"]))
        self.assertFalse(self.check(self.rows[:-1]))

    def test_node_standalone_requires_completion_and_success(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / "tests"
            folder.mkdir()
            file = folder / "environment-dashboard.integration.cjs"
            name = str(file.relative_to(root))
            for script, expected in [
                ("", False),
                ("console.log('unrelated');", False),
                ('console.log(JSON.stringify({passed: true})); process.exitCode=1;', False),
                ('require("node:assert/strict").equal(1,1); console.log(JSON.stringify({passed: true}));', True),
            ]:
                with self.subTest(script=script):
                    file.write_text(script)
                    cmd = ["node", "--test", "--test-reporter=" + str(local.ROOT / "scripts/cloud-test-reporter.cjs"), name]
                    result = subprocess.run(cmd, cwd=root, capture_output=True, text=True)
                    self.assertEqual(runner.strict_result(result.stdout, [name], result.returncode)[0], expected)

    def test_duplicate_inventory(self):
        files = json.loads(runner.output(["node", "tests/run-integration.cjs", "--list"], cwd=local.ROOT))
        with patch.object(runner, "output", return_value=json.dumps(files + files[:1])):
            with self.assertRaises(RuntimeError):
                runner.memory_files(local.ROOT)


def wait_for(path):
    for _ in range(400):
        if path.exists():
            return
        time.sleep(0.05)
    raise RuntimeError("Timed out waiting for synthetic worker")


def tree(directory):
    (directory / "worker").write_text(str(os.getpid()))
    child = os.fork()
    if child == 0:
        grandchild = os.fork()
        if grandchild == 0:
            os.setsid()
            (directory / "grandchild").touch()
            wait_for(directory / "release-grandchild")
            os._exit(0)
        (directory / "child").touch()
        wait_for(directory / "release-child")
        os._exit(0)
    os.waitpid(child, 0)


class Arbitration(unittest.TestCase):
    def test_killed_frontend_and_worker_with_detached_grandchild(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            name = "regression-" + secrets.token_hex(12)
            reservation = Reservation(name)
            frontend = subprocess.Popen([sys.executable, "-B", __file__, "tree", str(directory), name],
                                        cwd=directory, stderr=subprocess.DEVNULL)
            try:
                wait_for(directory / "grandchild")
                frontend.kill()
                frontend.wait(timeout=5)
                os.kill(int((directory / "worker").read_text()), signal.SIGKILL)
                with self.assertRaises(RuntimeError):
                    reservation.acquire()
                (directory / "release-child").touch()
                # Use a second process and a different cwd; no shared lock file is needed.
                second = subprocess.run([sys.executable, "-B", __file__, "probe", name], cwd=local.ROOT,
                                        stderr=subprocess.DEVNULL)
                self.assertEqual(second.returncode, 3)
            finally:
                (directory / "release-child").touch()
                (directory / "release-grandchild").touch()
                if frontend.poll() is None:
                    frontend.wait(timeout=10)
            for _ in range(120):
                active = local.docker("ps", "-a", "--format", "{{.Names}}").splitlines()
                if reservation.name not in active:
                    break
                time.sleep(0.1)
            else:
                self.fail("Guardian failed to release after descendants exited")
            ident = reservation.acquire()
            reservation.release(ident)


if __name__ == "__main__":
    if sys.argv[1:2] == ["tree"]:
        sys.exit(supervised(lambda: tree(Path(sys.argv[2])), Reservation(sys.argv[3])))
    if sys.argv[1:2] == ["probe"]:
        reservation = Reservation(sys.argv[2])
        try:
            ident = reservation.acquire()
        except RuntimeError:
            sys.exit(3)
        reservation.release(ident)
        sys.exit(0)
    unittest.main()
