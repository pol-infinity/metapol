/**
 * MetaPOL — Shared RPC Helpers
 * Loaded before dashboard.js and premium-addons.js so all pages
 * can use these without duplication.
 *
 * Exports (globals):
 *   fetchEventChunk      — single chunk with retry + binary-split fallback
 *   mapWithConcurrency   — concurrency-limited async mapper
 *   queryFilterChunked   — parallel chunked event scan
 *   retryCall            — generic retry wrapper for any RPC call
 *   getAllRegUserEvents   — cached full RegUser scan (shared by team/leaderboard/tree)
 */

const EVT_CHUNK_SIZE     = 5000; // bigger chunks = fewer round trips
const EVT_CHUNK_PARALLEL = 6;    // parallel chunk fetches
const EVT_MAX_RETRIES    = 3;

async function fetchEventChunk(contract, filter, from, to, attempt = 1) {
    try {
        return await contract.queryFilter(filter, from, to);
    } catch (e) {
        if (attempt >= EVT_MAX_RETRIES) {
            if (to > from) {
                const mid = Math.floor((from + to) / 2);
                const [a, b] = await Promise.all([
                    fetchEventChunk(contract, filter, from, mid, attempt),
                    fetchEventChunk(contract, filter, mid + 1, to, attempt)
                ]);
                return [...a, ...b];
            }
            console.error(`Chunk ${from}-${to} failed after ${attempt} attempts:`, e);
            return [];
        }
        await new Promise(r => setTimeout(r, 300 * attempt));
        return fetchEventChunk(contract, filter, from, to, attempt + 1);
    }
}

async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let idx = 0;
    async function worker() {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

async function queryFilterChunked(contract, filter, fromBlock, toBlock) {
    const ranges = [];
    let from = fromBlock;
    while (from <= toBlock) {
        const to = Math.min(from + EVT_CHUNK_SIZE - 1, toBlock);
        ranges.push([from, to]);
        from = to + 1;
    }
    const chunks = await mapWithConcurrency(
        ranges, EVT_CHUNK_PARALLEL,
        ([f, t]) => fetchEventChunk(contract, filter, f, t)
    );
    return chunks.flat();
}

async function retryCall(fn, attempts = 3, label = 'call') {
    let lastErr;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (i < attempts) await new Promise(r => setTimeout(r, 350 * i));
        }
    }
    throw lastErr;
}

// Shared cache for ALL RegUser events ever — scanned once, reused by the
// leaderboard, network tree, and team tab so they never double-scan.
let _regEventsCache     = null;
let _regEventsCacheTime = 0;
const REG_EVENTS_TTL = 5 * 60 * 1000;

async function getAllRegUserEvents(contract, deployBlock, latestBlock, forceRefresh) {
    const now = Date.now();
    if (!forceRefresh && _regEventsCache && (now - _regEventsCacheTime) < REG_EVENTS_TTL) {
        return _regEventsCache;
    }
    const events = await queryFilterChunked(contract, contract.filters.RegUser(), deployBlock, latestBlock);
    _regEventsCache     = events;
    _regEventsCacheTime = Date.now();
    return events;
}
