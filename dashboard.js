/**
 * MetaPOL Dashboard UI Controller
 * Core interactions, ticking counters, contract synchronizations
 */

let activeTab = "overview";
let miningTimer = null;
let miningEntries = [];
let userMemberId = 0;
let userTotalMiningDeposited = 0n;

document.addEventListener("DOMContentLoaded", () => {
    // Intercept wallet connection to trigger dashboard sync
    const originalUpdateWalletUI = window.metapolApp.updateWalletUI;
    window.metapolApp.updateWalletUI = function() {
        originalUpdateWalletUI.apply(this);
        if (this.isConnected) {
            syncDashboardData();
        } else {
            stopMiningTimer();
        }
    };

    // Tab Switching Handlers
    const setupTabs = (selectors) => {
        selectors.forEach(link => {
            link.addEventListener("click", (e) => {
                const targetTab = link.getAttribute("data-tab");
                if (targetTab) {
                    switchTab(targetTab);
                }
            });
        });
    };

    setupTabs(document.querySelectorAll(".sidebar-link"));
    setupTabs(document.querySelectorAll(".mobile-tab-btn"));
    setupTabs(document.querySelectorAll(".btab-btn"));

    // Matrix Selector handler
    const selectMatrix = document.getElementById("matrix-level-select");
    if (selectMatrix) {
        selectMatrix.addEventListener("change", () => {
            syncMatrixTab(parseInt(selectMatrix.value));
        });
    }
});

// Switch Dashboard Tab
function switchTab(tabId) {
    activeTab = tabId;

    // Update Sidebar active state
    document.querySelectorAll(".sidebar-link").forEach(link => {
        if (link.getAttribute("data-tab") === tabId) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });

    // Update Mobile Nav active state
    document.querySelectorAll(".mobile-tab-btn").forEach(btn => {
        if (btn.getAttribute("data-tab") === tabId) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // Update Bottom Tab Bar active state
    document.querySelectorAll(".btab-btn").forEach(btn => {
        if (btn.getAttribute("data-tab") === tabId) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    // Scroll to top of content on mobile tab switch
    if (window.innerWidth <= 1024) {
        const dashMain = document.querySelector(".dash-main");
        if (dashMain) dashMain.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Toggle panels
    document.querySelectorAll(".tab-panel").forEach(panel => {
        if (panel.id === `tab-${tabId}`) {
            panel.classList.add("active");
        } else {
            panel.classList.remove("active");
        }
    });

    // Tab-specific trigger loads
    if (tabId === "slots") syncSlotsTab();
    if (tabId === "matrix") syncMatrixTab(parseInt(document.getElementById("matrix-level-select").value || 1));
    if (tabId === "team") syncTeamTab();
    if (tabId === "activity") syncActivityTab();
}

// Synchronize all basic dashboard metrics
async function syncDashboardData() {
    if (!window.metapolApp.isConnected) return;

    try {
        const address = window.metapolApp.userAddress;
        
        // 1. Get user info from contract
        const userInfo = await window.metapolApp.contract.getUserInfo(address);
        const [
            isExist, id, referrerID, referredUsers,
            totalEarnings, totalMiningDep, totalMiningWith,
            isFounder, incomeEligible
        ] = userInfo;

        userMemberId = Number(id);
        userTotalMiningDeposited = totalMiningDep;

        // ── Public Member Code (hides real contract ID) ──
        const publicCode = window.MetapolRef ? window.MetapolRef.getMyCode(userMemberId) : userMemberId;

        // Display public code instead of real contract ID
        document.getElementById("stat-member-id").innerText = `#${publicCode}`;
        document.getElementById("stat-total-earnings").innerText = `${parseFloat(ethers.formatEther(totalEarnings)).toFixed(2)} POL`;
        document.getElementById("stat-mining-capital").innerText = `${parseFloat(ethers.formatEther(totalMiningDep)).toFixed(2)} POL`;
        document.getElementById("stat-direct-referrals").innerText = Number(referredUsers);

        // Team size card
        const teamCount = Number(referredUsers);
        const teamSizeEl = document.getElementById("stat-team-size");
        const teamFooterEl = document.getElementById("stat-team-footer");
        if (teamSizeEl) teamSizeEl.innerText = teamCount;
        if (teamFooterEl) teamFooterEl.innerText = teamCount === 1 ? "Direct member" : "Direct members";

        // Fetch direct commission (SponsorPaid events) for overview stat card + income breakdown
        let totalSponsorPaid = 0n;
        let directCount = Number(referredUsers);
        try {
            const sponsorFilter = window.metapolApp.contract.filters.SponsorPaid(address);
            const sponsorEvents = await window.metapolApp.contract.queryFilter(sponsorFilter, 0, "latest");
            sponsorEvents.forEach(ev => { totalSponsorPaid += ev.args.amount; });
            const commissionEl = document.getElementById("stat-direct-commission");
            if (commissionEl) commissionEl.innerText = `${parseFloat(ethers.formatEther(totalSponsorPaid)).toFixed(2)} POL`;
        } catch(e) { console.warn("Could not fetch sponsor commission:", e); }

        // ── Income Breakdown Rows (FutureTon style) ──
        const miningWithdrawnPOL = parseFloat(ethers.formatEther(totalMiningWith || 0n)).toFixed(2);
        const miningCapPOL       = parseFloat(ethers.formatEther(totalMiningDep)).toFixed(2);
        const matrixEarningsPOL  = parseFloat(ethers.formatEther(totalEarnings)).toFixed(2);
        const directCommPOL      = parseFloat(ethers.formatEther(totalSponsorPaid)).toFixed(2);

        // Mining row
        const incMining = document.getElementById("income-mining-val");
        const incMiningDay = document.getElementById("income-mining-daily");
        if (incMining) incMining.innerText = `${miningWithdrawnPOL} POL`;
        if (incMiningDay) {
            // Estimate daily = 1% of capital
            const dailyEst = (parseFloat(miningCapPOL) * 0.01).toFixed(2);
            incMiningDay.innerText = `~${dailyEst}/day`;
        }

        // Matrix row
        const incMatrix = document.getElementById("income-matrix-val");
        const incMatrixSlots = document.getElementById("income-matrix-slots");
        if (incMatrix) incMatrix.innerText = `${matrixEarningsPOL} POL`;
        if (incMatrixSlots) incMatrixSlots.innerText = `Slot earnings`;

        // Direct commission row
        const incDirect = document.getElementById("income-direct-val");
        const incDirectCount = document.getElementById("income-direct-count");
        if (incDirect) incDirect.innerText = `${directCommPOL} POL`;
        if (incDirectCount) incDirectCount.innerText = `${directCount} user${directCount !== 1 ? 's' : ''}`;

        // Update badges
        const founderBadge = document.getElementById("stat-founder-badge");
        if (isFounder) {
            founderBadge.innerHTML = `<span class="badge-role badge-role-founder"><i class="fa-solid fa-crown"></i> Founder Club</span>`;
            document.getElementById("profile-founder-status").className = "badge-role badge-role-founder";
            document.getElementById("profile-founder-status").innerText = "Founder Club Member";
        } else {
            founderBadge.innerHTML = `<span class="badge-role badge-role-user">Standard Member</span>`;
            document.getElementById("profile-founder-status").className = "badge-role badge-role-user";
            document.getElementById("profile-founder-status").innerText = "Standard Member";
        }

        const ownerWallet = await window.metapolApp.contract.ownerWallet();
        const isOwner = address.toLowerCase() === ownerWallet.toLowerCase();

        // Show Admin Panel link in sidebar only for owner wallet
        const adminSidebarLink = document.getElementById("sidebar-admin-link");
        if (adminSidebarLink) adminSidebarLink.style.display = isOwner ? "flex" : "none";

        const eligibilityBadge = document.getElementById("stat-eligibility-badge");
        const eligibilityProfile = document.getElementById("profile-matrix-eligibility");
        if (incomeEligible || isFounder || isOwner) {
            eligibilityBadge.innerHTML = `<i class="fa-solid fa-circle-check text-accent"></i> Matrix Eligible`;
            eligibilityProfile.innerHTML = `<span style="color: var(--accent); font-weight: 700;">Eligible</span>`;
        } else {
            eligibilityBadge.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Ineligible (${referredUsers}/2 Referrals)`;
            eligibilityProfile.innerHTML = `<span style="color: var(--danger); font-weight: 700;">Ineligible (Needs 2 Direct Referrals, current: ${referredUsers})</span>`;
        }

        // Referral link: use origin root with ?ref=USER_ID (auto-detects domain)
        const referralBase = window.location.origin;
        const referralLink = window.MetapolRef
            ? `${referralBase}/?ref=${publicCode}`
            : `${referralBase}/?ref=${userMemberId}`;
        const refInputEl = document.getElementById("referral-link-input");
        const refProfileEl = document.getElementById("profile-ref-link");
        if (refInputEl) refInputEl.value = referralLink;
        if (refProfileEl) { refProfileEl.innerText = referralLink; refProfileEl.href = referralLink; }
        // Update quick referral bar
        const quickDisplay = document.getElementById("referral-quick-display");
        if (quickDisplay) quickDisplay.textContent = referralLink;
        window._cachedReferralLink = referralLink;

        // Populate profile tab values
        document.getElementById("profile-id").innerText = `#${publicCode}`;
        document.getElementById("profile-wallet").innerText = address;
        document.getElementById("profile-sponsor").innerText = referrerID > 0 ? `#${referrerID}` : "None";

        // Populate wallet status fields
        try {
            const bal = await window.metapolApp.provider.getBalance(address);
            const balFmt = parseFloat(ethers.formatEther(bal)).toFixed(4);
            const polBalEl = document.getElementById("profile-pol-balance");
            if (polBalEl) polBalEl.innerText = `${balFmt} POL`;

            const network = await window.metapolApp.provider.getNetwork();
            const chainId = Number(network.chainId);
            const netEl = document.getElementById("profile-network-status");
            const connEl = document.getElementById("profile-connection-status");
            if (netEl) {
                if (chainId === window.CONFIG.CHAIN_ID_DECIMAL) {
                    netEl.innerText = "Polygon Mainnet ✓";
                    netEl.style.color = "var(--accent)";
                } else {
                    netEl.innerText = `Wrong Network (Chain ${chainId})`;
                    netEl.style.color = "var(--danger)";
                }
            }
            if (connEl) {
                connEl.innerText = "Connected ✓";
                connEl.style.color = "var(--accent)";
            }
        } catch(e) { console.warn("Profile wallet info fetch failed", e); }
        document.getElementById("profile-referred-count").innerText = Number(referredUsers);

        // 2. Fetch and synchronize Mining Entries
        await syncMiningData();

        // 3. Populate Overview matrix slots list
        await syncOverviewMatrixList();

    } catch (err) {
        console.error("Dashboard synchronization error:", err);
        window.metapolApp.showToast("Failed to refresh client portal metrics", "error");
    }
}

// Mining sync & Counter trigger
async function syncMiningData() {
    try {
        const address = window.metapolApp.userAddress;
        
        // Fetch raw mining entries from contract
        const rawEntries = await window.metapolApp.contract.getMiningEntries(address);
        const [capitals, caps, withdrawn, startTimes, active, pending] = rawEntries;

        miningEntries = [];
        let totalActiveCapital = 0n;
        let totalMiningWithdrawn = 0n;
        let totalMiningCap = 0n;

        const tableBody = document.getElementById("mining-entries-table-body");
        tableBody.innerHTML = "";

        for (let i = 0; i < capitals.length; i++) {
            const entry = {
                index: i + 1,
                capital: capitals[i],
                cap: caps[i],
                withdrawn: withdrawn[i],
                startTime: startTimes[i],
                active: active[i]
            };
            miningEntries.push(entry);

            if (entry.active) {
                totalActiveCapital += entry.capital;
                totalMiningCap += entry.cap;
            }
            totalMiningWithdrawn += entry.withdrawn;

            // Render table row
            const row = document.createElement("tr");
            const date = new Date(Number(entry.startTime) * 1000).toLocaleDateString();
            
            row.innerHTML = `
                <td>Entry #${entry.index}</td>
                <td>${parseFloat(ethers.formatEther(entry.capital)).toFixed(2)} POL</td>
                <td>${parseFloat(ethers.formatEther(entry.cap)).toFixed(2)} POL</td>
                <td>${parseFloat(ethers.formatEther(entry.withdrawn)).toFixed(2)} POL</td>
                <td>${date}</td>
                <td>
                    <span class="slot-status-label ${entry.active ? 'slot-status-active' : 'slot-status-locked'}">
                        ${entry.active ? 'Active' : 'Completed'}
                    </span>
                </td>
            `;
            tableBody.appendChild(row);
        }

        if (capitals.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No active mining entries. Buy slots to start mining.</td></tr>`;
        }

        // Set static mining tab stats
        document.getElementById("tab-mining-capital").innerText = `${parseFloat(ethers.formatEther(totalActiveCapital)).toFixed(2)} POL`;
        document.getElementById("tab-mining-withdrawn").innerText = `${parseFloat(ethers.formatEther(totalMiningWithdrawn)).toFixed(2)} POL`;
        document.getElementById("tab-mining-cap").innerText = `${parseFloat(ethers.formatEther(totalMiningCap)).toFixed(2)} POL`;

        // Calculate Daily (0.15% daily rate is 1_500_000_000 / 1e12)
        const dailyRate = Number(totalActiveCapital) * 0.0015;
        const dailyRateEth = parseFloat(ethers.formatEther(dailyRate.toString())).toFixed(4);
        document.getElementById("mining-est-daily").innerText = `${dailyRateEth} POL`;
        document.getElementById("tab-mining-daily").innerText = `${dailyRateEth} POL`;
        document.getElementById("mining-total-withdrawn").innerText = `${parseFloat(ethers.formatEther(totalMiningWithdrawn)).toFixed(2)} POL`;

        // Start Live ROI Animation Counter
        startMiningTimer();

    } catch (err) {
        console.error("Mining Sync failed:", err);
    }
}

// Start continuous ticks for ROI earnings
function startMiningTimer() {
    stopMiningTimer();
    
    // Set Last Sync Time
    const now = new Date();
    const syncStr = now.toLocaleTimeString();
    const syncEl1 = document.getElementById("overview-last-sync");
    const syncEl2 = document.getElementById("mining-tab-last-sync");
    if (syncEl1) syncEl1.innerText = syncStr;
    if (syncEl2) syncEl2.innerText = syncStr;

    // Fetch claimable from chain — getPendingMining returns [gross, adminFee, net]
    if (window.metapolApp && window.metapolApp.contract && window.metapolApp.userAddress) {
        window.metapolApp.contract.getPendingMining(window.metapolApp.userAddress).then(result => {
            // result[0]=gross, result[1]=adminFee, result[2]=net (what user receives)
            const netWei = result[2] !== undefined ? result[2] : result;
            const claimableVal = parseFloat(ethers.formatEther(netWei)).toFixed(4);
            const cl1 = document.getElementById("overview-claimable");
            const cl2 = document.getElementById("mining-tab-claimable");
            if (cl1) cl1.innerText = `${claimableVal} POL`;
            if (cl2) cl2.innerText = `${claimableVal} POL`;
        }).catch(() => {});
    }

    // Set 100ms interval for ticking
    miningTimer = setInterval(() => {
        if (miningEntries.length === 0) return;

        let totalTickingPending = 0;
        const now = Date.now() / 1000;
        const SECONDS_PER_DAY = 86400;
        const DAILY_RATE = 1500000000 / 1e12; // 0.0015 (0.15% per day)

        miningEntries.forEach(entry => {
            if (!entry.active) return;

            const elapsed = now - Number(entry.startTime);
            const earned = Number(ethers.formatEther(entry.capital)) * DAILY_RATE * elapsed / SECONDS_PER_DAY;
            const available = earned > Number(ethers.formatEther(entry.cap)) ? Number(ethers.formatEther(entry.cap)) : earned;
            const pending = available > Number(ethers.formatEther(entry.withdrawn)) ? available - Number(ethers.formatEther(entry.withdrawn)) : 0;
            
            totalTickingPending += pending;
        });

        // Set value on HTML inputs (with 8 decimals precision)
        const displayVal = totalTickingPending.toFixed(8);
        const liveCounter = document.getElementById("live-mining-counter");
        const tabLiveCounter = document.getElementById("live-mining-tab-counter");

        if (liveCounter) liveCounter.innerHTML = `${displayVal} <span class="mining-ticker-symbol">POL</span>`;
        if (tabLiveCounter) tabLiveCounter.innerHTML = `${displayVal} <span class="mining-ticker-symbol">POL</span>`;

        // Update claimable display every ~30 seconds (every 300 ticks)
        miningTimer._tick = (miningTimer._tick || 0) + 1;
        if (miningTimer._tick % 300 === 0) {
            if (window.metapolApp && window.metapolApp.contract && window.metapolApp.userAddress) {
                window.metapolApp.contract.getPendingMining(window.metapolApp.userAddress).then(result => {
                    const netWei = result[2] !== undefined ? result[2] : result;
                    const claimableVal = parseFloat(ethers.formatEther(netWei)).toFixed(4);
                    const cl1 = document.getElementById("overview-claimable");
                    const cl2 = document.getElementById("mining-tab-claimable");
                    if (cl1) cl1.innerText = `${claimableVal} POL`;
                    if (cl2) cl2.innerText = `${claimableVal} POL`;
                    const ts = new Date().toLocaleTimeString();
                    const s1 = document.getElementById("overview-last-sync");
                    const s2 = document.getElementById("mining-tab-last-sync");
                    if (s1) s1.innerText = ts;
                    if (s2) s2.innerText = ts;
                }).catch(() => {});
            }
        }
    }, 100);
}

function stopMiningTimer() {
    if (miningTimer) {
        clearInterval(miningTimer);
        miningTimer = null;
    }
}

// Synchronize Upgrade Slots Tab
async function syncSlotsTab() {
    if (!window.metapolApp.isConnected) return;
    window.metapolApp.showLoader();

    try {
        const address = window.metapolApp.userAddress;
        const prices = window.CONFIG.LEVEL_PRICES;
        const thresholds = window.CONFIG.LEVEL_THRESHOLDS;

        const grid = document.getElementById("slots-cards-grid");
        grid.innerHTML = "";

        // Query active states for all slots
        const activeStatesPromises = [];
        const poolInfoPromises = [];
        for (let i = 1; i <= 12; i++) {
            activeStatesPromises.push(window.metapolApp.contract.isUserInSlot(address, i));
            poolInfoPromises.push(window.metapolApp.contract.getPoolUserInfo(i, address));
        }

        const activeStates = await Promise.all(activeStatesPromises);
        const poolInfos = await Promise.all(poolInfoPromises);

        for (let idx = 0; idx < 12; idx++) {
            const level = idx + 1;
            const price = prices[idx];
            const threshold = thresholds[idx];
            
            const isActive = activeStates[idx];
            const poolInfo = poolInfos[idx];
            const paymentsReceived = Number(poolInfo.payment_received);

            let status = "locked"; // locked, upgradeable, active
            if (isActive) {
                status = "active";
            } else {
                if (level === 1) {
                    status = "upgradeable";
                } else if (activeStates[idx - 1]) { // holding previous slot
                    status = "upgradeable";
                }
            }

            // Create Slot Card
            const card = document.createElement("div");
            card.className = `slot-card ${status}-slot`;
            
            let statusBadge = `<span class="slot-status-label slot-status-locked"><i class="fa-solid fa-lock"></i> Locked</span>`;
            if (status === "active") statusBadge = `<span class="slot-status-label slot-status-active"><i class="fa-solid fa-circle-check"></i> Active</span>`;
            if (status === "upgradeable") statusBadge = `<span class="slot-status-label slot-status-buy"><i class="fa-solid fa-cart-shopping"></i> Buy Slot</span>`;

            const miningAlloc = parseFloat(price) * 0.20;
            const miningCap = miningAlloc * 5;
            const progressPct = Math.min((paymentsReceived / threshold) * 100, 100);

            card.innerHTML = `
                <div class="slot-header">
                    <span class="slot-number">Slot Level ${level}</span>
                    ${statusBadge}
                </div>
                <div class="slot-price-row">
                    <span class="slot-price-label">Upgrade Price</span>
                    <div class="slot-price-val">${price} POL</div>
                </div>
                <div class="slot-details-list">
                    <div class="slot-detail-item">
                        <span class="slot-detail-lbl">Mining Allocation (20%):</span>
                        <span class="slot-detail-val">${miningAlloc.toFixed(1)} POL</span>
                    </div>
                    <div class="slot-detail-item">
                        <span class="slot-detail-lbl">Passive Mining Cap (5x):</span>
                        <span class="slot-detail-val">${miningCap.toFixed(1)} POL</span>
                    </div>
                    <div class="slot-detail-item">
                        <span class="slot-detail-lbl">Matrix Cycle Threshold:</span>
                        <span class="slot-detail-val">${threshold} Payments</span>
                    </div>
                </div>
                <div class="slot-progress-wrapper">
                    <div class="slot-progress-lbl-row">
                        <span>Cycle Progress</span>
                        <span>${paymentsReceived} / ${threshold}</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
                    </div>
                </div>
                <button class="btn btn-primary btn-slot-action" 
                        ${status !== 'upgradeable' ? 'disabled' : ''} 
                        onclick="executeSlotPurchase(${level}, '${price}')">
                    ${status === 'active' ? '<i class="fa-solid fa-circle-check"></i> Active' : status === 'locked' ? '<i class="fa-solid fa-lock"></i> Locked' : '<i class="fa-solid fa-angles-up"></i> Buy & Upgrade'}
                </button>
            `;

            grid.appendChild(card);
        }

    } catch (err) {
        console.error("Failed to sync slots layout:", err);
    } finally {
        window.metapolApp.hideLoader();
    }
}

// Synchronize matrix tab status and Queue line
async function syncMatrixTab(level) {
    if (!window.metapolApp.isConnected) return;
    
    try {
        const address = window.metapolApp.userAddress;
        const threshold = window.CONFIG.LEVEL_THRESHOLDS[level - 1];
        
        // 1. Get matrix statuses
        const [poolStatus, poolUserInfo] = await Promise.all([
            window.metapolApp.contract.getPoolStatus(level),
            window.metapolApp.contract.getPoolUserInfo(level, address)
        ]);

        const currID = Number(poolStatus[0]);
        const activeID = Number(poolStatus[1]);
        const activeUser = poolStatus[2];

        const isExist = poolUserInfo[0];
        const userIdInPool = Number(poolUserInfo[1]);
        const paymentsReceived = Number(poolUserInfo[2]);

        const positionCard = document.getElementById("matrix-user-position-card");

        if (isExist) {
            const pos = userIdInPool - activeID;
            let displayPos = pos >= 0 ? `${pos} users ahead` : "Cycling / Completed";
            if (pos === 0) displayPos = "Active Receiver ⚡";

            positionCard.innerHTML = `
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">ID #${userIdInPool}</div>
                <span style="font-size: 0.85rem; color: var(--accent); font-weight: 600; display: block; margin-top: 4px;">Queue Position: ${displayPos}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 4px;">Cycles Completed: ${paymentsReceived} / ${threshold} payments</span>
            `;
        } else {
            positionCard.innerHTML = `
                <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-muted);">Not Entered</div>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Purchase slot level to enter matrix.</span>
            `;
        }

        // 2. Render Queue visualizer
        const queueContainer = document.getElementById("matrix-queue-line-container");
        queueContainer.innerHTML = "";

        if (currID === 0) {
            queueContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; width: 100%;">Ecosystem pool empty.</div>`;
            return;
        }

        // We show the queue starting from activeID up to 8 positions
        const endNode = Math.min(activeID + 6, currID);
        for (let i = activeID; i <= endNode; i++) {
            // Fetch address at index i in poolUserList
            const addrAtNode = await window.metapolApp.contract.poolUserList(level - 1, i);
            const isUserNode = addrAtNode.toLowerCase() === address.toLowerCase();
            const isActiveNode = i === activeID;

            const node = document.createElement("div");
            node.className = `queue-node ${isActiveNode ? 'active' : ''} ${isUserNode ? 'user' : ''}`;
            node.innerHTML = `
                <span class="queue-node-id">#${i}</span>
                <span class="queue-node-lbl">${isActiveNode ? 'Active' : isUserNode ? 'You' : 'Queue'}</span>
            `;
            queueContainer.appendChild(node);

            // Add arrow if not last node
            if (i < endNode) {
                const arrow = document.createElement("div");
                arrow.className = "queue-arrow";
                arrow.innerHTML = `<i class="fa-solid fa-angles-right"></i>`;
                queueContainer.appendChild(arrow);
            }
        }

        // Show trailing dots if there are more nodes
        if (currID > endNode) {
            const arrow = document.createElement("div");
            arrow.className = "queue-arrow";
            arrow.innerHTML = `<i class="fa-solid fa-angles-right"></i>`;
            queueContainer.appendChild(arrow);

            const dots = document.createElement("div");
            dots.className = "queue-node";
            dots.style.opacity = "0.4";
            dots.innerHTML = `
                <span class="queue-node-id">+${currID - endNode}</span>
                <span class="queue-node-lbl">Nodes</span>
            `;
            queueContainer.appendChild(dots);
        }

    } catch (err) {
        console.error("Failed to sync matrix parameters:", err);
    }
}

// Synchronize Overview matrix slots list
async function syncOverviewMatrixList() {
    const list = document.getElementById("overview-matrix-slots-list");
    if (!list) return;

    try {
        const address = window.metapolApp.userAddress;
        
        // Loop active slots to show status in dashboard home
        const activeStatesPromises = [];
        const poolInfoPromises = [];
        for (let i = 1; i <= 12; i++) {
            activeStatesPromises.push(window.metapolApp.contract.isUserInSlot(address, i));
            poolInfoPromises.push(window.metapolApp.contract.getPoolUserInfo(i, address));
        }

        const activeStates = await Promise.all(activeStatesPromises);
        const poolInfos = await Promise.all(poolInfoPromises);

        let activeCount = 0;
        let htmlContent = "";

        for (let idx = 0; idx < 12; idx++) {
            if (activeStates[idx]) {
                activeCount++;
                const level = idx + 1;
                const threshold = window.CONFIG.LEVEL_THRESHOLDS[idx];
                const poolStatus = await window.metapolApp.contract.getPoolStatus(level);
                const activeID = Number(poolStatus[1]);
                
                const poolInfo = poolInfos[idx];
                const id = Number(poolInfo.id);
                const progress = Number(poolInfo.payment_received);
                const progressPct = Math.min((progress / threshold) * 100, 100);

                const ahead = id - activeID;
                let queuePos = ahead > 0 ? `${ahead} nodes ahead` : ahead === 0 ? "⚡ Receiving Payout" : "Completed";

                htmlContent += `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                            <span style="font-weight: 700; color: white;">Slot Level ${level}</span>
                            <span style="color: var(--accent); font-weight: 600;">${queuePos}</span>
                        </div>
                        <div class="progress-bar-container" style="height: 4px;">
                            <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
                        </div>
                    </div>
                `;
            }
        }

        if (activeCount > 0) {
            list.innerHTML = htmlContent;
        } else {
            list.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;">
                    No active slots purchased. Go to the slots tab to buy Slot 1.
                </div>
            `;
        }
    } catch (err) {
        console.error("Overview matrix list error:", err);
    }
}

// Synchronize Team Tab Referrals List
async function syncTeamTab() {
    if (!window.metapolApp.isConnected) return;
    window.metapolApp.showLoader();
    try {
        const address = window.metapolApp.userAddress;

        // ── Parallel event fetches ──
        const filterReg      = window.metapolApp.contract.filters.RegUser(null, address);
        const filterSponsor  = window.metapolApp.contract.filters.SponsorPaid(address);
        const filterUpgrade  = window.metapolApp.contract.filters.AutoUpgrade(address);
        const filterRepurch  = window.metapolApp.contract.filters.AutoRepurchase(address);
        const filterSkipped  = window.metapolApp.contract.filters.IncomeSkipped(null, null, address);

        const [regEvents, sponsorEvents, upgradeEvents, repurchEvents, skippedEvents] = await Promise.all([
            window.metapolApp.contract.queryFilter(filterReg, 0, "latest"),
            window.metapolApp.contract.queryFilter(filterSponsor, 0, "latest"),
            window.metapolApp.contract.queryFilter(filterUpgrade, 0, "latest"),
            window.metapolApp.contract.queryFilter(filterRepurch, 0, "latest").catch(() => []),
            window.metapolApp.contract.queryFilter(filterSkipped, 0, "latest").catch(() => [])
        ]);

        const directsCount  = regEvents.length;
        const autoUpgrades  = upgradeEvents.length;
        const autoRepurch   = repurchEvents.length;
        const incomeSkips   = skippedEvents.length;

        let totalSponsorPaid = 0n;
        sponsorEvents.forEach(ev => { totalSponsorPaid += ev.args.amount; });

        // ── Build per-referral commission map (user address → total POL earned) ──
        const commissionByUser = {};
        const commissionEvents = []; // sorted list for timeline
        sponsorEvents.forEach(ev => {
            const userAddr = ev.args.user.toLowerCase();
            const amt = ev.args.amount;
            const time = Number(ev.args.time || 0);
            if (!commissionByUser[userAddr]) commissionByUser[userAddr] = { total: 0n, count: 0, lastTime: 0 };
            commissionByUser[userAddr].total += amt;
            commissionByUser[userAddr].count++;
            if (time > commissionByUser[userAddr].lastTime) commissionByUser[userAddr].lastTime = time;
            commissionEvents.push({ userAddr, amt, time, txHash: ev.transactionHash });
        });
        // Sort newest first
        commissionEvents.sort((a, b) => b.time - a.time);

        // ── Per-member details ──
        const referralDetails = [];
        let totalTeamVolume = 0n;
        let totalTeamMining = 0n;
        let foundersCount = 0;
        const slotCounts = {}; // slot level => count of members who own it

        const SLOT_PRICES = [10,20,40,80,160,320,640,1280,2560,5120,10240,20480];

        for (let i = 0; i < regEvents.length; i += 8) {
            const batch = regEvents.slice(i, i + 8);
            const results = await Promise.all(batch.map(async ev => {
                const refAddr = ev.args.user;
                const refId   = Number(ev.args.userId);
                const regTime = Number(ev.args.time);
                const info    = await window.metapolApp.contract.getUserInfo(refAddr);
                const isFounder    = info[7];
                const miningDep    = info[5];
                const slotsInvested = miningDep * 5n;

                // Estimate highest slot from mining deposit
                const miningNum = parseFloat(ethers.formatEther(miningDep));
                // 20% of slot price goes to mining
                let highestSlot = 0;
                for (let s = SLOT_PRICES.length - 1; s >= 0; s--) {
                    if (miningNum >= SLOT_PRICES[s] * 0.2) { highestSlot = s + 1; break; }
                }
                if (highestSlot > 0) slotCounts[highestSlot] = (slotCounts[highestSlot] || 0) + 1;

                if (isFounder) foundersCount++;
                totalTeamMining += miningDep;

                return { id: refId, address: refAddr, addrLower: refAddr.toLowerCase(), date: new Date(regTime*1000).toLocaleDateString(), invested: slotsInvested, mining: miningDep, isFounder, highestSlot };
            }));
            results.forEach(r => { referralDetails.push(r); totalTeamVolume += r.invested; });
        }

        const commPOL   = parseFloat(ethers.formatEther(totalSponsorPaid)).toFixed(2);
        const volPOL    = parseFloat(ethers.formatEther(totalTeamVolume)).toFixed(2);
        const avgMining = directsCount > 0
            ? (parseFloat(ethers.formatEther(totalTeamMining)) / directsCount).toFixed(1)
            : "0";

        // ── Hero cards ──
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
        set("lhero-team-size",    directsCount);
        set("lhero-volume",       `${volPOL} POL`);
        set("lhero-earned",       `${commPOL} POL`);
        set("lhero-auto-upgrades", autoUpgrades);
        set("lhero-team-sub",     `${directsCount} direct member${directsCount !== 1 ? "s" : ""}`);

        // ── Performance stats ──
        set("lp-directs",     directsCount);
        set("lp-founders",    foundersCount);
        set("lp-upgrades",    autoUpgrades);
        set("lp-repurchases", autoRepurch);
        set("lp-avg-mining",  `${avgMining} POL`);
        set("lp-skipped",     incomeSkips);

        // ── Legacy IDs ──
        set("team-directs-count",  directsCount);
        set("team-total-count",    directsCount);
        set("team-total-earnings", `${commPOL} POL`);
        set("team-total-volume",   `${volPOL} POL`);

        // ── Leader Rank ──
        const ranks = [
            { min:0,  max:4,  icon:"🥉", title:"Building Leader",   color:"#CD7F32", next:"Silver Leader",   nextAt:5  },
            { min:5,  max:14, icon:"🥈", title:"Silver Leader",     color:"#C0C0C0", next:"Gold Leader",     nextAt:15 },
            { min:15, max:29, icon:"🥇", title:"Gold Leader",       color:"#FFD700", next:"Platinum Leader", nextAt:30 },
            { min:30, max:49, icon:"💎", title:"Platinum Leader",   color:"#00E5FF", next:"Diamond Leader",  nextAt:50 },
            { min:50, max:99, icon:"👑", title:"Diamond Leader",    color:"#FF00FF", next:"Crown Leader",    nextAt:100 },
            { min:100,max:Infinity, icon:"🌟", title:"Crown Leader",color:"#FFD700", next:"Max Rank",        nextAt:100 },
        ];
        const rank = ranks.find(r => directsCount >= r.min && directsCount <= r.max) || ranks[0];
        const pct  = rank.max === Infinity ? 100 : Math.min(100, Math.round(((directsCount - rank.min) / (rank.nextAt - rank.min)) * 100));
        set("leader-rank-icon",           rank.icon);
        set("leader-rank-title",          rank.title);
        set("leader-rank-desc",           `${rank.icon} ${rank.title} — keep growing!`);
        set("leader-rank-progress-label", `Next: ${rank.next}`);
        set("leader-rank-progress-pct",   `${pct}%`);
        set("leader-rank-hint",           rank.max === Infinity
            ? "You have reached the top rank! 🌟"
            : `Invite ${rank.nextAt - directsCount} more member${(rank.nextAt - directsCount) !== 1 ? "s" : ""} to reach ${rank.next}`);
        const fillEl = document.getElementById("leader-rank-fill");
        if (fillEl) { fillEl.style.width = pct + "%"; fillEl.style.background = `linear-gradient(90deg, ${rank.color}, ${rank.color}AA)`; }

        // ── Slot Distribution Bars ──
        const distEl = document.getElementById("slot-distribution-bars");
        if (distEl && Object.keys(slotCounts).length > 0) {
            const maxCount = Math.max(...Object.values(slotCounts));
            const barColors = ["#00FFD1","#00C8FF","#FFAA00","#A066FF","#FF6B6B","#00FF88","#FFD700","#FF69B4","#7FFFD4","#FF8C00","#DA70D6","#00BFFF"];
            distEl.innerHTML = Object.entries(slotCounts).sort((a,b)=>Number(a[0])-Number(b[0])).map(([slot, cnt]) => {
                const w = Math.max(6, Math.round((cnt / maxCount) * 100));
                const col = barColors[(Number(slot)-1) % barColors.length];
                return `<div style="display:flex; align-items:center; gap:8px; font-size:0.76rem;">
                    <span style="min-width:52px; color:rgba(255,255,255,0.5); font-family:var(--font-display); font-size:0.7rem;">Slot ${slot}</span>
                    <div style="flex:1; background:rgba(255,255,255,0.06); border-radius:6px; height:18px; overflow:hidden; position:relative;">
                        <div style="width:${w}%; height:100%; background:linear-gradient(90deg,${col}88,${col}); border-radius:6px; transition:width 0.8s ease;"></div>
                    </div>
                    <span style="min-width:22px; text-align:right; font-family:var(--font-display); font-weight:700; color:${col};">${cnt}</span>
                </div>`;
            }).join("");
        } else if (distEl) {
            distEl.innerHTML = `<div style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:16px 0;">No slot data yet</div>`;
        }

        // ── Table render ──
        window._teamData = referralDetails;
        window._commissionEvents = commissionEvents;
        window._commissionByUser = commissionByUser;
        renderTeamTable(referralDetails);
        renderInviteTracker(commissionEvents, referralDetails, totalSponsorPaid, directsCount);

    } catch(err) {
        console.error("Team tab error:", err);
    } finally {
        window.metapolApp.hideLoader();
    }
}

function renderTeamTable(data) {
    const tbody = document.getElementById("team-referrals-table-body");
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px 0;">No direct referrals yet. Share your link!</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(ref => {
        const pubCode = window.MetapolRef ? window.MetapolRef.idToCode(ref.id) : ref.id;
        const commData = window._commissionByUser ? window._commissionByUser[ref.addrLower] : null;
        const commPOL = commData ? parseFloat(ethers.formatEther(commData.total)).toFixed(2) : "0.00";
        return `
        <tr>
            <td style="font-family:var(--font-display); font-weight:700; color:var(--cyan);">#${pubCode}</td>
            <td><span class="wallet-badge" style="font-size:0.72rem;">${window.metapolApp.shortenAddress(ref.address)}</span></td>
            <td style="color:var(--text-muted); font-size:0.78rem;">${ref.date}</td>
            <td style="font-weight:700;">${parseFloat(ethers.formatEther(ref.invested)).toFixed(1)} POL</td>
            <td style="color:var(--teal); font-weight:700;">${parseFloat(ethers.formatEther(ref.mining)).toFixed(1)} POL</td>
            <td>
                ${ref.isFounder
                    ? '<span class="slot-status-label slot-status-active" style="font-size:0.65rem;"><i class="fa-solid fa-crown"></i> Founder</span>'
                    : '<span class="slot-status-label slot-status-locked" style="font-size:0.65rem;">Standard</span>'}
            </td>
        </tr>`}).join("");
}

function sortTeamTable(by) {
    const data = window._teamData || [];
    if (!data.length) return;
    const sorted = [...data];
    if (by === "volume") sorted.sort((a,b) => Number(b.invested - a.invested));
    else if (by === "founder") sorted.sort((a,b) => (b.isFounder ? 1 : 0) - (a.isFounder ? 1 : 0));
    else sorted.sort((a,b) => a.id - b.id);
    renderTeamTable(sorted);
}


// Synchronize Activity timeline
async function syncActivityTab() {
    if (!window.metapolApp.isConnected) return;
    window.metapolApp.showLoader();

    try {
        const address = window.metapolApp.userAddress.toLowerCase();
        const logsContainer = document.getElementById("personal-activity-logs-container");
        logsContainer.innerHTML = "";

        // Query events: MiningDeposit, MiningWithdraw, CycleProfit, AutoUpgrade, RegUser
        // Ethers filters allow querying past blocks. To keep loading times fast, query last 10,000 blocks or simple queries.
        // We will fetch queries in parallel
        const filterMiningDep = window.metapolApp.contract.filters.MiningDeposit(address);
        const filterMiningWith = window.metapolApp.contract.filters.MiningWithdraw(address);
        const filterCycle = window.metapolApp.contract.filters.CycleProfit(address);
        const filterUpgrade = window.metapolApp.contract.filters.AutoUpgrade(address);
        const filterReg = window.metapolApp.contract.filters.RegUser(address);

        const [depEvents, withEvents, cycleEvents, upgEvents, regEvents] = await Promise.all([
            window.metapolApp.contract.queryFilter(filterMiningDep, 0, "latest"),
            window.metapolApp.contract.queryFilter(filterMiningWith, 0, "latest"),
            window.metapolApp.contract.queryFilter(filterCycle, 0, "latest"),
            window.metapolApp.contract.queryFilter(filterUpgrade, 0, "latest"),
            window.metapolApp.contract.queryFilter(filterReg, 0, "latest")
        ]);

        const allLogs = [];

        depEvents.forEach(e => {
            allLogs.push({
                type: "mining_deposit",
                icon: "fa-bolt",
                class: "reg",
                text: `Mining Deposit initialized: <strong>${parseFloat(ethers.formatEther(e.args.capital)).toFixed(2)} POL</strong> (Cap: ${parseFloat(ethers.formatEther(e.args.cap)).toFixed(2)} POL)`,
                time: Number(e.args.time)
            });
        });

        withEvents.forEach(e => {
            allLogs.push({
                type: "mining_withdraw",
                icon: "fa-circle-down",
                class: "claim",
                text: `Mining Rewards Claimed: Gross <strong>${parseFloat(ethers.formatEther(e.args.grossAmount)).toFixed(2)} POL</strong> (Net: ${parseFloat(ethers.formatEther(e.args.netAmount)).toFixed(2)} POL)`,
                time: Number(e.args.time)
            });
        });

        cycleEvents.forEach(e => {
            allLogs.push({
                type: "cycle_profit",
                icon: "fa-rotate",
                class: "upgrade",
                text: `Completed Slot level ${e.args.level} Matrix cycle! Earnings payout: <strong>${parseFloat(ethers.formatEther(e.args.profit)).toFixed(2)} POL</strong>`,
                time: Number(e.args.time)
            });
        });

        upgEvents.forEach(e => {
            allLogs.push({
                type: "auto_upgrade",
                icon: "fa-angles-up",
                class: "buy",
                text: `Auto-Upgrade triggered: Upgraded from level ${e.args.fromLevel} to ${e.args.toLevel} (Price: ${parseFloat(ethers.formatEther(e.args.amount)).toFixed(2)} POL)`,
                time: Number(e.args.time)
            });
        });

        regEvents.forEach(e => {
            allLogs.push({
                type: "register",
                icon: "fa-user-check",
                class: "reg",
                text: `Registered account on MetaPOL ecosystem! ID #${e.args.userId} created. Fee: 5.0 POL`,
                time: Number(e.args.time)
            });
        });

        // Sort descending by time
        allLogs.sort((a, b) => b.time - a.time);

        allLogs.forEach(log => {
            const date = new Date(log.time * 1000).toLocaleString();
            const logItem = document.createElement("div");
            logItem.className = "activity-item";
            logItem.innerHTML = `
                <div class="activity-icon-bullet ${log.class}">
                    <i class="fa-solid ${log.icon}"></i>
                </div>
                <div class="activity-details">
                    <div class="activity-txt">${log.text}</div>
                    <div class="activity-time">${date}</div>
                </div>
            `;
            logsContainer.appendChild(logItem);
        });

        if (allLogs.length === 0) {
            logsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 40px 0;">No personal smart contract history logs found.</div>`;
        }

    } catch (err) {
        console.error("Activity sync failed:", err);
    } finally {
        window.metapolApp.hideLoader();
    }
}

// Upgrade Slot execution call
async function executeSlotPurchase(level, priceEth) {
    const txModal = document.getElementById("tx-modal");
    const txLoading = document.getElementById("tx-loading-state");
    const txSuccess = document.getElementById("tx-success-state");
    const txFail = document.getElementById("tx-fail-state");
    const txHashContainer = document.getElementById("tx-hash-container");
    const txErrorMsg = document.getElementById("tx-error-msg");
    const loadingTitle = document.getElementById("tx-loading-title");

    txModal.classList.add("active");
    txLoading.style.display = "block";
    txSuccess.style.display = "none";
    txFail.style.display = "none";
    loadingTitle.innerText = `Upgrading to Level ${level}`;
    txHashContainer.innerText = "Awaiting wallet authorization...";

    try {
        const price = ethers.parseEther(priceEth);

        // Fetch user balance
        const balance = await window.metapolApp.provider.getBalance(window.metapolApp.userAddress);
        if (balance < price) {
            throw new Error(`Insufficient POL balance to purchase Slot Level ${level} (${priceEth} POL needed).`);
        }

        // Send transaction based on level
        let tx;
        if (level === 1) {
            let gasLimit;
            try {
                gasLimit = await window.metapolApp.contract.buySlot1.estimateGas({ value: price });
                gasLimit = (gasLimit * 120n) / 100n; // buffer
            } catch (err) {
                gasLimit = 200000n;
            }
            tx = await window.metapolApp.contract.buySlot1({ value: price, gasLimit: gasLimit });
        } else {
            let gasLimit;
            try {
                gasLimit = await window.metapolApp.contract.buyLevel.estimateGas(level, { value: price });
                gasLimit = (gasLimit * 120n) / 100n; // buffer
            } catch (err) {
                gasLimit = 220000n;
            }
            tx = await window.metapolApp.contract.buyLevel(level, { value: price, gasLimit: gasLimit });
        }

        console.log(`Dispatched level ${level} upgrade transaction:`, tx.hash);
        txHashContainer.innerHTML = `Hash: <a href="${window.CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank" style="color: var(--primary); text-decoration: underline;">${tx.hash}</a>`;

        const receipt = await tx.wait();
        if (receipt.status === 1) {
            txLoading.style.display = "none";
            txSuccess.style.display = "block";
            document.getElementById("tx-explorer-link").href = `${window.CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}`;
            window.metapolApp.showToast(`Successfully purchased Slot level ${level}!`, "success");
            
            // Reload slot tab
            setTimeout(() => {
                syncSlotsTab();
                syncDashboardData();
            }, 500);
        } else {
            throw new Error("Transaction was reverted by EVM network node.");
        }

    } catch (err) {
        console.error("Upgrade slot error:", err);
        txLoading.style.display = "none";
        txFail.style.display = "block";
        
        let friendlyMsg = err.message;
        if (err.code === "ACTION_REJECTED") {
            friendlyMsg = "Transaction authorization rejected in wallet app.";
        } else if (err.message && err.message.includes("insufficient funds")) {
            friendlyMsg = "Insufficient wallet balance to pay the slot price and network gas.";
        }
        txErrorMsg.innerText = friendlyMsg;
        window.metapolApp.showToast("Slot Upgrade purchase failed.", "error");
    }
}

// Claim Mining Rewards
async function executeClaimMining() {
    const pendingGross = await window.metapolApp.contract.getPendingMining(window.metapolApp.userAddress);
    const grossEth = Number(ethers.formatEther(pendingGross[0]));

    if (grossEth <= 0) {
        window.metapolApp.showToast("No claimable passive mining rewards available at this block.", "warning");
        return;
    }

    const txModal = document.getElementById("tx-modal");
    const txLoading = document.getElementById("tx-loading-state");
    const txSuccess = document.getElementById("tx-success-state");
    const txFail = document.getElementById("tx-fail-state");
    const txHashContainer = document.getElementById("tx-hash-container");
    const txErrorMsg = document.getElementById("tx-error-msg");
    const loadingTitle = document.getElementById("tx-loading-title");

    txModal.classList.add("active");
    txLoading.style.display = "block";
    txSuccess.style.display = "none";
    txFail.style.display = "none";
    loadingTitle.innerText = "Claiming Mining Rewards";
    txHashContainer.innerText = "Estimating gas limits...";

    try {
        // Gas Estimation
        let gasLimit;
        try {
            gasLimit = await window.metapolApp.contract.withdrawMining.estimateGas();
            gasLimit = (gasLimit * 120n) / 100n; // buffer
        } catch (err) {
            gasLimit = 180000n; // safe default for withdrawals
        }

        const tx = await window.metapolApp.contract.withdrawMining({ gasLimit: gasLimit });
        console.log("Withdraw claim transaction dispatched:", tx.hash);
        txHashContainer.innerHTML = `Hash: <a href="${window.CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank" style="color: var(--primary); text-decoration: underline;">${tx.hash}</a>`;

        const receipt = await tx.wait();
        if (receipt.status === 1) {
            txLoading.style.display = "none";
            txSuccess.style.display = "block";
            document.getElementById("tx-explorer-link").href = `${window.CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}`;
            window.metapolApp.showToast(`Claim success! Withdrew ${grossEth.toFixed(4)} POL.`, "success");
            
            // Reload mining values
            setTimeout(() => {
                syncMiningData();
                syncDashboardData();
            }, 500);
        } else {
            throw new Error("Transaction was reverted by the EVM network.");
        }
    } catch (err) {
        console.error("Claim withdrawal error:", err);
        txLoading.style.display = "none";
        txFail.style.display = "block";

        let friendlyMsg = err.message;
        if (err.code === "ACTION_REJECTED") {
            friendlyMsg = "Claim transaction rejected in wallet browser.";
        }
        txErrorMsg.innerText = friendlyMsg;
        window.metapolApp.showToast("Claim transaction failed.", "error");
    }
}

// Copy referral Link
function copyReferralLink() {
    const input = document.getElementById("referral-link-input");
    if (!window.metapolApp.isConnected || userMemberId === 0) {
        window.metapolApp.showToast("Connect wallet to generate referral link", "warning");
        return;
    }

    input.select();
    input.setSelectionRange(0, 99999); // Mobile
    navigator.clipboard.writeText(input.value);

    window.metapolApp.showToast("Referral link copied to clipboard!", "success");
}

// Quick bar copy (header referral strip)
function copyReferralLinkQuick() {
    const link = window._cachedReferralLink || document.getElementById("referral-link-input")?.value;
    if (!link || !window.metapolApp.isConnected || userMemberId === 0) {
        window.metapolApp.showToast("Connect wallet to generate referral link", "warning");
        return;
    }
    navigator.clipboard.writeText(link).then(() => {
        const icon = document.getElementById("referral-quick-copy-icon");
        const txt  = document.getElementById("referral-quick-copy-text");
        if (icon) { icon.className = "fa-solid fa-check"; }
        if (txt)  { txt.textContent = "Copied!"; }
        window.metapolApp.showToast("Referral link copied!", "success");
        setTimeout(() => {
            if (icon) icon.className = "fa-solid fa-copy";
            if (txt)  txt.textContent = "Copy";
        }, 2000);
    });
}

// Share referral link to social chats
function shareReferral(platform) {
    if (!window.metapolApp.isConnected || userMemberId === 0) {
        window.metapolApp.showToast("Connect wallet to share referral link", "warning");
        return;
    }

    const referralLink = encodeURIComponent(document.getElementById("referral-link-input").value);
    let shareUrl = "";

    if (platform === "whatsapp") {
        const text = encodeURIComponent(window.CONFIG.SHARE_TEMPLATES.whatsapp) + referralLink;
        shareUrl = `https://api.whatsapp.com/send?text=${text}`;
    } else if (platform === "telegram") {
        const text = encodeURIComponent(window.CONFIG.SHARE_TEMPLATES.telegram) + referralLink;
        shareUrl = `https://t.me/share/url?url=${referralLink}&text=${encodeURIComponent(window.CONFIG.SHARE_TEMPLATES.telegram)}`;
    } else if (platform === "twitter") {
        const text = encodeURIComponent(window.CONFIG.SHARE_TEMPLATES.twitter) + referralLink;
        shareUrl = `https://twitter.com/intent/tweet?text=${text}`;
    } else if (platform === "facebook") {
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${referralLink}`;
    }

    window.open(shareUrl, "_blank");
}

function closeTxModal() {
    document.getElementById("tx-modal").classList.remove("active");
}

/* ============================================================
   SIDEBAR TOGGLE — hideable drawer, all screen sizes
   ============================================================ */
function toggleSidebar() {
    const sidebar  = document.getElementById("dash-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const btn      = document.getElementById("sidebar-toggle-btn");
    const layout   = document.getElementById("dashboard-layout-wrapper");
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains("sidebar-open");
    if (isOpen) { closeSidebar(); } else {
        sidebar.classList.add("sidebar-open");
        if (backdrop) backdrop.classList.add("visible");
        if (btn) btn.classList.add("toggled");
        if (layout) layout.classList.add("sidebar-visible");
        localStorage.setItem("metapol_sidebar", "open");
    }
}

function closeSidebar() {
    const sidebar  = document.getElementById("dash-sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const btn      = document.getElementById("sidebar-toggle-btn");
    const layout   = document.getElementById("dashboard-layout-wrapper");
    if (!sidebar) return;
    sidebar.classList.remove("sidebar-open");
    if (backdrop) backdrop.classList.remove("visible");
    if (btn) btn.classList.remove("toggled");
    if (layout) layout.classList.remove("sidebar-visible");
    localStorage.setItem("metapol_sidebar", "closed");
}

document.addEventListener("DOMContentLoaded", () => {
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
        // Desktop: sidebar always visible via CSS, no JS needed
        const l = document.getElementById("dashboard-layout-wrapper");
        if (l) l.classList.add("sidebar-visible");
    }
    // Mobile: always starts closed, hamburger opens it
    // Close sidebar when nav link clicked on mobile
    document.querySelectorAll(".sidebar-link").forEach(link => {
        link.addEventListener("click", () => { if (window.innerWidth < 1024) closeSidebar(); });
    });
});

window.addEventListener("resize", () => {
    if (window.innerWidth >= 1024) {
        const backdrop = document.getElementById("sidebar-backdrop");
        if (backdrop) backdrop.classList.remove("visible");
    }
});

/* ============================================================
   INVITE TRACKER — commission feed per referral member
   ============================================================ */

function renderInviteTracker(events, referralDetails, totalSponsorPaid, directsCount) {
    const feed     = document.getElementById("invite-tracker-feed");
    const totalEl  = document.getElementById("itrack-total");
    const countEl  = document.getElementById("itrack-count");
    const avgEl    = document.getElementById("itrack-avg");
    if (!feed) return;

    const totalPOL = parseFloat(ethers.formatEther(totalSponsorPaid));
    const avg      = directsCount > 0 ? (totalPOL / directsCount).toFixed(2) : "0.00";

    if (totalEl) totalEl.textContent  = `${totalPOL.toFixed(2)} POL`;
    if (countEl) countEl.textContent  = directsCount;
    if (avgEl)   avgEl.textContent    = `${avg} POL`;

    if (!events || events.length === 0) {
        feed.innerHTML = `
            <div class="invite-tracker-empty">
                <i class="fa-solid fa-satellite-dish"></i>
                <span>No commissions yet — share your referral link to start earning!</span>
            </div>`;
        return;
    }

    // Build address → contractId map from referralDetails
    const addrToId = {};
    referralDetails.forEach(r => { addrToId[r.addrLower] = r.id; });

    // Group events by user for the feed
    const byUser = {};
    events.forEach(ev => {
        const key = ev.userAddr;
        if (!byUser[key]) byUser[key] = { userAddr: key, total: 0n, count: 0, lastTime: ev.time, lastTx: ev.txHash };
        byUser[key].total += ev.amt;
        byUser[key].count++;
        if (ev.time > byUser[key].lastTime) { byUser[key].lastTime = ev.time; byUser[key].lastTx = ev.txHash; }
    });

    // Sort by most recent
    const rows = Object.values(byUser).sort((a, b) => b.lastTime - a.lastTime);

    const now = Math.floor(Date.now() / 1000);

    function timeAgo(ts) {
        if (!ts) return "—";
        const diff = now - ts;
        if (diff < 60)           return "just now";
        if (diff < 3600)         return `${Math.floor(diff/60)}m ago`;
        if (diff < 86400)        return `${Math.floor(diff/3600)}h ago`;
        if (diff < 86400*30)     return `${Math.floor(diff/86400)}d ago`;
        if (diff < 86400*365)    return `${Math.floor(diff/2592000)}mo ago`;
        return `${Math.floor(diff/31536000)}y ago`;
    }

    function rankColor(pol) {
        if (pol >= 100) return { color: "#FFD700", bg: "rgba(255,215,0,0.1)",  border: "rgba(255,215,0,0.3)",  label: "Gold",     icon: "👑" };
        if (pol >= 50)  return { color: "#C0C0C0", bg: "rgba(192,192,192,0.08)", border: "rgba(192,192,192,0.25)", label: "Silver", icon: "🥈" };
        if (pol >= 10)  return { color: "#00FFD1", bg: "rgba(0,255,209,0.07)",  border: "rgba(0,255,209,0.25)",  label: "Active",  icon: "⚡" };
        return            { color: "#00C8FF", bg: "rgba(0,200,255,0.06)",  border: "rgba(0,200,255,0.2)",  label: "New",     icon: "🌱" };
    }

    const explorerBase = window.CONFIG?.BLOCK_EXPLORER || "https://polygonscan.com";

    feed.innerHTML = rows.map((row, idx) => {
        const contractId  = addrToId[row.userAddr];
        const pubCode     = contractId && window.MetapolRef ? window.MetapolRef.idToCode(contractId) : null;
        const displayCode = pubCode ? `#${pubCode}` : `#——`;
        const pol         = parseFloat(ethers.formatEther(row.total));
        const rank        = rankColor(pol);
        const timeStr     = timeAgo(row.lastTime);
        const txUrl       = row.lastTx ? `${explorerBase}/tx/${row.lastTx}` : "#";

        // Percentage share of total
        const pct = totalPOL > 0 ? Math.round((pol / totalPOL) * 100) : 0;

        return `
        <div class="itrack-row" style="animation-delay:${idx * 60}ms">
            <!-- Rank icon -->
            <div class="itrack-rank-icon" title="${rank.label}" style="background:${rank.bg}; border-color:${rank.border};">
                ${rank.icon}
            </div>

            <!-- Member info -->
            <div class="itrack-member">
                <div class="itrack-member-code" style="color:${rank.color};">${displayCode}</div>
                <div class="itrack-member-meta">
                    <span>${row.count} payment${row.count !== 1 ? "s" : ""}</span>
                    <span class="itrack-dot">·</span>
                    <span>${timeStr}</span>
                </div>
            </div>

            <!-- Progress bar + amount -->
            <div class="itrack-amount-col">
                <div class="itrack-amount" style="color:${rank.color};">+${pol.toFixed(2)} POL</div>
                <div class="itrack-bar-wrap">
                    <div class="itrack-bar-fill" style="width:${pct}%; background:linear-gradient(90deg,${rank.color}88,${rank.color});"></div>
                </div>
                <div class="itrack-pct">${pct}% of total</div>
            </div>

            <!-- Polygonscan link -->
            <a class="itrack-tx-link" href="${txUrl}" target="_blank" title="View on Polygonscan">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
        </div>`;
    }).join("");
}
