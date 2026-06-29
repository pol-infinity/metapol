/**
 * MetaPOL Referral Code System
 * ─────────────────────────────────────────────────────────────
 * Converts sequential contract User IDs ↔ random-looking 6-digit
 * Public Member Codes. Fully deterministic, no backend required.
 *
 * Algorithm:
 *   1. Apply a modular permutation to contractId
 *   2. Return a 6-digit code that looks random but is reversible
 *
 * Security: codes look random to users but are mathematically
 * linked to real IDs only via this private seed table.
 */

(function (window) {

    // Six digit code space: 100000..999999.
    // A and CODE_SPACE are coprime, so each member ID maps to exactly one code.
    const CODE_SPACE = 900000;
    const MAX_USERS = 899999;
    const MULTIPLIER = 65537;
    const MULTIPLIER_INVERSE = 273473;
    const OFFSET = 499771; // Keeps member ID 7 as public code 158530.

    function _mod(n, m) {
        return ((n % m) + m) % m;
    }

    /**
     * contractId (1, 2, 3…) → 6-digit public code (842715, 563281…)
     * Always returns exactly 6 digits (100000–999999)
     */
    function idToCode(contractId) {
        if (!contractId || contractId <= 0) return null;
        if (contractId > MAX_USERS) return null;
        return 100000 + _mod(contractId * MULTIPLIER + OFFSET, CODE_SPACE);
    }

    /**
     * 6-digit public code → contractId
     * Returns null if code doesn't correspond to a valid ID
     */
    function codeToId(code) {
        const n = parseInt(code, 10);
        if (isNaN(n) || n < 100000 || n > 999999) return null;

        const encoded = n - 100000;
        const contractId = _mod((encoded - OFFSET) * MULTIPLIER_INVERSE, CODE_SPACE);
        return contractId >= 1 && contractId <= MAX_USERS ? contractId : null;
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
            const rawId = params.get('refid');
            if (rawId) {
                const asId = parseInt(rawId, 10);
                return !isNaN(asId) && asId > 0 ? asId : null;
            }

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
