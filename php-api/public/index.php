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

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/health' && $method === 'GET') {
    json_response(200, ['status' => 'ok']);
}

if ($path === '/auth/login' && $method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);

    if (
        ($body['email'] ?? null) !== 'admin@example.com' ||
        ($body['password'] ?? null) !== 'secret'
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
