#!/usr/bin/env python3
"""Drive an interactive command through a real pseudo-terminal.

Usage: pty-drive.py <transcript-file> -- <cmd> [args...] ::: <expect-regex> <send> [...]

Waits for each regex in the output that arrived after the previous answer, then
types <send>. Escapes are allowed (\\r is Enter). "env:NAME+\\r" types the value of
$NAME and then Enter, so secrets never appear in argv. Writes the transcript with ANSI codes
stripped and exits with the command's exit code, or 124 if a prompt never appears.
The terminal is 120x40 unless PTY_COLS / PTY_ROWS say otherwise.
"""
import fcntl
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time

argv = sys.argv[1:]
transcript_path = argv[0]
sep = argv.index(':::')
cmd = argv[argv.index('--') + 1:sep]
steps = argv[sep + 1:]
def answer_text(raw):
    if raw.startswith('env:'):
        name, _, rest = raw[4:].partition('+')
        return os.environ[name] + rest.encode().decode('unicode_escape')
    return raw.encode().decode('unicode_escape')


pairs = [(steps[i], answer_text(steps[i + 1])) for i in range(0, len(steps), 2)]
ANSI = re.compile(rb'\x1b\[[0-9;?]*[A-Za-z]')

pid, fd = pty.fork()
if pid == 0:
    os.environ['TERM'] = 'xterm'
    os.execvp(cmd[0], cmd)
# Window size like a real terminal; PTY_COLS=0 reproduces terminals that report no width.
rows, cols = int(os.environ.get('PTY_ROWS', 40)), int(os.environ.get('PTY_COLS', 120))
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))

buf = b''


def read_some(timeout):
    """Append available output to buf. False on timeout, None at EOF."""
    global buf
    ready, _, _ = select.select([fd], [], [], timeout)
    if not ready:
        return False
    try:
        chunk = os.read(fd, 4096)
    except OSError:
        return None
    if not chunk:
        return None
    buf += chunk
    return True


def save():
    with open(transcript_path, 'wb') as fh:
        fh.write(ANSI.sub(b'', buf[-2_000_000:]))


signal.signal(signal.SIGTERM, lambda *_: (save(), os.kill(pid, 9), sys.exit(124)))

pos = 0
for pattern, answer in pairs:
    deadline = time.time() + 60
    while not re.search(pattern.encode(), ANSI.sub(b'', buf[max(pos, len(buf) - 65536):])):
        if time.time() > deadline or read_some(1) is None:
            save()
            sys.stderr.write(f'pty-drive.py: prompt not seen: {pattern}\n')
            os.kill(pid, 9)
            sys.exit(124)
    time.sleep(0.2)
    os.write(fd, answer.encode())
    pos = len(buf)

while read_some(30):
    pass
_, wait_status = os.waitpid(pid, 0)
save()
sys.exit(os.waitstatus_to_exitcode(wait_status))
