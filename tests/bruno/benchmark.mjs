#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stacks = JSON.parse(readFileSync(join(__dirname, 'stacks.json'), 'utf-8'));

const ITERATIONS = parseInt(process.argv[2] || '5', 10);
const WARMUP = ITERATIONS > 1 ? 1 : 0;

function resolveUrl(tpl) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, name) => process.env[name] || '');
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function runBrunoTest(baseUrl) {
  const start = process.hrtime.bigint();
  let passed = false;
  let code;
  try {
    execSync(
      `bru run "${join(__dirname, 'tests')}" --env-var "base_url=${baseUrl}"`,
      { encoding: 'utf-8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    passed = true;
    code = 0;
  } catch (e) {
    code = e.status;
  }
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  return { elapsed, passed, code };
}

async function httpFetch(url) {
  const start = process.hrtime.bigint();
  let ok = false;
  let status = 0;
  let body = '';
  try {
    const res = await fetch(url);
    status = res.status;
    body = await res.text();
    ok = res.status === 200;
  } catch {
    ok = false;
  }
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  return { elapsed, ok, status, body };
}

console.log();
console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║   SaaS Multi-Stack Benchmark                                             ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝');
console.log(`  Fecha:       ${new Date().toISOString()}`);
console.log(`  Iteraciones: ${ITERATIONS}${WARMUP ? ' (1 warm-up + ' + (ITERATIONS - WARMUP) + ' medidas)' : ''}`);
console.log();

const results = [];

for (const s of stacks) {
  const baseUrl = resolveUrl(s.url);
  if (!baseUrl) {
    console.error(`  [${s.name}] SKIP — no se pudo resolver URL (${s.url})`);
    continue;
  }

  process.stdout.write(`  ${s.name.padEnd(8)} ${baseUrl}\n`);

  // ---- Bruno test timing ----
  const bTimings = [];
  let passedRuns = 0;
  let failedRuns = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const isWarmup = WARMUP && i === 0;
    const label = isWarmup ? 'warmup' : `${i + 1 - WARMUP}/${ITERATIONS - WARMUP}`;

    const r = runBrunoTest(baseUrl);
    if (!isWarmup) bTimings.push(r.elapsed);
    r.passed ? passedRuns++ : failedRuns++;
    const icon = r.passed ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
    process.stdout.write(`    ${icon} bruno ${label.padEnd(12)} ${r.elapsed.toFixed(2).padStart(10)} ms`);
    if (!r.passed) process.stdout.write(`  (exit ${r.code})`);
    process.stdout.write('\n');
  }

  // ---- Raw HTTP timing ----
  const hTimings = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const isWarmup = WARMUP && i === 0;
    const label = isWarmup ? 'warmup' : `${i + 1 - WARMUP}/${ITERATIONS - WARMUP}`;

    const r = await httpFetch(`${baseUrl}/health`);
    if (!isWarmup) hTimings.push(r.elapsed);
    const icon = r.ok ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m';
    process.stdout.write(`    ${icon} http  ${label.padEnd(12)} ${r.elapsed.toFixed(2).padStart(10)} ms`);
    if (!r.ok) process.stdout.write(`  (HTTP ${r.status})`);
    process.stdout.write('\n');
  }

  const bMeasured = bTimings;
  const bSorted = [...bMeasured].sort((a, b) => a - b);

  const hMeasured = hTimings;
  const hSorted = [...hMeasured].sort((a, b) => a - b);

  results.push({
    name: s.name,
    url: baseUrl,
    passedRuns,
    failedRuns,
    bruno: {
      avg: bMeasured.reduce((a, b) => a + b, 0) / bMeasured.length,
      min: bSorted[0],
      max: bSorted[bSorted.length - 1],
      p95: percentile(bSorted, 95),
      p99: percentile(bSorted, 99),
      timings: bMeasured,
    },
    http: {
      avg: hMeasured.reduce((a, b) => a + b, 0) / hMeasured.length,
      min: hSorted[0],
      max: hSorted[hSorted.length - 1],
      p95: percentile(hSorted, 95),
      p99: percentile(hSorted, 99),
      timings: hMeasured,
    },
  });
}

// ---- Print Bruno suite results ----
console.log();
console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║   Resultados — Test Suite (Bruno: incluye assertions)                    ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝');
console.log();
console.log('  ' + 'Stack'.padEnd(8) + 'Estado'.padEnd(10) + 'Promedio'.padStart(10) + 'Mínimo'.padStart(10) + 'Máximo'.padStart(10) + 'P95'.padStart(10) + 'P99'.padStart(10) + '  Tests');
console.log('  ' + '\u2500'.repeat(78));
for (const r of results) {
  const status = r.failedRuns === 0 ? '\x1b[32mPASA\x1b[0m' : '\x1b[31mFALLA\x1b[0m';
  const total = r.passedRuns + r.failedRuns;
  const b = r.bruno;
  console.log(
    `  ${r.name.padEnd(8)} ${status.padEnd(10)} ${b.avg.toFixed(2).padStart(10)} ms ${b.min.toFixed(2).padStart(10)} ms ${b.max.toFixed(2).padStart(10)} ms ${b.p95.toFixed(2).padStart(10)} ms ${b.p99.toFixed(2).padStart(10)} ms  ${r.passedRuns}/${total}`
  );
}

// ---- Print raw HTTP results ----
console.log();
console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║   Resultados — HTTP Directo (fetch, sin overhead de Bruno)               ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝');
console.log();
console.log('  ' + 'Stack'.padEnd(8) + 'Promedio'.padStart(10) + 'Mínimo'.padStart(10) + 'Máximo'.padStart(10) + 'P95'.padStart(10) + 'P99'.padStart(10));
console.log('  ' + '\u2500'.repeat(58));
for (const r of results) {
  const h = r.http;
  console.log(
    `  ${r.name.padEnd(8)} ${h.avg.toFixed(2).padStart(10)} ms ${h.min.toFixed(2).padStart(10)} ms ${h.max.toFixed(2).padStart(10)} ms ${h.p95.toFixed(2).padStart(10)} ms ${h.p99.toFixed(2).padStart(10)} ms`
  );
}

// ---- Ranking ----
console.log();
console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║   Ranking (HTTP directo — más rápido primero)                            ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝');
console.log();
const ranked = [...results].sort((a, b) => a.http.avg - b.http.avg);
ranked.forEach((r, i) => {
  const medal = i === 0 ? '\x1b[33m\u2605\x1b[0m' : ` ${i + 1}`;
  console.log(`    ${medal}  ${r.name.padEnd(10)} ${r.http.avg.toFixed(2).padStart(10)} ms promedio  (Bruno: ${r.bruno.avg.toFixed(2)} ms)`);
});

console.log();
