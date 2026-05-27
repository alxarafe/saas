<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/health') {
    header('Content-Type: application/json');

    echo json_encode([
        'status' => 'ok'
    ]);

    exit;
}

http_response_code(404);

echo json_encode([
    'error' => ['code' => 'endpoint_not_found']
]);
