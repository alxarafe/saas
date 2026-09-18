// =============================================================================
//  k6 — Mixed Workload (Fase 3)
//  Tráfico mixto realista por stack, según la hoja de ruta:
//    75 % lecturas (health / users / me), 15 % escrituras (users/bulk),
//    8 % auth (login), 2 % errores (404 / 401).
//  Se ejecuta UNA VEZ por stack (bin/k6.sh) para medirlos por separado.
//
//  Configuración vía variables de entorno:
//    TARGET_URL  base del stack a medir (http://php-api:3000, etc.)
//    STACK       etiqueta (php, python, kotlin, node, go)
//    VU          número de VUs      (default 10)
//    DURATION    duración del test  (default 30s)
//    THINK_TIME  pausa por iteración (default 0.5s)
//    AUTH_TOKEN  token estático para /me (default: uno generado de fábrica)
// =============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const STACK = __ENV.STACK || 'local';
const TARGET = __ENV.TARGET_URL || 'http://127.0.0.1:3000';
const VU = __ENV.VU ? parseInt(__ENV.VU, 10) : 10;
const DURATION = __ENV.DURATION || '30s';
const THINK_TIME = __ENV.THINK_TIME ? parseFloat(__ENV.THINK_TIME) : 0.5;
const AUTH_TOKEN =
  __ENV.AUTH_TOKEN ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSJ9.MTO9PoTY5azdFpJ7s4zTHpibadJdkQlHxqj5Lak5DWI';

export const options = {
  vus: VU,
  duration: DURATION,
  // Umbral estructural (errores de servidor/red), no de latencia: no aborta
  // la ejecución; sirve para detectar stacks degenerados en la comparativa.
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: false }],
  },
};

const reads = new Counter('scenario_reads_total');
const writes = new Counter('scenario_writes_total');
const auths = new Counter('scenario_auths_total');
const errors = new Counter('scenario_errors_total');

const readLatency = new Trend('read_latency', true);
const writeLatency = new Trend('write_latency', true);
const authLatency = new Trend('auth_latency', true);
const errorLatency = new Trend('error_latency', true);

const tags = (scenario, endpoint) => ({ stack: STACK, scenario, endpoint });

function safeJson(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

function randSuffix() {
  return `${Date.now()}-${__VU}-${(Math.random() * 1e9).toFixed(0)}`;
}

// ---- Lecturas (75 %) -------------------------------------------------------

function read() {
  const r = Math.random() * 100;
  let res;
  let endpoint;
  if (r < 40) {
    endpoint = 'health';
    res = http.get(`${TARGET}/health`, { tags: tags('read', endpoint) });
    const body = safeJson(res);
    check(res, { 'health 200 + status ok': (x) => x.status === 200 && body && body.status === 'ok' });
  } else if (r < 75) {
    endpoint = 'users';
    res = http.get(`${TARGET}/users?limit=20&offset=0`, { tags: tags('read', endpoint) });
    const body = safeJson(res);
    check(res, {
      'users 200': (x) => x.status === 200,
      'users data array': (x) => Array.isArray(body && body.data),
    });
  } else {
    endpoint = 'me';
    res = http.get(`${TARGET}/me`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      tags: tags('read', endpoint),
    });
    const body = safeJson(res);
    check(res, {
      'me 200': (x) => x.status === 200,
      'me id number': (x) => typeof (body && body.data && body.data.id) === 'number',
    });
  }
  readLatency.add(res.timings.duration, { endpoint });
}

// ---- Escrituras (15 %) -----------------------------------------------------

function write() {
  const suffix = randSuffix();
  const payload = JSON.stringify({
    data: [
      { email: `k6-${suffix}-a@example.com`, password_hash: 'k6-hash' },
      { email: `k6-${suffix}-b@example.com`, password_hash: 'k6-hash' },
    ],
  });
  const res = http.post(`${TARGET}/users/bulk`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: tags('write', 'users-bulk'),
  });
  const body = safeJson(res);
  check(res, {
    'bulk 201': (x) => x.status === 201,
    'bulk data 2 users': (x) => Array.isArray(body && body.data) && body.data.length === 2,
  });
  writeLatency.add(res.timings.duration);
}

// ---- Auth (8 %) ------------------------------------------------------------

function authFlow() {
  const res = http.post(
    `${TARGET}/auth/login`,
    JSON.stringify({ email: 'admin@example.com', password: 'secret' }),
    { headers: { 'Content-Type': 'application/json' }, tags: tags('auth', 'login') }
  );
  const body = safeJson(res);
  check(res, {
    'login 200': (x) => x.status === 200,
    'login token': (x) => typeof (body && body.data && body.data.token) === 'string',
  });
  authLatency.add(res.timings.duration);
}

// ---- Errores (2 %) ---------------------------------------------------------

function sendError() {
  let res;
  let endpoint;
  if (Math.random() * 100 < 50) {
    endpoint = 'not-found';
    res = http.get(`${TARGET}/not-found`, { tags: tags('error', endpoint) });
    check(res, { 'not-found 404': (x) => x.status === 404 });
  } else {
    endpoint = 'me-no-auth';
    res = http.get(`${TARGET}/me`, { tags: tags('error', endpoint) });
    check(res, { 'me sin token 401': (x) => x.status === 401 });
  }
  errorLatency.add(res.timings.duration, { endpoint });
}

// ---- Distribución ponderada ------------------------------------------------

export default function () {
  const r = Math.random() * 100;
  if (r < 75) {
    reads.add(1);
    read();
  } else if (r < 90) {
    writes.add(1);
    write();
  } else if (r < 98) {
    auths.add(1);
    authFlow();
  } else {
    errors.add(1);
    sendError();
  }
  sleep(THINK_TIME);
}