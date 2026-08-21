<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use ZipArchive;

final class MedicineSpreadsheetReader
{
    /** @return array{headers: array<int, string>, rows: array<int, array<int, string|null>>} */
    public function read(UploadedFile $file): array
    {
        return strtolower($file->getClientOriginalExtension()) === 'xlsx'
            ? $this->readXlsx($file->getRealPath())
            : $this->readCsv($file->getRealPath());
    }

    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'rb');
        if (! $handle) throw ValidationException::withMessages(['file' => 'The uploaded catalog could not be read.']);
        $headers = array_map(fn ($value) => trim((string) $value), fgetcsv($handle) ?: []);
        $rows = [];
        $line = 1;
        while (($values = fgetcsv($handle)) !== false) $rows[++$line] = array_map(fn ($value) => $value === null ? null : trim((string) $value), $values);
        fclose($handle);
        return ['headers' => $headers, 'rows' => $rows];
    }

    private function readXlsx(string $path): array
    {
        $zip = new ZipArchive();
        if ($zip->open($path) !== true) throw ValidationException::withMessages(['file' => 'The Excel workbook is invalid or unreadable.']);
        try {
            $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
            if ($sheetXml === false || strlen($sheetXml) > 15 * 1024 * 1024) throw ValidationException::withMessages(['file' => 'The first Excel worksheet is missing or too large.']);
            $sharedStrings = $this->sharedStrings($zip);
            $xml = simplexml_load_string($sheetXml, \SimpleXMLElement::class, LIBXML_NONET | LIBXML_COMPACT);
            if ($xml === false) throw ValidationException::withMessages(['file' => 'The first Excel worksheet contains invalid XML.']);
            $namespaces = $xml->getNamespaces(true);
            $sheet = isset($namespaces['']) ? $xml->children($namespaces['']) : $xml;
            $matrix = [];
            foreach ($sheet->sheetData->row as $row) {
                $line = (int) ($row['r'] ?? count($matrix) + 1);
                $cells = [];
                foreach ($row->c as $cell) {
                    $attributes = $cell->attributes();
                    $reference = (string) $attributes['r'];
                    preg_match('/^[A-Z]+/i', $reference, $matches);
                    $column = $this->columnIndex(strtoupper($matches[0] ?? 'A'));
                    $type = (string) $attributes['t'];
                    $value = $type === 'inlineStr'
                        ? $this->xmlText($cell->is)
                        : (string) ($cell->v ?? '');
                    if ($type === 's') $value = $sharedStrings[(int) $value] ?? '';
                    $cells[$column] = trim($value);
                }
                if ($cells === []) continue;
                $width = max(array_keys($cells)) + 1;
                $matrix[$line] = array_replace(array_fill(0, $width, null), $cells);
            }
            if ($matrix === []) return ['headers' => [], 'rows' => []];
            $headerLine = array_key_first($matrix);
            $headers = array_map(fn ($value) => trim((string) $value), $matrix[$headerLine]);
            unset($matrix[$headerLine]);
            return ['headers' => $headers, 'rows' => $matrix];
        } finally {
            $zip->close();
        }
    }

    /** @return array<int, string> */
    private function sharedStrings(ZipArchive $zip): array
    {
        $contents = $zip->getFromName('xl/sharedStrings.xml');
        if ($contents === false) return [];
        if (strlen($contents) > 15 * 1024 * 1024) throw ValidationException::withMessages(['file' => 'The Excel shared-string table is too large.']);
        $xml = simplexml_load_string($contents, \SimpleXMLElement::class, LIBXML_NONET | LIBXML_COMPACT);
        if ($xml === false) return [];
        $namespace = $xml->getNamespaces(true)[''] ?? null;
        $root = $namespace ? $xml->children($namespace) : $xml;
        $values = [];
        foreach ($root->si as $item) $values[] = $this->xmlText($item);
        return $values;
    }

    private function xmlText(\SimpleXMLElement $node): string
    {
        $parts = $node->xpath('.//*[local-name()="t"]') ?: [];
        if ($parts === []) return trim((string) $node);
        return implode('', array_map(fn (\SimpleXMLElement $part) => (string) $part, $parts));
    }

    private function columnIndex(string $letters): int
    {
        $index = 0;
        foreach (str_split($letters) as $letter) $index = ($index * 26) + (ord($letter) - 64);
        return max(0, $index - 1);
    }
}
