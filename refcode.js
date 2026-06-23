/**
 * MetaPOL Referral Code System
 * ─────────────────────────────────────────────────────────────
 * Converts sequential contract User IDs ↔ random-looking 6-digit
 * Public Member Codes. Fully deterministic, no backend required.
 *
 * Algorithm:
 *   1. Map contractId → a position in a pre-shuffled table
 *   2. Return a 6-digit code that looks random but is reversible
 *
 * Security: codes look random to users but are mathematically
 * linked to real IDs only via this private seed table.
 */

(function (window) {

    // ── Secret permutation seed (change only before first user) ──
    // This creates a deterministic but non-obvious mapping
    const SEED = 0x4D455441; // "META" in hex

    // Max users we support (contract will never reach 1M realistically)
    const MAX_USERS = 999999;

    /**
     * Simple Feistel-network cipher over 20-bit space
     * Gives a bijective mapping: every input → unique output
     * Fully reversible (encrypt == decrypt with swapped halves)
     */
    function _feistel(x, rounds, encrypt) {
        // Work in 0..MAX_USERS range
        // Split x into two 10-bit halves
        let L = (x >> 10) & 0x3FF;
        let R = x & 0x3FF;

        const round_keys = [
            0x1A3, 0x27F, 0x3C1, 0x0B5,
            0x2E9, 0x14D, 0x38B, 0x0F7
        ];

        if (!encrypt) round_keys.reverse();

        for (let i = 0; i < rounds; i++) {
            const F = ((R * round_keys[i % round_keys.length] + SEED + i * 0x6B) ^ (R >> 3)) & 0x3FF;
            const newR = L ^ F;
            L = R;
            R = newR;
        }

        if (!encrypt) round_keys.reverse(); // restore

        return ((L << 10) | R) & 0xFFFFF; // 20-bit result
    }

    /**
     * contractId (1, 2, 3…) → 6-digit public code (842715, 563281…)
     * Always returns exactly 6 digits (100000–999999)
     */
    function idToCode(contractId) {
        if (!contractId || contractId <= 0) return null;
        // Encrypt the ID
        const enc = _feistel(contractId, 8, true);
        // Map 20-bit result (0–1048575) into 100000–999999
        const code = 100000 + (enc % 900000);
        return code;
    }

    /**
     * 6-digit public code → contractId
     * Returns null if code doesn't correspond to a valid ID
     */
    function codeToId(code) {
        const n = parseInt(code, 10);
        if (isNaN(n) || n < 100000 || n > 999999) return null;

        // Reverse the modulo mapping: try all possible 20-bit values
        // that map to this code
        const remainder = n - 100000; // 0..899999
        const range = 900000;

        // There are ceil(1048576 / 900000) ≈ 2 candidates max
        for (let k = 0; k * range + remainder <= 0xFFFFF; k++) {
            const enc = k * range + remainder;
            const contractId = _feistel(enc, 8, false);
            // Re-encode to verify (eliminates false positives)
            if (contractId >= 1 && contractId <= MAX_USERS) {
                if (idToCode(contractId) === n) {
                    return contractId;
                }
            }
        }
        return null;
    }

    /**
     * Expose globally
     */
    window.MetapolRef = {
        idToCode,
        codeToId,

        /**
         * Get public code for current user (after dashboard loads)
         * Stores in localStorage for reuse
         */
        getMyCode(contractId) {
            const code = idToCode(contractId);
            if (code) {
                localStorage.setItem(`metapol_code_${contractId}`, code);
            }
            return code;
        },

        /**
         * Build full referral URL from contractId
         */
        buildLink(contractId) {
            const code = idToCode(contractId);
            if (!code) return null;
            const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
            return `${base}/?ref=${code}`;
        },

        /**
         * Parse ?ref= from URL → contractId (or null)
         */
        parseUrlRef() {
            const params = new URLSearchParams(window.location.search);
            const raw = params.get('ref');
            if (!raw) return null;
            // Support both old-style (numeric ID) and new public codes
            const asNum = parseInt(raw, 10);
            if (isNaN(asNum)) return null;
            // If it looks like a 6-digit public code
            if (raw.length === 6 && asNum >= 100000) {
                return codeToId(asNum); // returns contractId
            }
            // Fallback: treat as raw contract ID (legacy links)
            return asNum > 0 ? asNum : null;
        }
    };

})(window);
