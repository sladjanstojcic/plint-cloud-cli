import ora from 'ora';

export const spinner = (text) => ora(text).start();

export function success(text) {
  ora().succeed(text);
}

export function warn(text) {
  ora().warn(text);
}

export function fail(text) {
  ora().fail(text);
}

export function printUrl(url) {
  console.log(`\n  -> ${url}\n`);
}
