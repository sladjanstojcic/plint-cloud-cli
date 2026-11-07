export function captureStdout() {
  const chunks = [];
  return {
    stream: {
      write: (chunk) => {
        chunks.push(String(chunk));
        return true;
      }
    },
    get output() {
      return chunks.join('');
    }
  };
}

export function silenceStderr() {
  const writes = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  return {
    writes,
    restore: () => {
      process.stderr.write = original;
    }
  };
}
