<?php

const MAX_MEMBERS     = 20;
const MAX_FILE_BYTES  = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const STORAGE_ROOT    = '/var/www/storage';

function extract_archive(string $zipPath): array {
    $za = new ZipArchive();
    if ($za->open($zipPath) !== true) {
        return ['status' => 'failed', 'stage' => 'open_archive', 'error' => 'invalid_archive', 'files' => []];
    }
    if ($za->numFiles > MAX_MEMBERS) {
        $za->close();
        return ['status' => 'failed', 'stage' => 'scan', 'error' => 'too_many_members', 'files' => []];
    }

    $id      = bin2hex(random_bytes(3));
    $workdir = STORAGE_ROOT . '/' . $id;
    @mkdir($workdir, 0775, true);

    $report = [];
    $total  = 0;

    for ($i = 0; $i < $za->numFiles; $i++) {
        $st   = $za->statIndex($i);
        $name = $st['name'];

        if (substr($name, -1) === '/') {
            @mkdir($workdir . '/' . $name, 0775, true);
            continue;
        }

        if ($name === '' || $name[0] === '/' || strpos($name, "\0") !== false) {
            $report[] = ['entry' => $name, 'stored_as' => null, 'status' => 'rejected', 'reason' => 'unsupported_entry_type'];
            continue;
        }

        if ($st['size'] > MAX_FILE_BYTES) {
            $report[] = ['entry' => $name, 'stored_as' => null, 'status' => 'rejected', 'reason' => 'too_large'];
            continue;
        }

        $data = $za->getFromIndex($i, MAX_FILE_BYTES + 1);
        if ($data === false) {
            $report[] = ['entry' => $name, 'stored_as' => null, 'status' => 'rejected', 'reason' => 'read_error'];
            continue;
        }

        $total += strlen($data);
        if ($total > MAX_TOTAL_BYTES) {
            $report[] = ['entry' => $name, 'stored_as' => null, 'status' => 'rejected', 'reason' => 'quota_exceeded'];
            break;
        }

        $dest = $workdir . '/' . $name;
        @mkdir(dirname($dest), 0775, true);
        file_put_contents($dest, $data);
        $report[] = ['entry' => $name, 'stored_as' => $dest, 'size' => strlen($data), 'status' => 'written'];
    }

    $za->close();

    $written = array_filter($report, static fn($r) => $r['status'] === 'written');
    if (count($written) === count($report)) {
        $status = 'completed';
    } elseif (count($written) > 0) {
        $status = 'partial';
    } else {
        $status = 'failed';
    }

    return ['id' => $id, 'status' => $status, 'workspace' => $workdir, 'files' => $report];
}
