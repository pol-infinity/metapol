/**
 * MetaPOL Premium Add-ons
 * 1. Leaderboard Multi-Category (Top Earners / Top Miners / Top Recruiters)
 * 2. Personal ROI Calculator
 * 3. Network Genealogy Tree (2 levels deep)
 */

/* ================================================================
   SHARED: Chunked event fetch with retries (avoids RPC range limits
   that cause "failed to load" on mobile/WalletConnect RPC endpoints)
   ================================================================ */
const EVT_CHUNK_SIZE  = 2000;
const EVT_MAX_RETRIES = 3;

async function fetchEventChunk(contract, filter, from, to, attempt = 1) {
    try {
        return await contract.queryFilter(filter, from, to);
    } catch (e) {
        if (attempt >= EVT_MAX_RETRIES) {
            // Last resort: split the range in half and try each half once more.
            if (to > from) {
                const mid = Math.floor((from + to) / 2);
                const [a, b] = await Promise.all([
                    fetchEventChunk(contract, filter, from, mid, attempt),
                    fetchEventChunk(contract, filter, mid + 1, to, attempt)
                ]);
                return [...a, ...b];
            }
            console.error(`Chunk ${from}-${to} failed after ${attempt} attempts, data may be incomplete:`, e);
            return [];
        }
        await new Promise(r => setTimeout(r, 300 * attempt));
        return fetchEventChunk(contract, filter, from, to, attempt + 1);
    }
}
async function queryFilterChunked(contract, filter, fromBlock, toBlock) {
    const results = [];
    let from = fromBlock;
    while (from <= toBlock) {
        const to = Math.min(from + EVT_CHUNK_SIZE - 1, toBlock);
        const chunk = await fetchEventChunk(contract, filter, from, to);
        results.push(...chunk);
        from = to + 1;
    }
    return results;
}

// Generic retry wrapper for single RPC calls (getUserInfo, getBlockNumber, etc).
// Mobile/WalletConnect RPC bridges are often more rate-limit-sensitive than
// desktop extension wallets, so plain calls need backoff too, not just event scans.
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

// Runs async tasks with limited concurrency so we don't flood mobile RPC
// bridges with dozens of simultaneous requests.
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

/* ================================================================
   1. LEADERBOARD CATEGORIES
   ================================================================ */

let _lbAllData   = null;   // { earners, miners, recruiters }
let _lbDataTime  = 0;
let _lbCategory  = 'earners';
const LB_PREMIUM_TTL = 5 * 60 * 1000;

function switchLbCategory(cat, btn) {
    _lbCategory = cat;
    document.querySelectorAll('.lb-cat-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (_lbAllData) {
        renderLeaderboardCategory(_lbAllData[cat], cat);
    } else {
        syncLeaderboard(false);
    }
}

// Override the existing syncLeaderboard to support categories
const _originalSyncLb = window.syncLeaderboard || function(){};
window.syncLeaderboard = async function(forceRefresh) {
    if (!window.metapolApp.isConnected) return;

    const now = Date.now();
    if (!forceRefresh && _lbAllData && (now - _lbDataTime) < LB_PREMIUM_TTL) {
        renderLeaderboardCategory(_lbAllData[_lbCategory], _lbCategory);
        return;
    }

    const container  = document.getElementById('lb-table-container');
    const podiumEl   = document.getElementById('lb-podium');
    const refreshBtn = document.getElementById('lb-refresh-btn');

    if (container) container.innerHTML = `<div class="lb-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Scanning blockchain for top members…</span></div>`;
    if (podiumEl)  podiumEl.innerHTML  = '';
    if (refreshBtn){ refreshBtn.disabled = true; refreshBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading`; }

    try {
        const deployBlock = window.CONFIG.CONTRACT_DEPLOY_BLOCK;
        const contract    = window.metapolApp.contract;
        const provider    = window.metapolApp.provider;

        const latestBlock = await provider.getBlockNumber();

        // Fetch all SponsorPaid (commissions) + all RegUser (recruitments)
        const [sponsorEvents, regEvents, miningDepEvents] = await Promise.all([
            queryFilterChunked(contract, contract.filters.SponsorPaid(),   deployBlock, latestBlock),
            queryFilterChunked(contract, contract.filters.RegUser(),       deployBlock, latestBlock),
            queryFilterChunked(contract, contract.filters.MiningDeposit(), deployBlock, latestBlock).catch(() => [])
        ]);

        // ── Aggregate per address ──
        const byAddr = {};
        const ensureAddr = a => {
            const k = a.toLowerCase();
            if (!byAddr[k]) byAddr[k] = { commissions: 0n, recruits: 0, miningCapital: 0n };
            return byAddr[k];
        };

        sponsorEvents.forEach(ev => {
            const d = ensureAddr(ev.args.sponsor);
            d.commissions += ev.args.amount;
        });
        regEvents.forEach(ev => {
            // referrer field in RegUser is the sponsor
            if (ev.args.referrer) ensureAddr(ev.args.referrer).recruits++;
        });
        miningDepEvents.forEach(ev => {
            const d = ensureAddr(ev.args.user);
            d.miningCapital += ev.args.capital;
        });

        // ── Build sorted lists (top 10 each) ──
        const allAddrs = Object.keys(byAddr);

        const topEarners    = allAddrs.sort((a,b) => byAddr[b].commissions   > byAddr[a].commissions   ? 1 : -1).slice(0,10);
        const topMiners     = [...allAddrs].sort((a,b) => byAddr[b].miningCapital > byAddr[a].miningCapital ? 1 : -1).slice(0,10);
        const topRecruiters = [...allAddrs].sort((a,b) => byAddr[b].recruits       - byAddr[a].recruits).slice(0,10);

        // Resolve user info for unique addresses across all lists
        const uniqueNeeded = [...new Set([...topEarners, ...topMiners, ...topRecruiters])];
        const infoMap = {};
        await Promise.all(uniqueNeeded.map(async addr => {
            try {
                const info = await contract.getUserInfo(addr);
                infoMap[addr] = {
                    contractId: Number(info[1]),
                    isFounder:  info[4],
                    pubCode:    window.MetapolRef ? window.MetapolRef.idToCode(Number(info[1])) : Number(info[1])
                };
            } catch { infoMap[addr] = { contractId: 0, isFounder: false, pubCode: '??????' }; }
        }));

        const buildList = (addrs, metricFn, labelFn) => addrs.map(addr => ({
            addr,
            ...(infoMap[addr] || { contractId: 0, isFounder: false, pubCode: '??????' }),
            metricVal:  metricFn(byAddr[addr]),
            metricLabel: labelFn(byAddr[addr]),
            recruits:   byAddr[addr].recruits,
            totalPOL:   parseFloat(ethers.formatEther(byAddr[addr].commissions ?? 0n))
        }));

        _lbAllData = {
            earners:    buildList(topEarners,    d => parseFloat(ethers.formatEther(d.commissions ?? 0n)),  d => `${parseFloat(ethers.formatEther(d.commissions ?? 0n)).toFixed(2)} POL`),
            miners:     buildList(topMiners,     d => parseFloat(ethers.formatEther(d.miningCapital ?? 0n)),d => `${parseFloat(ethers.formatEther(d.miningCapital ?? 0n)).toFixed(2)} POL capital`),
            recruiters: buildList(topRecruiters, d => d.recruits,                                          d => `${d.recruits} referral${d.recruits !== 1 ? 's' : ''}`)
        };
        _lbDataTime = Date.now();

        renderLeaderboardCategory(_lbAllData[_lbCategory], _lbCategory);

    } catch(err) {
        console.error('Leaderboard error:', err);
        if (container) container.innerHTML = `<div class="lb-loading" style="color:rgba(255,80,80,0.7);"><i class="fa-solid fa-triangle-exclamation"></i><span>Failed to load leaderboard. Try again.</span></div>`;
    } finally {
        if (refreshBtn){ refreshBtn.disabled = false; refreshBtn.innerHTML = `<i class="fa-solid fa-rotate"></i> Refresh`; }
        const upd = document.getElementById('lb-last-updated');
        if (upd) upd.textContent = `All-time totals · synced ${new Date().toLocaleTimeString()}`;
    }
};

function renderLeaderboardCategory(leaders, category) {
    if (!leaders || leaders.length === 0) {
        document.getElementById('lb-table-container').innerHTML = `<div class="lb-loading"><i class="fa-solid fa-ghost"></i><span>No data yet</span></div>`;
        return;
    }

    const myAddr = window.metapolApp.userAddress?.toLowerCase();
    const catLabels = { earners: 'Commission', miners: 'Mining Capital', recruiters: 'Referrals' };
    const catLabel  = catLabels[category] || 'Score';

    // ── MY RANK CARD ──
    const myIdx     = leaders.findIndex(l => l.addr === myAddr);
    const myRankCard = document.getElementById('lb-my-rank-card');
    if (myIdx >= 0 && myRankCard) {
        const leader = leaders[myIdx];
        myRankCard.style.display = 'flex';
        document.getElementById('lb-my-rank-pos').textContent    = `#${myIdx + 1}`;
        document.getElementById('lb-my-rank-code').textContent   = `#${leader.pubCode}`;
        document.getElementById('lb-my-rank-amount').textContent = leader.metricLabel;
        document.getElementById('lb-my-rank-label').textContent  = catLabel;
        const pos = myIdx + 1;
        const posEl = document.getElementById('lb-my-rank-pos');
        if (posEl) posEl.style.color = pos === 1 ? '#FFD700' : pos === 2 ? '#C0C0C0' : pos === 3 ? '#CD7F32' : 'var(--primary)';
    } else if (myRankCard) {
        myRankCard.style.display = 'none';
    }

    const maxVal = leaders[0]?.metricVal || 1;

    // ── PODIUM TOP 3 ──
    const podiumEl = document.getElementById('lb-podium');
    if (podiumEl && leaders.length >= 1) {
        const podium = [leaders[1], leaders[0], leaders[2]].filter(Boolean);
        const podiumPos    = [2, 1, 3];
        const podiumIcons  = { 1: '🥇', 2: '🥈', 3: '🥉' };
        const podiumColors = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
        const podiumH      = { 1: '110px', 2: '80px', 3: '65px' };

        podiumEl.innerHTML = podium.map((leader, i) => {
            const pos  = podiumPos[i];
            const isMe = leader.addr === myAddr;
            return `
            <div class="lb-podium-col ${isMe ? 'lb-podium-me' : ''}">
                <div class="lb-podium-code" style="color:${podiumColors[pos]};">#${leader.pubCode}</div>
                <div class="lb-podium-amount">${leader.metricLabel}</div>
                <div class="lb-podium-refs">${leader.recruits} referral${leader.recruits !== 1 ? 's' : ''}</div>
                <div class="lb-podium-block" style="height:${podiumH[pos]};background:linear-gradient(180deg,${podiumColors[pos]}33,${podiumColors[pos]}11);border-color:${podiumColors[pos]}55;">
                    <div class="lb-podium-medal">${podiumIcons[pos]}</div>
                    <div class="lb-podium-rank" style="color:${podiumColors[pos]};">#${pos}</div>
                    ${leader.isFounder ? '<div class="lb-podium-founder"><i class="fa-solid fa-crown"></i></div>' : ''}
                </div>
            </div>`;
        }).join('');
    }

    // ── FULL TABLE ──
    const container = document.getElementById('lb-table-container');
    container.innerHTML = `
        <div class="lb-table-wrap">
            ${leaders.map((leader, idx) => {
                const pos   = idx + 1;
                const isMe  = leader.addr === myAddr;
                const pct   = Math.max(6, Math.round((leader.metricVal / maxVal) * 100));
                const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null;
                const color = pos === 1 ? '#FFD700' : pos === 2 ? '#C0C0C0' : pos === 3 ? '#CD7F32' : pos <= 5 ? 'var(--primary)' : 'rgba(255,255,255,0.5)';
                // Animated rank badge for top 3
                const badge = pos <= 3 ? `<span class="lb-rank-badge lb-rank-badge-${pos}">TOP ${pos}</span>` : '';
                return `
                <div class="lb-row ${isMe ? 'lb-row-me' : ''}" style="animation-delay:${idx * 50}ms">
                    <div class="lb-row-rank" style="color:${color};">
                        ${medal ? `<span class="lb-medal">${medal}</span>` : `<span class="lb-pos-num">${pos}</span>`}
                        ${badge}
                    </div>
                    <div class="lb-row-member">
                        <div class="lb-row-code" style="color:${color};">
                            #${leader.pubCode}
                            ${isMe ? '<span class="lb-you-badge">YOU</span>' : ''}
                        </div>
                        <div class="lb-row-meta">
                            ${leader.isFounder ? '<span class="lb-founder-tag"><i class="fa-solid fa-crown"></i> Founder</span>' : ''}
                            <span>${leader.recruits} referral${leader.recruits !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="lb-row-right">
                        <div class="lb-row-amount" style="color:${color};">${leader.metricLabel}</div>
                        <div class="lb-row-bar-wrap">
                            <div class="lb-row-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${color}66,${color});"></div>
                        </div>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

/* ================================================================
   2. PERSONAL ROI CALCULATOR
   ================================================================ */

let _roiSlotData = null;

window.syncROICalculator = async function() {
    if (!window.metapolApp.isConnected) return;

    const addr     = window.metapolApp.userAddress;
    const contract = window.metapolApp.contract;
    const prices   = [10,20,40,80,160,320,640,1280,2560,5120,10240,20480];

    const projTable  = document.getElementById('roi-projection-table');
    const slotBreak  = document.getElementById('roi-slot-breakdown');
    if (projTable) projTable.innerHTML = `<div class="lb-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Syncing your slot data…</span></div>`;
    if (slotBreak) slotBreak.innerHTML = `<div class="lb-loading"><i class="fa-solid fa-spinner fa-spin"></i><span>Loading…</span></div>`;

    try {
        // Fetch active slots and mining entries in parallel
        const slotChecks = prices.map((_, i) => contract.isUserInSlot(addr, i + 1).catch(() => false));
        const [activeSlots, miningData] = await Promise.all([
            Promise.all(slotChecks),
            contract.getMiningEntries(addr).catch(() => null)
        ]);

        // Build slot data
        _roiSlotData = prices.map((price, i) => ({
            level:   i + 1,
            price,
            active:  activeSlots[i],
            miningCap:  price * 0.20,
            miningCapX5: price * 0.20 * 5,
            dailyMining: price * 0.20 * 0.0015
        }));

        const activeOnes = _roiSlotData.filter(s => s.active);

        // Mining totals from contract entries
        let totalMiningCapital = 0;
        let totalMiningWithdrawn = 0;
        let totalMiningCapLimit  = 0;
        if (miningData) {
            const [capitals, caps, withdrawn, , active] = miningData;
            for (let i = 0; i < capitals.length; i++) {
                if (active[i]) {
                    totalMiningCapital  += parseFloat(ethers.formatEther(capitals[i] ?? 0n));
                    totalMiningCapLimit += parseFloat(ethers.formatEther(caps[i] ?? 0n));
                }
                totalMiningWithdrawn += parseFloat(ethers.formatEther(withdrawn[i] ?? 0n));
            }
        }

        const dailyMining  = totalMiningCapital * 0.0015;
        const remaining    = Math.max(0, totalMiningCapLimit - totalMiningWithdrawn);

        // Summary cards
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('roi-active-slots',   activeOnes.length);
        set('roi-mining-capital', `${totalMiningCapital.toFixed(3)} POL`);
        set('roi-daily-earn',     `${dailyMining.toFixed(4)} POL`);
        set('roi-total-cap',      `${remaining.toFixed(2)} POL left`);

        recalcROI(_roiSlotData, totalMiningCapital, dailyMining, remaining);
        renderSlotBreakdown(_roiSlotData);

    } catch(err) {
        console.error('ROI sync error:', err);
        if (projTable) projTable.innerHTML = `<div class="lb-loading" style="color:rgba(255,80,80,0.7);"><i class="fa-solid fa-triangle-exclamation"></i><span>Failed to load. Check network.</span></div>`;
    }
};

function recalcROI(slotData, miningCapital, dailyMining, remaining) {
    slotData = slotData || _roiSlotData;
    if (!slotData) return;

    const directsEl = document.getElementById('roi-directs-select');
    const directs   = directsEl ? parseInt(directsEl.value) : 2;
    const matrixActive = directs >= 2;

    const activeOnes = slotData.filter(s => s.active);
    miningCapital = miningCapital ?? activeOnes.reduce((s, sl) => s + sl.miningCap, 0);
    dailyMining   = dailyMining   ?? miningCapital * 0.0015;
    remaining     = remaining     ?? miningCapital * 5;

    const periods = [
        { label: '7 Days',   days: 7   },
        { label: '30 Days',  days: 30  },
        { label: '90 Days',  days: 90  },
        { label: '180 Days', days: 180 },
        { label: '1 Year',   days: 365 },
    ];

    // Matrix cycle earnings estimate (only if matrix active)
    // Per slot: cycle = threshold * slotPrice * 0.72
    const thresholds = [3,3,4,4,4,4,4,4,4,4,4,4];
    const matrixPerCycle = matrixActive
        ? activeOnes.reduce((sum, sl) => sum + (thresholds[sl.level-1] * sl.price * 0.72), 0)
        : 0;

    const container = document.getElementById('roi-projection-table');
    if (!container) return;

    container.innerHTML = `
        <div class="roi-table-wrap">
            <div class="roi-table-header">
                <span>Period</span>
                <span>Mining Income</span>
                ${matrixActive ? '<span>Matrix (est.)</span>' : '<span style="color:var(--danger)">Matrix (locked)</span>'}
                <span>Total Est.</span>
            </div>
            ${periods.map(p => {
                const miningEarn = Math.min(dailyMining * p.days, remaining);
                // Estimate ~1 cycle per threshold worth of members per slot per period
                const cyclesEst  = matrixActive ? Math.floor(p.days / 30) : 0;
                const matrixEarn = matrixPerCycle * cyclesEst;
                const total      = miningEarn + matrixEarn;
                return `
                <div class="roi-table-row">
                    <span class="roi-period-label">${p.label}</span>
                    <span class="roi-val-mining">${miningEarn.toFixed(2)} <small>POL</small></span>
                    <span class="roi-val-matrix ${matrixActive ? '' : 'roi-locked'}">${matrixActive ? matrixEarn.toFixed(2) + ' <small>POL</small>' : '—'}</span>
                    <span class="roi-val-total">${total.toFixed(2)} <small>POL</small></span>
                </div>`;
            }).join('')}
            <div class="roi-table-note">
                <i class="fa-solid fa-circle-info"></i>
                Matrix estimates assume ~1 cycle/month per active slot. Actual results depend on network growth.
                ${!matrixActive ? `<br><span style="color:var(--accent)">You need ${2 - parseInt(directsEl?.value || 0)} more direct referral(s) to unlock Matrix income.</span>` : ''}
            </div>
        </div>`;
}
window.recalcROI = recalcROI;

function renderSlotBreakdown(slotData) {
    const container = document.getElementById('roi-slot-breakdown');
    if (!container) return;

    const thresholds = [3,3,4,4,4,4,4,4,4,4,4,4];
    const slotColors = [
        '#6B7280','#00D4FF','#00D4FF','#00D4FF',
        '#00FFB3','#00FFB3','#00FFB3',
        '#FFD700','#FFD700','#FFD700',
        '#FF6B9D','#FF6B9D','#FF6B9D'
    ];

    container.innerHTML = `
        <div class="roi-slots-grid">
            ${slotData.map(sl => {
                const color = sl.active ? slotColors[sl.level] : '#374151';
                const cycleProfit = thresholds[sl.level-1] * sl.price * 0.72;
                return `
                <div class="roi-slot-card ${sl.active ? 'roi-slot-active' : 'roi-slot-inactive'}" style="--sc:${color}">
                    <div class="roi-slot-header">
                        <span class="roi-slot-num">S${sl.level}</span>
                        <span class="roi-slot-status">${sl.active ? '<i class="fa-solid fa-circle-check" style="color:var(--accent)"></i> Active' : '<i class="fa-solid fa-lock"></i> Locked'}</span>
                    </div>
                    <div class="roi-slot-price">${sl.price} POL</div>
                    <div class="roi-slot-stats">
                        <div class="roi-slot-stat"><span>Daily</span><strong>${sl.dailyMining.toFixed(sl.level <= 3 ? 3 : 2)} POL</strong></div>
                        <div class="roi-slot-stat"><span>Cap</span><strong>${sl.miningCapX5.toFixed(1)} POL</strong></div>
                        <div class="roi-slot-stat"><span>Cycle</span><strong>${cycleProfit.toFixed(1)} POL</strong></div>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
}

/* ================================================================
   3. NETWORK GENEALOGY TREE
   ================================================================ */

let _treeCache    = null;
let _treeCacheTime = 0;
const TREE_TTL = 3 * 60 * 1000;

window.syncNetworkTree = async function(forceRefresh) {
    if (!window.metapolApp.isConnected) return;

    const now = Date.now();
    if (!forceRefresh && _treeCache && (now - _treeCacheTime) < TREE_TTL) {
        renderTree(_treeCache);
        return;
    }

    const loading = document.getElementById('tree-loading');
    const wrap    = document.getElementById('tree-svg-wrap');
    const btn     = document.getElementById('tree-refresh-btn');

    if (loading) loading.style.display = 'flex';
    if (wrap)    wrap.style.display    = 'none';
    if (btn)     { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading`; }

    try {
        const addr     = window.metapolApp.userAddress;
        const contract = window.metapolApp.contract;
        const provider = window.metapolApp.provider;
        const deployBlock = window.CONFIG.CONTRACT_DEPLOY_BLOCK;
        const latestBlock = await retryCall(() => provider.getBlockNumber(), 3, 'getBlockNumber');
        const SLOT_PRICES = [10,20,40,80,160,320,640,1280,2560,5120,10240,20480];

        // Get MY info
        const myInfo   = await retryCall(() => contract.getUserInfo(addr), 3, 'getUserInfo(me)');
        const myId     = Number(myInfo[1]);
        const myCode   = window.MetapolRef ? window.MetapolRef.idToCode(myId) : myId;
        const myFounder = myInfo[4];

        // Estimate my highest slot from mining deposit
        const myEarnings = await retryCall(() => contract.getUserEarnings(addr), 3, 'getUserEarnings(me)').catch(() => [0n,0n,0n]);
        const myMiningDep = parseFloat(ethers.formatEther(myEarnings[1] ?? 0n));
        const mySlot = getHighestSlot(myMiningDep, SLOT_PRICES);

        // Level 1: all users who registered with me as referrer
        const filterL1 = contract.filters.RegUser(null, addr);
        const l1Events = await queryFilterChunked(contract, filterL1, deployBlock, latestBlock);

        // Resolve L1 (and their L2) info with limited concurrency — firing
        // dozens of parallel RPC calls at once is what trips up mobile
        // wallet RPC bridges (WalletConnect, in-app browsers), even when
        // each individual call would have succeeded on its own.
        const L1_CONCURRENCY = 3;
        const resolved = await mapWithConcurrency(l1Events, L1_CONCURRENCY, async (ev) => {
            const refAddr = ev.args.user;
            try {
                const info     = await retryCall(() => contract.getUserInfo(refAddr), 2, 'getUserInfo(l1)');
                const earnings = await retryCall(() => contract.getUserEarnings(refAddr), 2, 'getUserEarnings(l1)').catch(() => [0n,0n,0n]);
                const id       = Number(info[1]);
                const isFounder= info[4];
                const mDep     = parseFloat(ethers.formatEther(earnings[1] ?? 0n));
                const slot     = getHighestSlot(mDep, SLOT_PRICES);
                const code     = window.MetapolRef ? window.MetapolRef.idToCode(id) : id;

                // Level 2: users referred by this L1 member
                const filterL2 = contract.filters.RegUser(null, refAddr);
                const l2Evs    = await queryFilterChunked(contract, filterL2, deployBlock, latestBlock);

                const children = await mapWithConcurrency(l2Evs.slice(0, 8), L1_CONCURRENCY, async (ev2) => {
                    try {
                        const info2 = await retryCall(() => contract.getUserInfo(ev2.args.user), 2, 'getUserInfo(l2)');
                        const earn2 = await retryCall(() => contract.getUserEarnings(ev2.args.user), 2, 'getUserEarnings(l2)').catch(() => [0n,0n,0n]);
                        const id2   = Number(info2[1]);
                        const dep2  = parseFloat(ethers.formatEther(earn2[1] ?? 0n));
                        return {
                            addr:      ev2.args.user.toLowerCase(),
                            id:        id2,
                            code:      window.MetapolRef ? window.MetapolRef.idToCode(id2) : id2,
                            slot:      getHighestSlot(dep2, SLOT_PRICES),
                            isFounder: info2[4],
                            children:  []
                        };
                    } catch { return null; }
                });

                return { addr: refAddr.toLowerCase(), id, code, slot, isFounder, children: children.filter(Boolean) };
            } catch (e) {
                console.warn('Tree: skipping L1 member after retries failed', refAddr, e);
                return null;
            }
        });

        const l1Nodes = resolved.filter(Boolean);

        const root = {
            addr: addr.toLowerCase(), id: myId, code: myCode,
            slot: mySlot, isFounder: myFounder, children: l1Nodes, isRoot: true
        };

        _treeCache    = root;
        _treeCacheTime = Date.now();

        renderTree(root);

    } catch(err) {
        console.error('Tree error:', err);
        const loading = document.getElementById('tree-loading');
        const reason = (err && (err.shortMessage || err.message)) ? String(err.shortMessage || err.message).slice(0, 90) : 'Unknown error';
        if (loading) loading.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:rgba(255,80,80,0.7);"></i><span style="color:rgba(255,80,80,0.7);">Failed to load tree (${reason}). <a href="#" onclick="syncNetworkTree(true); return false;" style="color:var(--accent); text-decoration:underline;">Retry</a></span>`;
    } finally {
        const btn = document.getElementById('tree-refresh-btn');
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="fa-solid fa-rotate"></i> Refresh`; }
    }
};

function getHighestSlot(miningDep, prices) {
    for (let i = prices.length - 1; i >= 0; i--) {
        if (miningDep >= prices[i] * 0.2) return i + 1;
    }
    return 0;
}

function slotColor(slot, isFounder) {
    if (isFounder) return '#FF9500';
    if (slot === 0) return '#6B7280';
    if (slot <= 3)  return '#00D4FF';
    if (slot <= 6)  return '#00FFB3';
    if (slot <= 9)  return '#FFD700';
    return '#FF6B9D';
}

function renderTree(root) {
    const loading = document.getElementById('tree-loading');
    const wrap    = document.getElementById('tree-svg-wrap');
    if (!loading || !wrap) return;

    loading.style.display = 'none';
    wrap.style.display    = 'block';

    // ── Responsive layout constants (shrink nodes on small screens) ──
    const vw = window.innerWidth;
    const isSmallMobile = vw <= 380;
    const isMobile       = vw <= 480;
    const isTablet       = vw <= 768;

    const NODE_W   = isSmallMobile ? 66  : isMobile ? 74  : isTablet ? 90  : 110;
    const NODE_H   = isSmallMobile ? 46  : isMobile ? 50  : isTablet ? 56  : 64;
    const H_GAP    = isSmallMobile ? 10  : isMobile ? 12  : isTablet ? 16  : 24;
    const V_GAP    = isSmallMobile ? 40  : isMobile ? 48  : isTablet ? 60  : 80;
    const FS_CODE  = isSmallMobile ? 8   : isMobile ? 8.5 : isTablet ? 9.5 : 11;
    const FS_SLOT  = isSmallMobile ? 6.5 : isMobile ? 7   : isTablet ? 8   : 9.5;
    const FS_SUB   = isSmallMobile ? 6   : isMobile ? 6.5 : isTablet ? 7.5 : 8.5;
    const LEVEL_Y  = [16, 16 + NODE_H + V_GAP, 16 + (NODE_H + V_GAP) * 2];

    // Compute positions
    function layoutTree(node, level) {
        if (level === 0) {
            node._w = Math.max(NODE_W, (node.children.length || 1) * (NODE_W + H_GAP));
            node._x = node._w / 2;
            node._y = LEVEL_Y[0];
            let cx = 0;
            node.children.forEach(child => {
                layoutTree(child, 1);
                child._parentX = null;
            });
            // Spread L1 evenly
            const l1Total = node.children.length;
            node._w = Math.max(NODE_W, l1Total * (NODE_W + H_GAP) - H_GAP);
            node._x = node._w / 2;
            let curX = 0;
            node.children.forEach((child, i) => {
                const childW = Math.max(NODE_W, (child.children.length || 1) * (NODE_W + H_GAP));
                child._x = curX + childW / 2;
                child._y = LEVEL_Y[1];
                let cxl2 = curX;
                child.children.forEach(l2 => {
                    l2._x = cxl2 + NODE_W / 2;
                    l2._y = LEVEL_Y[2];
                    cxl2 += NODE_W + H_GAP;
                });
                curX += childW + H_GAP;
            });
            node._w = curX - H_GAP;
            node._x = node._w / 2;
        }
    }
    layoutTree(root, 0);

    const svgW  = Math.max(500, root._w + 60);
    const svgH  = root.children.length > 0
        ? (root.children.some(c => c.children.length > 0) ? LEVEL_Y[2] + NODE_H + 30 : LEVEL_Y[1] + NODE_H + 30)
        : LEVEL_Y[0] + NODE_H + 30;

    // ── Build SVG ──
    const svgStyle = isMobile
        ? `width:100%; height:auto; display:block; font-family:sans-serif;`
        : `min-width:${svgW}px; font-family:sans-serif;`;
    let svgParts = [`<svg viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="${svgStyle}">`];

    function drawNode(node, isRoot) {
        const x  = node._x + 30;
        const y  = node._y;
        const c  = slotColor(node.slot, node.isFounder);
        const rx = x - NODE_W / 2;

        // Connection lines to children
        node.children.forEach(child => {
            const cx = child._x + 30;
            const cy = child._y;
            svgParts.push(`<line x1="${x}" y1="${y + NODE_H}" x2="${cx}" y2="${cy}" stroke="${c}" stroke-width="1.5" stroke-opacity="0.4" stroke-dasharray="4 3"/>`);
            // L2 lines
            child.children.forEach(l2 => {
                const lx = l2._x + 30;
                const ly = l2._y;
                const cc = slotColor(l2.slot, l2.isFounder);
                svgParts.push(`<line x1="${cx}" y1="${cy + NODE_H}" x2="${lx}" y2="${ly}" stroke="${cc}" stroke-width="1" stroke-opacity="0.3" stroke-dasharray="3 3"/>`);
            });
        });

        // Node box
        const glow = isRoot ? `filter:drop-shadow(0 0 8px ${c})` : '';
        const crownTxt = node.isFounder ? ' 👑' : '';
        svgParts.push(`
            <g style="${glow}">
                <rect x="${rx}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="${isMobile ? 6 : 10}"
                    fill="rgba(255,255,255,0.04)" stroke="${c}" stroke-width="${isRoot ? 2 : 1.5}" stroke-opacity="0.8"/>
                ${isRoot ? `<rect x="${rx}" y="${y}" width="${NODE_W}" height="3" rx="1.5" fill="${c}" opacity="0.6"/>` : ''}
                <text x="${x}" y="${y + NODE_H * 0.36}" text-anchor="middle" fill="${c}" font-size="${FS_CODE}" font-weight="700">#${node.code}</text>
                <text x="${x}" y="${y + NODE_H * 0.6}" text-anchor="middle" fill="rgba(255,255,255,0.5)" font-size="${FS_SLOT}">
                    ${node.slot > 0 ? `S${node.slot}` : '—'}${crownTxt}
                </text>
                ${isRoot && !isMobile ? `<text x="${x}" y="${y + NODE_H - 8}" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="${FS_SUB}">${node.children.length} direct${node.children.length !== 1 ? 's' : ''}</text>` : ''}
                ${!isRoot && node.children.length > 0 && !isMobile ? `<text x="${x}" y="${y + NODE_H - 8}" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-size="${FS_SUB}">${node.children.length} ref${node.children.length !== 1 ? 's' : ''}</text>` : ''}
            </g>`);

        node.children.forEach(child => {
            drawNode(child, false);
            child.children.forEach(l2 => {
                const lc = slotColor(l2.slot, l2.isFounder);
                const lx = l2._x + 30;
                const ly = l2._y;
                const lrx = lx - NODE_W / 2;
                svgParts.push(`
                    <rect x="${lrx}" y="${ly}" width="${NODE_W}" height="${NODE_H}" rx="${isMobile ? 6 : 10}"
                        fill="rgba(255,255,255,0.03)" stroke="${lc}" stroke-width="1" stroke-opacity="0.6"/>
                    <text x="${lx}" y="${ly + NODE_H * 0.36}" text-anchor="middle" fill="${lc}" font-size="${Math.max(FS_CODE - 1, 6.5)}" font-weight="600">#${l2.code}</text>
                    <text x="${lx}" y="${ly + NODE_H * 0.6}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="${FS_SLOT}">
                        ${l2.slot > 0 ? `S${l2.slot}` : '—'}${l2.isFounder ? ' 👑' : ''}
                    </text>`);
            });
        });
    }

    drawNode(root, true);
    svgParts.push('</svg>');
    wrap.innerHTML = svgParts.join('');

    // ── Stats ──
    const l1Count    = root.children.length;
    const l2Count    = root.children.reduce((s, c) => s + c.children.length, 0);
    const foundersN  = root.children.filter(c => c.isFounder).length + root.children.reduce((s, c) => s + c.children.filter(l => l.isFounder).length, 0);
    const activeN    = root.children.filter(c => c.slot > 0).length + root.children.reduce((s, c) => s + c.children.filter(l => l.slot > 0).length, 0);

    const setS = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setS('tree-stat-l1',       l1Count);
    setS('tree-stat-l2',       l2Count);
    setS('tree-stat-founders', foundersN);
    setS('tree-stat-active',   activeN);
}
