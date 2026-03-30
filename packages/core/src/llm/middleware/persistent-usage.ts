// ---------------------------------------------------------------------------
// Persistent CLI Usage Store — file-backed, survives process restarts
//
// Stores counters in ~/.geotechcli/usage.json so the unregistered 5-call
// limit and monthly quotas are enforced across CLI sessions.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import type { UsageRecord, UsageStore } from './metering.js';

const CONFIG_DIR = process.env.GEOTECHCLI_CONFIG_DIR ?? join(homedir(), '.geotechcli');
const USAGE_FILE = join(CONFIG_DIR, 'usage.json');

interface PersistedData {
  records: Record<string, UsageRecord>;
  version: number;
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    if (platform() !== 'win32') {
      try { chmodSync(CONFIG_DIR, 0o700); } catch { /* best effort */ }
    }
  }
}

function loadData(): PersistedData {
  ensureDir();
  if (!existsSync(USAGE_FILE)) {
    return { records: {}, version: 1 };
  }
  try {
    const raw = readFileSync(USAGE_FILE, 'utf-8');
    const data = JSON.parse(raw) as PersistedData;
    return data;
  } catch {
    return { records: {}, version: 1 };
  }
}

function saveData(data: PersistedData): void {
  ensureDir();
  try {
    writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    if (platform() !== 'win32') {
      try { chmodSync(USAGE_FILE, 0o600); } catch { /* best effort */ }
    }
  } catch {
    // Silently fail — CLI should not crash on usage persistence failure
  }
}

function isExpired(record: UsageRecord): boolean {
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - record.periodStart > monthMs;
}

// ---------------------------------------------------------------------------
// FileUsageStore — implements UsageStore interface
// ---------------------------------------------------------------------------

export class FileUsageStore implements UsageStore {
  async get(identifier: string): Promise<UsageRecord | null> {
    const data = loadData();
    const record = data.records[identifier] ?? null;
    if (!record) return null;

    // Reset if period expired
    if (isExpired(record)) {
      record.llmCalls = 0;
      record.visionCalls = 0;
      record.agentCalls = 0;
      record.periodStart = Date.now();
      data.records[identifier] = record;
      saveData(data);
    }

    return record;
  }

  async set(identifier: string, record: UsageRecord): Promise<void> {
    const data = loadData();
    data.records[identifier] = record;
    saveData(data);
  }

  async increment(
    identifier: string,
    field: 'llmCalls' | 'visionCalls' | 'agentCalls',
  ): Promise<UsageRecord> {
    const data = loadData();
    let record = data.records[identifier];

    if (!record) {
      record = {
        identifier,
        tier: 'free',
        llmCalls: 0,
        visionCalls: 0,
        agentCalls: 0,
        periodStart: Date.now(),
        lastCallTimestamp: Date.now(),
      };
    }

    if (isExpired(record)) {
      record.llmCalls = 0;
      record.visionCalls = 0;
      record.agentCalls = 0;
      record.periodStart = Date.now();
    }

    record[field] += 1;
    record.lastCallTimestamp = Date.now();
    data.records[identifier] = record;
    saveData(data);

    return record;
  }
}
