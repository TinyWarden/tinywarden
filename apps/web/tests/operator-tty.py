"""Exercise the local operator-init prompt with synthetic input over a real PTY."""

import os
from pathlib import Path
import pty
import select
import subprocess
import sys
import termios
import time


root = Path(__file__).resolve().parents[1]
secret = b"synthetic-cli-password-123"
master, slave = pty.openpty()
settings = termios.tcgetattr(slave)
settings[3] &= ~termios.ECHO
termios.tcsetattr(slave, termios.TCSANOW, settings)
process = subprocess.Popen(
    [str(root / "node_modules/.bin/tsx"), "scripts/operator.ts", "init"],
    cwd=root, stdin=slave, stdout=slave, stderr=slave,
    env=os.environ.copy(), start_new_session=True,
)
os.close(slave)
output = b""
deadline = time.monotonic() + 10

try:
    for prompt in (b"New administrator password:", b"Repeat password:"):
        while prompt not in output:
            if time.monotonic() > deadline:
                raise RuntimeError("prompt_timeout")
            if not select.select([master], [], [], 0.2)[0]:
                continue
            try:
                output += os.read(master, 4096)
            except OSError as error:
                raise RuntimeError("prompt_closed") from error
        os.write(master, secret + b"\n")
        output = output.replace(prompt, b"", 1)
    process.wait(timeout=10)
    while select.select([master], [], [], 0)[0]:
        try:
            output += os.read(master, 4096)
        except OSError:
            break
    if secret in output:
        raise RuntimeError("password_echoed")
    if process.returncode not in (0, 1):
        raise RuntimeError("unexpected_cli_exit")
    print("operator_tty_prompt_hidden")
finally:
    os.close(master)
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=5)
