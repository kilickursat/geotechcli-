import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readText(...parts) {
  return readFileSync(join(root, ...parts), 'utf-8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const routeExpectations = [
  {
    path: ['packages', 'web', 'app', 'api', 'version', 'route.ts'],
    handlers: ['GET'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'proxy', 'route.ts'],
    handlers: ['GET', 'POST'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'auth', 'route.ts'],
    handlers: ['POST'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'usage', 'route.ts'],
    handlers: ['GET'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'checkout', 'route.ts'],
    handlers: ['POST'],
  },
  {
    path: ['packages', 'web', 'app', 'api', 'webhook', 'route.ts'],
    handlers: ['POST'],
  },
];

for (const route of routeExpectations) {
  const source = readText(...route.path);
  for (const handler of route.handlers) {
    assert(
      source.includes(`export async function ${handler}`),
      `${route.path.join('/')} is missing ${handler} handler export.`,
    );
  }
}

console.log('smoke-web-routes: OK');
