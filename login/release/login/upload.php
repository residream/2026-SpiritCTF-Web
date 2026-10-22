<?php
require '/var/www/lib/archive.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !isset($_FILES['archive'])) {
    http_response_code(400);
    echo json_encode(['status' => 'failed', 'error' => 'archive is required']);
    exit;
}

if (($_FILES['archive']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['status' => 'failed', 'error' => 'upload_error']);
    exit;
}

if ($_FILES['archive']['size'] > 1 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['status' => 'failed', 'error' => 'invalid_archive']);
    exit;
}

$result = extract_archive($_FILES['archive']['tmp_name']);
echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
