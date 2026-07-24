const { cpSync, mkdirSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const source = resolve(__dirname, '../src/generated/client');
const destination = resolve(__dirname, '../dist/generated/client');
const publicSource = resolve(__dirname, '../public');
const publicDestination = resolve(__dirname, '../dist/public');

rmSync(destination, { recursive: true, force: true });
mkdirSync(resolve(destination, '..'), { recursive: true });
cpSync(source, destination, { recursive: true });
rmSync(publicDestination, { recursive: true, force: true });
cpSync(publicSource, publicDestination, { recursive: true });
