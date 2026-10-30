<?php
// Live air quality for every country, measured in its capital (data: Open-Meteo, no API key).
// The result is kept for 10 minutes in private/cache.json, so all visitors share one request.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const CACHE_FILE = __DIR__ . '/private/cache.json';
const CACHE_SECONDS = 600;
const API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const FIELDS = 'european_aqi,us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide';

function read_cache() {
    return is_file(CACHE_FILE) ? json_decode(file_get_contents(CACHE_FILE), true) : null;
}

function http_get($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_USERAGENT => 'Luchtglobe (parisangelopoulos.com)']);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $code === 200 ? $body : false;
    }
    $context = stream_context_create(['http' => ['timeout' => 20, 'header' => "User-Agent: Luchtglobe (parisangelopoulos.com)\r\n"]]);
    return @file_get_contents($url, false, $context);
}

// Ask Open-Meteo for all capitals, 50 at a time (several places per request)
function fetch_all() {
    $locations = json_decode(file_get_contents(__DIR__ . '/data/locations.json'), true);
    $countries = [];
    $time = null;
    foreach (array_chunk($locations, 50) as $chunk) {
        $url = API . '?' . http_build_query([
            'latitude' => implode(',', array_column($chunk, 'lat')),
            'longitude' => implode(',', array_column($chunk, 'lon')),
            'current' => FIELDS,
            'timezone' => 'GMT',
        ]);
        $body = http_get($url);
        if ($body === false) {
            return null;
        }
        $answer = json_decode($body, true);
        if (isset($answer['current'])) {
            $answer = [$answer];  // a single place comes back as one object instead of a list
        }
        foreach ($chunk as $i => $place) {
            $now = $answer[$i]['current'] ?? null;
            if (!$now) {
                continue;
            }
            $time = $now['time'] ?? $time;
            $countries[$place['iso3']] = [
                'aqi' => $now['european_aqi'] ?? null,
                'us_aqi' => $now['us_aqi'] ?? null,
                'pm2_5' => $now['pm2_5'] ?? null,
                'pm10' => $now['pm10'] ?? null,
                'no2' => $now['nitrogen_dioxide'] ?? null,
                'o3' => $now['ozone'] ?? null,
                'so2' => $now['sulphur_dioxide'] ?? null,
                'co' => $now['carbon_monoxide'] ?? null,
            ];
        }
    }
    return ['measured' => $time ? $time . 'Z' : null, 'fetched' => gmdate('Y-m-d\TH:i:s\Z'), 'countries' => $countries];
}

$cache = read_cache();
$fresh = $cache && isset($cache['fetched']) && time() - strtotime($cache['fetched']) < CACHE_SECONDS;

if (!$fresh) {
    // Only one visitor fetches new data at a time; the others get the cache meanwhile
    $lock = fopen(__DIR__ . '/private/cache.lock', 'c');
    if ($lock && flock($lock, LOCK_EX | LOCK_NB)) {
        $new = fetch_all();
        if ($new && $new['countries']) {
            file_put_contents(CACHE_FILE, json_encode($new), LOCK_EX);
            $cache = $new;
            $fresh = true;
        }
        flock($lock, LOCK_UN);
    }
}

if (!$cache) {
    http_response_code(503);
    echo json_encode(['error' => 'De luchtkwaliteit kon nu niet worden opgehaald. Probeer het zo opnieuw.']);
    exit;
}

$cache['stale'] = !$fresh;
$cache['next_update_in'] = max(30, CACHE_SECONDS - (time() - strtotime($cache['fetched'])));
echo json_encode($cache);
