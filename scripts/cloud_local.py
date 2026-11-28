#!/usr/bin/env python3
"""Linux/Codex Cloud: isolated local development stack. No hosted commands."""
import argparse
import base64
import fcntl
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "build/cloud-restore"
CLI_VERSION = (ROOT / ".supabase-cli-version").read_text().strip()
EXCLUDE = "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
DEV_API, WEB = 55321, 3100
GOOGLE_STACK = "google-path-logs"
LOCAL = "127.0.0.1"
GIB = 1024 ** 3


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], check=True, **kwargs)


def output(args, **kwargs):
    return run(args, stdout=subprocess.PIPE, text=True, **kwargs).stdout.strip()


def local_env():
    # Allow tooling and the package/image proxy, never inherit application or DB settings.
    keep = {"PATH", "HOME", "LANG", "TMPDIR", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS",
            "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"}
    return {**{k: v for k, v in os.environ.items() if k in keep},
            "DOCKER_HOST": "unix:///var/run/docker.sock", "NEXT_TELEMETRY_DISABLED": "1",
            "SUPABASE_HOME": str(STATE / "cli-home"), "SUPABASE_TELEMETRY_DISABLED": "1"}


def preflight(cleanup=False, docker_needed=True):
    commands = ["git", "node", "npm"] + (["docker"] if docker_needed else [])
    require(all(shutil.which(x) for x in commands), "Missing tool: check " + ", ".join(commands))
    require(Path(output(["git", "rev-parse", "--show-toplevel"], cwd=ROOT)) == ROOT, "Wrong checkout")
    print("HEAD", output(["git", "rev-parse", "HEAD"], cwd=ROOT), flush=True)
    require(not any(f.name != ".env.example" for f in ROOT.glob(".env*")),
            "Use a checkout without dotenv files.")
    require(not (ROOT / "supabase/.temp/project-ref").exists(), "Linked checkout: use a fresh clone.")
    for k in ("DATABASE_URL", "SUPABASE_DB_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "PGHOST"):
        v = os.environ.get(k)
        if v:
            host = v if k == "PGHOST" else urlsplit(v).hostname
            require(host in (LOCAL, "localhost", "::1"), f"Non-local {k}: stop.")
    for k in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"):
        require(k not in os.environ, f"Remove {k} from the development shell.")
    require(not STATE.is_symlink() and not STATE.parent.is_symlink(), "Unsafe state path")
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / "cli-home").mkdir(exist_ok=True)
    if not cleanup:
        require(shutil.disk_usage(ROOT).free >= 2 * GIB, "Need 2 GiB free for dependencies/build.")
    if docker_needed:
        print("Docker", docker("version", "--format", "{{.Server.Version}}"), flush=True)
    print("Node", output(["node", "-v"]), "npm", output(["npm", "-v"]), flush=True)


def npm(args, cwd):
    cache = Path("/workspace/.svml-tools/npm-cache")
    if not cache.is_dir():
        cache = STATE / "npm-cache"
    run(["npm", *args, "--cache", cache, "--prefer-offline", "--no-audit", "--no-fund"],
        cwd=cwd, env=local_env())


def prepare(cli_needed=True):
    with (STATE / "dependencies.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        prepare_locked(cli_needed)


def prepare_locked(cli_needed):
    digest = hashlib.sha256((ROOT / "package-lock.json").read_bytes() + (ROOT / "package.json").read_bytes()).hexdigest()
    stamp = STATE / "deps.sha256"
    if (ROOT / "node_modules").exists():
        require(stamp.is_file() and stamp.read_text() == digest,
                "Unmanaged node_modules or changed lock: use a fresh checkout; nothing was replaced.")
    else:
        # Install beside the checkout on the same filesystem, then publish only a complete tree.
        with tempfile.TemporaryDirectory(dir=STATE, prefix="app-install-") as tmp:
            stage = Path(tmp)
            for filename in ("package.json", "package-lock.json"):
                shutil.copy2(ROOT / filename, stage / filename)
            npm(["ci"], stage)
            (stage / "node_modules").rename(ROOT / "node_modules")
        stamp.write_text(digest)
    require(all((ROOT / "node_modules/.bin" / x).is_file() for x in ("next", "tsc")), "Dependencies incomplete")
    tree = subprocess.run(["npm", "ls", "--all", "--offline"], cwd=ROOT, env=local_env(),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    require(tree.returncode == 0, "Incomplete npm dependency tree: restore in a fresh checkout.")
    if not cli_needed:
        return
    install_tools("cli")
    require(output([cli_path(), "--version"], env=local_env()).splitlines()[-1] == CLI_VERSION,
            "Supabase CLI version mismatch")


def tools_dir(profile):
    lock = ROOT / "scripts/cloud-tools/package-lock.json"
    return STATE / (profile + "-" + hashlib.sha256(lock.read_bytes()).hexdigest()[:16])


def install_tools(profile):
    manifests = ROOT / "scripts/cloud-tools"
    require(json.loads((manifests / "package.json").read_text())["dependencies"]["supabase"] == CLI_VERSION,
            "Tool manifest disagrees with .supabase-cli-version")
    dest = tools_dir(profile)
    if not dest.exists():
        with tempfile.TemporaryDirectory(dir=STATE, prefix="tool-install-") as tmp:
            stage = Path(tmp) / "pkg"
            stage.mkdir()
            for filename in ("package.json", "package-lock.json"):
                shutil.copy2(manifests / filename, stage / filename)
            npm(["ci", "--ignore-scripts", "--include=dev" if profile == "qa" else "--omit=dev"], stage)
            stage.rename(dest)
    return dest / "node_modules"


def cli_path():
    return tools_dir("cli") / "node_modules/.bin/supabase"


def check_ports(*ports):
    for port in ports:
        with socket.socket() as sock:
            try:
                # A closed connection in TIME_WAIT is not an active listener.
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind((LOCAL, port))
                sock.listen(1)
            except OSError:
                raise RuntimeError(f"Port {port} in use; no service was stopped.") from None


def docker(*args):
    return output(["docker", *args], env=local_env())


def disk_check():
    # Measure the daemon filesystem, which can differ from the checkout filesystem.
    images = docker("image", "ls", "--filter", "reference=supabase/postgres:*", "--format", "{{.ID}}").splitlines()
    image = images[0] if images else "busybox:1.37.0"
    df = docker("run", "--rm", "--network", "none", "--entrypoint", "df", image, "-Pk", "/")
    free = int(df.splitlines()[-1].split()[3]) * 1024
    print(f"Docker free: {free / GIB:.1f} GiB", flush=True)
    require(free >= 4 * GIB, "Docker has less than 4 GiB free; stop.")


def fixture_token(role, secret):
    def encode(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=")
    header = encode(b'{"alg":"HS256","typ":"JWT"}')
    payload = encode(json.dumps({"iss": "supabase", "role": role, "exp": 4102444800}).encode())
    data = header + b"." + payload
    return (data + b"." + encode(hmac.digest(secret.encode(), data, "sha256"))).decode()


class Stack:
    def __init__(self, directory, port=DEV_API, last=None, test=False, source=ROOT, google=False):
        require(not directory.is_symlink(), "Unsafe stack path")
        self.dir = directory
        self.port = port
        self.google = google
        self.db_port = port + (101 if google else 1)
        self.mail_port = port + 103
        self.services = (("db", "inbucket") if google else ("db",)) + ("auth", "rest", "storage", "kong")
        self.source = source
        self.test = test
        self.migrations = [f for f in sorted((source / "supabase/migrations").glob("*.sql"))
                           if last is None or f.name.split("_")[0] <= last]
        if last:
            require(self.migrations[-1].name.startswith(last + "_"), "Unknown migration cutoff")
        self.manifest = directory / "owner.json"
        self.new = not directory.exists()
        if self.new:
            directory.mkdir(parents=True)
        stat = directory.stat()
        binding = dict(schema=2, directory=str(directory.resolve()), inode=[stat.st_dev, stat.st_ino],
                       daemon=docker("info", "--format", "{{.ID}}"), test=test, port=port)
        require(binding["daemon"], "Cannot identify local Docker daemon")
        if self.new:
            self.info = dict(**binding, id="svml-e03-" + secrets.token_hex(12), fixture=secrets.token_hex(32),
                             generation=secrets.token_hex(32), resources=None)
            self.save()
        else:
            require(self.manifest.is_file() and not self.manifest.is_symlink(), "Missing owner record; retained.")
            try:
                self.info = json.loads(self.manifest.read_text())
                valid = all(self.info[k] == v for k, v in binding.items())
                valid = valid and all(re.fullmatch(r"[0-9a-f]{64}", self.info[k]) for k in ("generation", "fixture"))
                valid = valid and re.fullmatch(r"svml-e03-[0-9a-f]{24}", self.info["id"])
            except (ValueError, KeyError, TypeError):
                valid = False
            require(valid, "Old, invalid or foreign owner record; retained.")
        self.id, self.secret = self.info["id"], self.info["fixture"]
        self.anon = fixture_token("anon", self.secret)
        self.service = fixture_token("service_role", self.secret)
        self.env = {**local_env(), "SVML_FIXTURE_JWT": self.secret, "SVML_FIXTURE_ANON": self.anon,
                    "SVML_FIXTURE_SERVICE": self.service}
        self.db = "supabase_db_" + self.id
        self.network = self.id + "-local"

    def validate_config(self, text):
        config = tomllib.loads(text)
        require(config["project_id"] == self.id and config["api"]["port"] == self.port
                and config["db"]["port"] == self.db_port, "Unexpected project ID or port")
        require(config["db"]["seed"]["enabled"] is False
                and config["auth"]["site_url"] == f"http://{LOCAL}:{WEB}", "Unexpected seed or Auth URL")
        require(config["auth"].get("jwt_secret") == "env(SVML_FIXTURE_JWT)"
                and config["auth"].get("anon_key") == "env(SVML_FIXTURE_ANON)"
                and config["auth"].get("service_role_key") == "env(SVML_FIXTURE_SERVICE)",
                "Local Auth fixture configuration mismatch")

    def cli(self, *args, **kwargs):
        cfg = self.dir / "supabase"
        require(not (cfg / ".temp/project-ref").exists(), "Linked generated project")
        require(not list(cfg.glob(".env*")) and not list(self.dir.glob(".env*")), "Unexpected stack dotenv")
        self.validate_config((cfg / "config.toml").read_text())
        command = [cli_path(), "--workdir", self.dir, *args]
        if args and args[0] == "start":
            # Windows checkouts can have CRLF and no executable bit. Install the
            # loopback wrapper only for this CLI invocation, on the Linux filesystem.
            with tempfile.TemporaryDirectory(dir=self.dir) as temp:
                wrapper = Path(temp) / "docker"
                wrapper.write_text((ROOT / "scripts/docker-loopback/docker").read_text())
                wrapper.chmod(0o700)
                env = {**self.env, "SVML_DOCKER_BINARY": shutil.which("docker"), "SVML_STACK_ID": self.id,
                       "PATH": temp + os.pathsep + self.env["PATH"]}
                return run(command, env=env, **kwargs)
        return run(command, env=self.env, **kwargs)

    def config(self):
        cfg = self.dir / "supabase"
        require(not (cfg / ".temp/project-ref").exists(), "Linked generated project")
        text = (self.source / "supabase/config.toml").read_text()
        text = re.sub(r'(?m)^project_id = ".*"$', f'project_id = "{self.id}"', text)
        text = re.sub(r'\b543(\d\d)\b', lambda m: str(self.port - 21 + int(m[1])), text)
        text = text.replace("127.0.0.1:3000", f"{LOCAL}:{WEB}")
        if self.google:
            text = text.replace(f"\nport = {self.port + 1}\n", f"\nport = {self.db_port}\n")
            text = text.replace(f"\nport = {self.port + 3}\n", f"\nport = {self.mail_port}\n")
            callback = f"http://{LOCAL}:{WEB}/auth/confirm"
            text = text.replace(f'["https://{LOCAL}:{WEB}"]', f'["{callback}", "{callback}?next=/auth/reset-password"]')
            text = text.replace("enable_confirmations = false", "enable_confirmations = true", 1)
            text += (f'\n[auth.external.google]\nenabled = true\n'
                     'client_id = "env(SVML_GOOGLE_CLIENT_ID)"\nsecret = "env(SVML_GOOGLE_CLIENT_SECRET)"\n'
                     f'redirect_uri = "http://{LOCAL}:{self.port}/auth/v1/callback"\n')
        text = text.replace("[auth]\n", '[auth]\njwt_secret = "env(SVML_FIXTURE_JWT)"\n'
                            'anon_key = "env(SVML_FIXTURE_ANON)"\nservice_role_key = "env(SVML_FIXTURE_SERVICE)"\n')
        if self.test:
            text = text.replace("enable_anonymous_sign_ins = false", "enable_anonymous_sign_ins = true")
        self.validate_config(text)
        complete = (self.dir / "configured").is_file()
        files = {cfg / "config.toml": text.encode(), **{cfg / "migrations" / f.name: f.read_bytes() for f in self.migrations}}
        for path, data in files.items():
            if path.exists():
                require(path.read_bytes() == data, "Local configuration/migrations changed; use a new checkout.")
            else:
                require(not complete, "Migration set changed; use a fresh checkout.")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
        require(set((cfg / "migrations").glob("*.sql")) == set(files) - {cfg / "config.toml"}, "Unexpected migrations")

        (self.dir / "configured").touch()

    def members(self, kind):
        return docker(kind, "ls", *(["-a"] if kind == "container" else []), "--filter",
                      "label=com.supabase.cli.project=" + self.id, "--format", "{{.Names}}" if kind == "container" else "{{.Name}}").splitlines()

    def save(self):
        with tempfile.NamedTemporaryFile(mode="w", dir=self.dir, delete=False) as f:
            json.dump(self.info, f)
            f.flush()
            os.fsync(f.fileno())
        os.replace(f.name, self.manifest)

    def names(self, kind):
        field = "{{.Names}}" if kind == "container" else "{{.Name}}"
        return docker(kind, "ls", *(["-a"] if kind == "container" else []), "--format", field).splitlines()

    def inventory(self):
        """Read only identities, mounts and network membership, never container Env."""
        names = {kind: set(self.members(kind)) for kind in ("container", "volume")}
        for kind, owned in names.items():
            require(owned == {n for n in self.names(kind) if n.endswith("_" + self.id)},
                    "Foreign resource in project namespace; retained.")
        expected = {"supabase_" + service + "_" + self.id for service in self.services}
        require(names["container"] == expected and names["volume"] == set(self.volume_names()),
                "Unexpected resource set; retained.")
        ident = docker("network", "inspect", "-f", '{{.Id}} {{index .Labels "svml.e03.generation"}}', self.network).split()
        require(len(ident) == 2 and re.fullmatch("[0-9a-f]{64}", ident[0]) and ident[1] == self.info["generation"],
                "Network generation mismatch; retained.")
        containers = {}
        for name in sorted(expected):
            value = docker("container", "inspect", "-f", "{{.Id}}", name)
            require(re.fullmatch("[0-9a-f]{64}", value), "Invalid container ID")
            containers[name] = value
        peers = json.loads(docker("network", "inspect", "-f", "{{json .Containers}}", ident[0])) or {}
        require(set(peers) <= set(containers.values()), "Foreign network user; retained.")
        volumes = {}
        for name in self.volume_names():
            identity = docker("volume", "inspect", "-f", "{{.CreatedAt}} {{.Driver}}", name).split()
            require(len(identity) == 2 and identity[1] == "local", "Unsupported volume identity; retained.")
            users = docker("ps", "-aq", "--no-trunc", "--filter", "volume=" + name).splitlines()
            # Docker forbids detaching/replacing a named volume on an existing container,
            # even while stopped. Pin the original mount and its immutable consumer ID.
            mounts = json.loads(docker("container", "inspect", "-f", "{{json .Mounts}}", containers[name]))
            require(set(users) == {containers[name]} and any(
                m["Type"] == "volume" and m.get("Name") == name for m in mounts),
                "Missing or foreign volume user; retained.")
            volumes[name] = identity
        return dict(network=ident[0], containers=containers, volumes=volumes)

    def volume_names(self):
        return [self.db, "supabase_storage_" + self.id]

    def verified(self):
        stat = self.dir.stat()
        require(not self.dir.is_symlink() and [stat.st_dev, stat.st_ino] == self.info["inode"]
                and self.manifest.is_file() and not self.manifest.is_symlink()
                and json.loads(self.manifest.read_text()) == self.info
                and docker("info", "--format", "{{.ID}}") == self.info["daemon"],
                "Owner record or Docker daemon changed during this run; retained.")
        recorded = self.info.get("resources")
        require(isinstance(recorded, dict) and self.inventory() == recorded,
                "Incomplete or replaced Docker resources; retained.")
        return recorded

    def up(self):
        disk_check()
        self.config()
        if self.new:
            check_ports(self.port, self.db_port, *([self.mail_port] if self.google else []))
            require(self.network not in self.names("network") and all(
                not self.members(kind) and not any(n.endswith("_" + self.id) for n in self.names(kind))
                for kind in ("container", "volume")), "Occupied project namespace; retained.")
            generation = "svml.e03.generation=" + self.info["generation"]
            network_id = docker("network", "create", "--label", generation, "--opt",
                                "com.docker.network.bridge.host_binding_ipv4=127.0.0.1", self.network)
            # Do not expose the CLI's status table or auth configuration in error messages.
            with tempfile.TemporaryFile() as err:
                try:
                    exclude = EXCLUDE.replace("mailpit,", "") if self.google else EXCLUDE
                    self.cli("start", "--network-id", network_id, "-x", exclude, "--ignore-health-check",
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL if self.google else err)
                except subprocess.CalledProcessError:
                    err.seek(0)
                    full = any(b"ENOSPC" in line or b"no space left on device" in line.lower() for line in err)
                    raise RuntimeError("Docker storage full; no prune performed." if full else
                                       "Local start failed; check Docker, image availability and free ports.") from None
            resources = self.inventory()
            peers = json.loads(docker("network", "inspect", "-f", "{{json .Containers}}", network_id))
            require(set(peers or {}) == set(resources["containers"].values()), "Unverified network endpoints; retained.")
            require(resources["network"] == network_id, "Network replaced during start; retained.")
            self.info["resources"] = resources
            self.save()
        else:
            resources = self.verified()
            gateway = resources["containers"]["supabase_kong_" + self.id]
            require(docker("inspect", "-f", '{{index .Config.Labels "svml.auth-log-format"}}', gateway) == "path-v1",
                    "Legacy gateway log format; retain this stack and use a fresh checkout for auth testing.")
            for service in self.services:
                ident = resources["containers"]["supabase_" + service + "_" + self.id]
                if docker("container", "inspect", "-f", "{{.State.Running}}", ident) == "false":
                    docker("container", "start", ident)
        db_id = resources["containers"][self.db]
        for attempt in range(60):
            try:
                docker("exec", db_id, "pg_isready", "-q", "-U", "postgres")
                break
            except subprocess.CalledProcessError:
                if attempt == 59:
                    raise RuntimeError("Local PostgreSQL did not become ready") from None
                time.sleep(1)
        bindings = [(self.db, self.db_port, "5432"), ("supabase_kong_" + self.id, self.port, "8000")]
        if self.google:
            bindings.append(("supabase_inbucket_" + self.id, self.mail_port, "8025"))
        for name, port, internal in bindings:
            require(name in self.members("container"), "Missing owned container: " + name)
            require(docker("port", resources["containers"][name], internal + "/tcp") == f"{LOCAL}:{port}", "Unexpected Docker port binding")
        versions = docker("exec", db_id, "psql", "-XAt", "-U", "postgres", "-d", "postgres", "-c",
                          "select version from supabase_migrations.schema_migrations order by version").splitlines()
        require(versions == [p.name.split("_")[0] for p in self.migrations], "Migration history mismatch")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        for route in ("auth/v1/health", "rest/v1/", "storage/v1/status", "rest/v1/environments?select=id&limit=0"):
            headers = {"apikey": self.anon}
            if "limit=0" in route:
                headers["Authorization"] = "Bearer " + self.anon
            req = urllib.request.Request(f"http://{LOCAL}:{self.port}/{route}", headers=headers)
            for attempt in range(30):
                try:
                    with opener.open(req, timeout=3) as res:
                        require(res.status == 200, "API status " + route)
                        if route == "auth/v1/health":
                            require(json.load(res).get("version"), "Unexpected Auth response")
                        if route == "rest/v1/":
                            api = json.load(res)
                            require("swagger" in api or "openapi" in api, "Unexpected REST response")
                        if "limit=0" in route:
                            require(json.load(res) == [], "REST empty projection")
                    break
                except OSError:
                    if attempt == 29:
                        raise RuntimeError("Local API unavailable: " + route) from None
                    time.sleep(1)
        print(f"{self.id}: {len(versions)} migrations; Auth/REST/Storage OK", flush=True)

    def stop(self, discard=False):
        require(not discard or self.test, "Development resources must be retained.")
        resources = self.verified()
        for service in reversed(self.services):
            ident = resources["containers"]["supabase_" + service + "_" + self.id]
            docker("container", "stop", ident)
        if discard:
            # Check all consumers again before removal. Immutable IDs cannot target a replacement.
            self.verified()
            for ident in resources["containers"].values():
                docker("container", "rm", ident)
            docker("network", "rm", resources["network"])
            # Docker volume rm takes only a reusable name. Never race inspect against a by-name removal.
            print("Retained named test volumes:", ", ".join(sorted(resources["volumes"])), flush=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        raise RuntimeError("Unexpected HTTP redirect")


def read_google_credentials():
    require(sys.stdin.isatty() and sys.stderr.isatty(), "Open an interactive local terminal for masked input.")
    credentials = {}
    for key, title in (("SVML_GOOGLE_CLIENT_ID", "Google Client ID"), ("SVML_GOOGLE_CLIENT_SECRET", "Google Client Secret")):
        value = getpass.getpass(title + " (hidden): ").strip()
        require(value and not any(ch.isspace() for ch in value), "Empty or invalid input")
        credentials[key] = value
    return credentials


def main(google_credentials=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["check", "prepare", "up", "serve", "stop"])
    parser.add_argument("--google", action="store_true", help="use the isolated local Google + test mailbox stack")
    args = parser.parse_args()
    if args.google and args.action not in ("serve", "stop"):
        parser.error("--google is supported with serve or stop")
    os.umask(0o077)
    preflight(cleanup=args.action == "stop")
    if args.action in ("check", "prepare"):
        execute(args)
        return
    from cloud_guard import Reservation, supervised
    args.credentials = {}
    if args.google and args.action == "serve" and not (STATE / GOOGLE_STACK).exists():
        args.credentials = google_credentials or read_google_credentials()
    sys.exit(supervised(lambda: execute(args), Reservation("dev")))


def execute(args):
    with (STATE / "dev.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == "check":
            disk_check()
            return
        if args.action == "stop":
            directory = STATE / (GOOGLE_STACK if args.google else "dev")
            if directory.exists():
                Stack(directory, google=args.google).stop()
            return
        prepare()
        if args.action == "prepare":
            return
        if args.action == "serve":
            check_ports(WEB)
        stack = Stack(STATE / (GOOGLE_STACK if args.google else "dev"), google=args.google)
        stack.env.update(args.credentials)
        stack.up()
        if args.action == "serve":
            env = {**local_env(), "NEXT_PUBLIC_SUPABASE_URL": f"http://{LOCAL}:{DEV_API}",
                   "NEXT_PUBLIC_SITE_URL": f"http://{LOCAL}:{WEB}", "NEXT_PUBLIC_SUPABASE_ANON_KEY": stack.anon}
            if args.google:
                env["SUPABASE_GOOGLE_AUTH_ENABLED"] = "true"
            server = subprocess.Popen([ROOT / "node_modules/.bin/next", "dev", "--hostname", LOCAL,
                                       "--port", str(WEB)], cwd=ROOT, env=env, start_new_session=True)
            stopping = False

            def terminate(signum, frame):
                nonlocal stopping
                stopping = True
                if server.poll() is None:
                    try:
                        os.killpg(server.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
            for sig in (signal.SIGTERM, signal.SIGINT):
                signal.signal(sig, terminate)
            try:
                code = server.wait()
                require(stopping or code == 0, f"Next.js exited with status {code}")
            finally:
                terminate(None, None)
                server.wait()


if __name__ == "__main__":
    main()
