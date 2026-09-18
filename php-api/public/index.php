<?php

function base64url_encode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function jwt_encode(array $payload, string $secret): string {
    $header = base64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payloadEncoded = base64url_encode(json_encode($payload));
    $signature = base64url_encode(
        hash_hmac('sha256', "$header.$payloadEncoded", $secret, true)
    );
    return "$header.$payloadEncoded.$signature";
}

function jwt_decode(string $token, string $secret): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;

    $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
    if ($payload === null) return null;

    $expected = base64url_encode(
        hash_hmac('sha256', "$parts[0].$parts[1]", $secret, true)
    );
    if (!hash_equals($expected, $parts[2])) return null;

    return $payload;
}

function json_response(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function read_json_body(): ?array {
    $raw = file_get_contents('php://input');
    if (trim($raw) === '') return null;
    $body = json_decode($raw, true);
    return is_array($body) ? $body : null;
}

function db() {
    static $pdo = null;
    if ($pdo === null) {
        $host = getenv('DB_HOST') ?: 'postgres';
        $port = getenv('DB_PORT') ?: '5432';
        $user = getenv('DB_USER') ?: 'saas';
        $pass = getenv('DB_PASSWORD') ?: 'saas';
        $name = getenv('DB_NAME') ?: 'saas';
        $pdo = new PDO(
            "pgsql:host=$host;port=$port;dbname=$name",
            $user,
            $pass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )'
        );
    }
    return $pdo;
}

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/health' && $method === 'GET') {
    json_response(200, ['status' => 'ok']);
}

if ($path === '/users/bulk' && $method === 'POST') {
    $body = read_json_body();
    if ($body === null) {
        json_response(400, ['error' => ['code' => 'bad_request']]);
    }

    if (!array_key_exists('data', $body) || !is_array($body['data']) || !array_is_list($body['data'])) {
        json_response(422, [
            'error' => ['code' => 'validation_error', 'details' => [['field' => 'data', 'code' => 'invalid_type']]],
        ]);
    }

    $details = [];
    $users = [];
    foreach ($body['data'] as $i => $item) {
        if (!is_array($item)) {
            $details[] = ['field' => "data[$i]", 'code' => 'invalid_type'];
            continue;
        }
        foreach (['email', 'password_hash'] as $field) {
            $value = $item[$field] ?? null;
            if ($value === null || $value === '') {
                $details[] = ['field' => "data[$i].$field", 'code' => 'required'];
            } elseif (!is_string($value)) {
                $details[] = ['field' => "data[$i].$field", 'code' => 'invalid_type'];
            }
        }
        $users[] = $item;
    }
    if ($details) {
        json_response(422, ['error' => ['code' => 'validation_error', 'details' => $details]]);
    }
    if (!$users) {
        json_response(422, ['error' => ['code' => 'validation_error', 'details' => [['field' => 'data', 'code' => 'required']]]]);
    }

    try {
        $pdo = db();
        $pdo->beginTransaction();
        $created = [];
        $stmt = $pdo->prepare(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)
             RETURNING id, email, created_at'
        );
        foreach ($users as $u) {
            $stmt->execute([$u['email'], $u['password_hash']]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $created[] = [
                'id' => (int) $row['id'],
                'email' => $row['email'],
                'created_at' => gmdate(DATE_ATOM, strtotime($row['created_at'])),
            ];
        }
        $pdo->commit();
        json_response(201, ['data' => $created]);
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($e->getCode() === '23505') {
            json_response(409, ['error' => ['code' => 'conflict']]);
        }
        json_response(500, ['error' => ['code' => 'internal_error']]);
    }
}

if ($path === '/users' && $method === 'GET') {
    $limit = isset($_GET['limit']) ? (int) $_GET['limit'] : 20;
    $offset = isset($_GET['offset']) ? (int) $_GET['offset'] : 0;
    if ($limit < 1 || $limit > 100) {
        json_response(422, [
            'error' => ['code' => 'validation_error', 'details' => [['field' => 'limit', 'code' => 'invalid_type']]],
        ]);
    }
    if ($offset < 0) {
        json_response(422, [
            'error' => ['code' => 'validation_error', 'details' => [['field' => 'offset', 'code' => 'invalid_type']]],
        ]);
    }

    try {
        $pdo = db();
        $total = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $stmt = $pdo->prepare(
            'SELECT id, email, created_at FROM users
             ORDER BY id LIMIT ? OFFSET ?'
        );
        $stmt->execute([$limit, $offset]);
        $rows = array_map(fn ($r) => [
            'id' => (int) $r['id'],
            'email' => $r['email'],
            'created_at' => gmdate(DATE_ATOM, strtotime($r['created_at'])),
        ], $stmt->fetchAll(PDO::FETCH_ASSOC));
        json_response(200, [
            'data' => $rows,
            'pagination' => ['limit' => $limit, 'offset' => $offset, 'total' => $total],
        ]);
    } catch (PDOException $e) {
        json_response(500, ['error' => ['code' => 'internal_error']]);
    }
}

if ($path === '/auth/login' && $method === 'POST') {
    $body = read_json_body();
    if ($body === null) {
        json_response(400, ['error' => ['code' => 'bad_request']]);
    }

    $details = [];
    foreach (['email', 'password'] as $field) {
        if (!array_key_exists($field, $body) || $body[$field] === null || $body[$field] === '') {
            $details[] = ['field' => $field, 'code' => 'required'];
        } elseif (!is_string($body[$field])) {
            $details[] = ['field' => $field, 'code' => 'invalid_type'];
        }
    }
    if ($details) {
        json_response(422, ['error' => ['code' => 'validation_error', 'details' => $details]]);
    }

    if (
        $body['email'] !== 'admin@example.com' ||
        $body['password'] !== 'secret'
    ) {
        json_response(401, ['error' => ['code' => 'invalid_credentials']]);
    }

    $token = jwt_encode([
        'sub' => '1',
        'email' => 'admin@example.com',
    ], 'secret');

    json_response(200, ['data' => ['token' => $token]]);
}

if ($path === '/me' && $method === 'GET') {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if ($auth === '' || !str_starts_with($auth, 'Bearer ')) {
        json_response(401, ['error' => ['code' => 'missing_token']]);
    }

    $token = substr($auth, 7);
    $payload = jwt_decode($token, 'secret');

    if ($payload === null) {
        json_response(401, ['error' => ['code' => 'invalid_token']]);
    }

    json_response(200, [
        'data' => [
            'id' => (int) $payload['sub'],
            'email' => $payload['email'],
        ],
    ]);
}

json_response(404, ['error' => ['code' => 'endpoint_not_found']]);
