#!/usr/bin/env node
import { runCli } from './cli.js';

runCli()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
