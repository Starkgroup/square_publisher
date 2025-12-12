#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3025',
    token: process.env.INGEST_TOKEN || '',
    delayMs: process.env.DELAY_MS ? Number(process.env.DELAY_MS) : 0,
    continueOnError: process.env.CONTINUE_ON_ERROR === 'true',
    dryRun: process.env.DRY_RUN === 'true',
    files: [],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--base-url') {
      opts.baseUrl = argv[i + 1] || opts.baseUrl;
      i += 1;
      continue;
    }

    if (arg === '--token') {
      opts.token = argv[i + 1] || opts.token;
      i += 1;
      continue;
    }

    if (arg === '--delay-ms') {
      const v = argv[i + 1];
      opts.delayMs = v ? Number(v) : opts.delayMs;
      i += 1;
      continue;
    }

    if (arg === '--continue-on-error') {
      opts.continueOnError = true;
      continue;
    }

    if (arg === '--stop-on-error') {
      opts.continueOnError = false;
      continue;
    }

    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }

    if (arg === '--no-dry-run') {
      opts.dryRun = false;
      continue;
    }

    opts.files.push(arg);
  }

  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson({ url, token, payload }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const transport = isHttps ? https : http;

    const body = JSON.stringify(payload);

    const req = transport.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(body),
          authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          const contentType = String(res.headers['content-type'] || '');

          let parsed = null;
          if (contentType.includes('application/json') && raw.length > 0) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = null;
            }
          }

          const ok = statusCode >= 200 && statusCode < 300;
          if (!ok) {
            const err = new Error(`HTTP ${statusCode}`);
            err.statusCode = statusCode;
            err.responseText = raw;
            err.responseJson = parsed;
            return reject(err);
          }

          return resolve({ statusCode, bodyText: raw, bodyJson: parsed });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    const e = new Error(`Invalid JSON in file: ${filePath}`);
    e.cause = err;
    throw e;
  }
}

async function main() {
  const opts = parseArgs(process.argv);

  const defaultFiles = [
    path.resolve(__dirname, '../payload_alex.json'),
    path.resolve(__dirname, '../payload_jil.json'),
    path.resolve(__dirname, '../payload_oliver.json'),
    path.resolve(__dirname, '../payload_tim.json'),
  ];

  const files = opts.files.length > 0
    ? opts.files.map((p) => path.resolve(process.cwd(), p))
    : defaultFiles;

  if (!opts.baseUrl) {
    console.error('Missing BASE_URL (env) or --base-url');
    process.exitCode = 1;
    return;
  }

  if (!opts.token && !opts.dryRun) {
    console.error('Missing INGEST_TOKEN (env) or --token');
    process.exitCode = 1;
    return;
  }

  const endpoint = new URL('/ingest/text', opts.baseUrl).toString();

  console.log(`Base URL: ${opts.baseUrl}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Files: ${files.map((f) => path.basename(f)).join(', ')}`);
  console.log(`Dry run: ${opts.dryRun ? 'true' : 'false'}`);
  console.log(`Continue on error: ${opts.continueOnError ? 'true' : 'false'}`);
  console.log(`Delay (ms): ${opts.delayMs}`);

  let successCount = 0;
  let failCount = 0;

  for (let idx = 0; idx < files.length; idx += 1) {
    const filePath = files[idx];
    const name = path.basename(filePath);

    try {
      const payload = await loadJson(filePath);

      if (opts.dryRun) {
        console.log(`[${idx + 1}/${files.length}] ${name}: OK (dry-run)`);
        successCount += 1;
      } else {
        const res = await requestJson({ url: endpoint, token: opts.token, payload });
        const id = res.bodyJson && typeof res.bodyJson === 'object' ? res.bodyJson.id : null;
        console.log(`[${idx + 1}/${files.length}] ${name}: OK (status=${res.statusCode}${id ? `, id=${id}` : ''})`);
        successCount += 1;
      }

      if (opts.delayMs > 0 && idx < files.length - 1) {
        await sleep(opts.delayMs);
      }
    } catch (err) {
      failCount += 1;
      const status = err && typeof err === 'object' && 'statusCode' in err ? ` status=${err.statusCode}` : '';
      console.error(`[${idx + 1}/${files.length}] ${name}: FAILED${status}`);

      if (err && typeof err === 'object') {
        if (err.responseJson) {
          console.error(JSON.stringify(err.responseJson, null, 2));
        } else if (err.responseText) {
          console.error(String(err.responseText).slice(0, 2000));
        } else if (err.message) {
          console.error(err.message);
        }
      }

      if (!opts.continueOnError) {
        process.exitCode = 1;
        break;
      }
    }
  }

  console.log(`Done. Success: ${successCount}. Failed: ${failCount}.`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

await main();
