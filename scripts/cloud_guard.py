"""Linux process-tree supervision and a reservation shared by one Docker daemon."""
import ctypes
import os
import re
import signal
import subprocess
import sys

from cloud_local import docker, require


def subreaper():
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), "Cannot supervise descendants")


def drain_children():
    """After the direct child exits, Linux reparents its living descendants here."""
    while True:
        try:
            os.waitpid(-1, 0)
        except ChildProcessError:
            return


class Reservation:
    def __init__(self, scope):
        self.name = "svml-e03-" + scope + "-reservation"

    def acquire(self):
        # Docker atomically reserves container names, also across client PID/mount namespaces.
        # The carrier stays in Created state; it has no command, network or data to run.
        try:
            ident = docker("create", "--name", self.name, "--network", "none", "--entrypoint",
                           "/bin/true", "kong:2.8.1")
        except subprocess.CalledProcessError:
            raise RuntimeError("Cannot reserve " + self.name + "; check active or interrupted runs.") from None
        require(re.fullmatch("[0-9a-f]{64}", ident), "Unknown reservation ID; retained.")
        return ident

    def release(self, ident):
        require(docker("container", "inspect", "-f", "{{.Name}} {{.State.Status}}", ident)
                == "/" + self.name + " created", "Reservation changed; retained.")
        docker("container", "rm", ident)


def supervised(action, reservation):
    """The detached supervisor outlives a killed frontend. Losing the supervisor leaves the reservation."""
    guardian = os.fork()
    if guardian == 0:
        try:
            os.setsid()
            subreaper()
            ident = reservation.acquire()
            worker = os.fork()
            if worker == 0:
                try:
                    subreaper()
                    action()
                except BaseException as exc:
                    print(str(exc) or type(exc).__name__, file=sys.stderr, flush=True)
                    os._exit(1)
                os._exit(0)
            worker_fd = os.pidfd_open(worker)
            def interrupt(signum, frame):
                try:
                    signal.pidfd_send_signal(worker_fd, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            signal.signal(signal.SIGTERM, interrupt)
            _, status = os.waitpid(worker, 0)
            os.close(worker_fd)
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            drain_children()
            reservation.release(ident)
            os._exit(0 if status == 0 else 1)
        except BaseException as exc:
            print(str(exc) or type(exc).__name__, file=sys.stderr, flush=True)
            os._exit(1)
    guardian_fd = os.pidfd_open(guardian)
    def forward(signum, frame):
        try:
            signal.pidfd_send_signal(guardian_fd, signal.SIGTERM)
        except ProcessLookupError:
            pass
    signal.signal(signal.SIGINT, forward)
    signal.signal(signal.SIGTERM, forward)
    return os.waitstatus_to_exitcode(os.waitpid(guardian, 0)[1])
