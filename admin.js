/**
 * MetaPOL Admin Back-Office Logic
 * Correct ABI calls: grantFounderStatus(addr, fromLevel, toLevel)
 *                    upgradeFounderSlots(addr, fromLevel, toLevel)
 */

document.addEventListener('DOMContentLoaded', () => {

    // Intercept updateWalletUI to gate the admin panel on owner verification
    const origUpdateUI = window.metapolApp.updateWalletUI.bind(window.metapolApp);
    window.metapolApp.updateWalletUI = async function () {
        origUpdateUI();

        const overlay   = document.getElementById('connect-prompt-overlay');
        const panel     = document.getElementById('admin-panel');
        const title     = document.getElementById('prompt-title');
        const sub       = document.getElementById('prompt-sub');

        if (!this.isConnected) {
            showOverlay(overlay, panel);
            if (title) title.textContent = 'Admin Restricted Access';
            if (sub)   sub.innerHTML     = 'This portal is strictly authorized for the smart contract owner wallet only.';
            return;
        }

        // Hide panel immediately until owner confirmed
        if (panel)   panel.style.display   = 'none';
        if (overlay) overlay.style.display = 'flex';

        try {
            const owner   = await this.contract.ownerWallet();
            const isOwner = this.userAddress.toLowerCase() === owner.toLowerCase();

            if (isOwner) {
                if (overlay) overlay.style.display = 'none';
                if (panel)   panel.style.display   = 'block';
                const ownerEl = document.getElementById('admin-owner-wallet');
                if (ownerEl) ownerEl.textContent = this.userAddress;
                syncAdminData();
            } else {
                showOverlay(overlay, panel);
                if (title) title.textContent = 'Access Denied';
                if (sub)   sub.innerHTML     = `Connected wallet is not the contract owner.<br><small style="font-family:monospace;color:var(--danger);word-break:break-all;">${this.userAddress}</small>`;
            }
        } catch (err) {
            console.error('Owner check failed:', err);
            showOverlay(overlay, panel);
            if (title) title.textContent = 'Verification Error';
            if (sub)   sub.innerHTML     = 'Could not verify owner status. Check your network connection.';
        }
    };

    function showOverlay(overlay, panel) {
        if (overlay) overlay.style.display = 'flex';
        if (panel)   panel.style.display   = 'none';
    }
});

/* ── Sync Stats ── */
window.syncAdminData = async function () {
    if (!window.metapolApp.isConnected) return;
    window.metapolApp.showLoader();

    try {
        const contract  = window.metapolApp.contract;
        const provider  = window.metapolApp.provider;

        const [totalUsers, totalMining, contractBalance, totalFees] = await Promise.all([
            contract.currUserID(),
            contract.totalMiningDeposited(),
            provider.getBalance(window.CONFIG.CONTRACT_ADDRESS),
            contract.totalAdminFees()
        ]);

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('admin-total-users',    Number(totalUsers).toLocaleString());
        set('admin-total-mining',   `${parseFloat(ethers.formatEther(totalMining)).toFixed(2)} POL`);
        set('admin-contract-balance', `${parseFloat(ethers.formatEther(contractBalance)).toFixed(2)} POL`);
        set('admin-total-fees',     `${parseFloat(ethers.formatEther(totalFees)).toFixed(2)} POL`);

        await syncGlobalEvents();

    } catch (err) {
        console.error('Admin sync failed:', err);
        window.metapolApp.showToast('Failed to sync back-office stats', 'error');
    } finally {
        window.metapolApp.hideLoader();
    }
};

/* ── Validate Grant (must be unregistered) ── */
window.validateGrantAddress = async function (address) {
    const hint = document.getElementById('grant-verify-hint');
    const btn  = document.getElementById('btn-grant-founder');
    if (!hint || !btn) return;

    if (!address) {
        hint.innerHTML = 'Enter a wallet address to validate';
        btn.disabled = true; return;
    }
    if (!ethers.isAddress(address)) {
        hint.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Invalid EVM address format`;
        btn.disabled = true; return;
    }

    hint.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking…`;
    try {
        const info = await window.metapolApp.contract.getUserInfo(address);
        const isReg = info[0];
        if (isReg) {
            hint.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Address is already registered — use Upgrade Founder Slots instead`;
            btn.disabled = true;
        } else {
            hint.innerHTML = `<i class="fa-solid fa-circle-check text-accent"></i> Valid — unregistered address, ready to onboard as Founder`;
            btn.disabled = false;
        }
    } catch {
        hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i> Could not check address`;
        btn.disabled = false;
    }
};

/* ── Validate Upgrade (must be existing founder) ── */
window.validateUpgradeAddress = async function (address) {
    const hint = document.getElementById('upgrade-verify-hint');
    const btn  = document.getElementById('btn-upgrade-founder');
    if (!hint || !btn) return;

    if (!address) {
        hint.innerHTML = 'Enter a founder wallet address to validate';
        btn.disabled = true; return;
    }
    if (!ethers.isAddress(address)) {
        hint.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Invalid EVM address format`;
        btn.disabled = true; return;
    }

    hint.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking…`;
    try {
        const info = await window.metapolApp.contract.getUserInfo(address);
        const isReg     = info[0];
        const isFounder = info[4];
        if (!isReg) {
            hint.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Address is not registered — use Grant Founder Status instead`;
            btn.disabled = true;
        } else if (!isFounder) {
            hint.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Registered but not a Founder — use Grant Founder Status first`;
            btn.disabled = true;
        } else {
            hint.innerHTML = `<i class="fa-solid fa-circle-check text-accent"></i> Valid — confirmed existing Founder, ready to upgrade slots`;
            btn.disabled = false;
        }
    } catch {
        hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i> Could not check address`;
        btn.disabled = false;
    }
};

/* ── Execute Grant Founder Status ── */
window.executeGrantFounder = async function () {
    const addr      = document.getElementById('input-grant-addr').value.trim();
    const fromLevel = parseInt(document.getElementById('grant-from-level').value);
    const toLevel   = parseInt(document.getElementById('grant-to-level').value);

    if (!ethers.isAddress(addr)) {
        window.metapolApp.showToast('Invalid wallet address', 'error'); return;
    }
    if (fromLevel > toLevel) {
        window.metapolApp.showToast('From Level must be ≤ To Level', 'error'); return;
    }

    openTxModal('Granting Founder Status…');
    try {
        let gasLimit;
        try {
            gasLimit = await window.metapolApp.contract.grantFounderStatus.estimateGas(addr, fromLevel, toLevel);
            gasLimit = (gasLimit * 130n) / 100n;
        } catch { gasLimit = 500000n; }

        const tx = await window.metapolApp.contract.grantFounderStatus(addr, fromLevel, toLevel, { gasLimit });
        setTxHash(tx.hash);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            showTxSuccess(tx.hash);
            window.metapolApp.showToast('Founder status granted successfully!', 'success');
            document.getElementById('input-grant-addr').value = '';
            document.getElementById('grant-verify-hint').textContent = 'Enter a wallet address to validate';
            document.getElementById('btn-grant-founder').disabled = true;
            setTimeout(syncAdminData, 1000);
        } else {
            throw new Error('Transaction reverted by contract');
        }
    } catch (err) {
        console.error('Grant founder failed:', err);
        showTxFail(err.code === 'ACTION_REJECTED' ? 'Transaction rejected in wallet.' : err.message);
        window.metapolApp.showToast('Grant failed', 'error');
    }
};

/* ── Execute Upgrade Founder Slots ── */
window.executeUpgradeFounder = async function () {
    const addr      = document.getElementById('input-upgrade-addr').value.trim();
    const fromLevel = parseInt(document.getElementById('upgrade-from-level').value);
    const toLevel   = parseInt(document.getElementById('upgrade-to-level').value);

    if (!ethers.isAddress(addr)) {
        window.metapolApp.showToast('Invalid wallet address', 'error'); return;
    }
    if (fromLevel > toLevel) {
        window.metapolApp.showToast('From Level must be ≤ To Level', 'error'); return;
    }

    openTxModal('Upgrading Founder Slots…');
    try {
        let gasLimit;
        try {
            gasLimit = await window.metapolApp.contract.upgradeFounderSlots.estimateGas(addr, fromLevel, toLevel);
            gasLimit = (gasLimit * 130n) / 100n;
        } catch { gasLimit = 500000n; }

        const tx = await window.metapolApp.contract.upgradeFounderSlots(addr, fromLevel, toLevel, { gasLimit });
        setTxHash(tx.hash);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            showTxSuccess(tx.hash);
            window.metapolApp.showToast('Founder slots upgraded successfully!', 'success');
            document.getElementById('input-upgrade-addr').value = '';
            document.getElementById('upgrade-verify-hint').textContent = 'Enter a founder wallet address to validate';
            document.getElementById('btn-upgrade-founder').disabled = true;
            setTimeout(syncAdminData, 1000);
        } else {
            throw new Error('Transaction reverted by contract');
        }
    } catch (err) {
        console.error('Upgrade founder failed:', err);
        showTxFail(err.code === 'ACTION_REJECTED' ? 'Transaction rejected in wallet.' : err.message);
        window.metapolApp.showToast('Upgrade failed', 'error');
    }
};

/* ── Global Events Timeline ── */
async function syncGlobalEvents() {
    const container = document.getElementById('global-activity-logs-container');
    if (!container) return;

    container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:30px;"><i class="fa-solid fa-spinner fa-spin"></i> Scanning blocks…</div>`;

    try {
        const contract = window.metapolApp.contract;
        const currentBlock = await window.metapolApp.provider.getBlockNumber();
        const startBlock   = Math.max(window.CONFIG.CONTRACT_DEPLOY_BLOCK, currentBlock - 5000);

        const [regEvents, slotEvents, withdrawEvents, founderGrantedEvents, founderUpgradedEvents] = await Promise.all([
            contract.queryFilter(contract.filters.RegUser(),             startBlock, 'latest'),
            contract.queryFilter(contract.filters.RegPoolEntry(),        startBlock, 'latest'),
            contract.queryFilter(contract.filters.MiningWithdraw(),      startBlock, 'latest'),
            contract.queryFilter(contract.filters.FounderGranted(),      startBlock, 'latest'),
            contract.queryFilter(contract.filters.FounderSlotsUpgraded(),startBlock, 'latest').catch(() => [])
        ]);

        const logs = [];

        regEvents.forEach(e => logs.push({
            icon: 'fa-user-plus', cls: 'reg',
            html: `<strong>${shortAddr(e.args.user)}</strong> registered — Member ID #${e.args.userId}`,
            time: Number(e.args.time)
        }));

        slotEvents.forEach(e => logs.push({
            icon: 'fa-layer-group', cls: 'buy',
            html: `<strong>${shortAddr(e.args.user)}</strong> entered Slot ${e.args.level} pool (Slot ID #${e.args.slotId}) — ${parseFloat(ethers.formatEther(e.args.value ?? 0n)).toFixed(2)} POL`,
            time: Number(e.args.time)
        }));

        withdrawEvents.forEach(e => logs.push({
            icon: 'fa-circle-down', cls: 'claim',
            html: `<strong>${shortAddr(e.args.user)}</strong> withdrew mining rewards — ${parseFloat(ethers.formatEther(e.args.netAmount ?? 0n)).toFixed(2)} POL net`,
            time: Number(e.args.time)
        }));

        founderGrantedEvents.forEach(e => logs.push({
            icon: 'fa-crown', cls: 'upgrade',
            html: `<strong>${shortAddr(e.args.addr)}</strong> granted Founder status — slots ${e.args.fromLevel}→${e.args.toLevel} (ID #${e.args.userId})`,
            time: Number(e.args.time)
        }));

        founderUpgradedEvents.forEach(e => logs.push({
            icon: 'fa-arrow-up-right-dots', cls: 'upgrade',
            html: `<strong>${shortAddr(e.args.addr)}</strong> upgraded Founder slots — ${e.args.fromLevel}→${e.args.toLevel}`,
            time: Number(e.args.time)
        }));

        logs.sort((a, b) => b.time - a.time);
        const display = logs.slice(0, 60);

        if (display.length === 0) {
            container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:0.85rem;">No activity in the last 5,000 blocks.</div>`;
            return;
        }

        container.innerHTML = '';
        display.forEach(log => {
            const date = new Date(log.time * 1000).toLocaleString();
            const el   = document.createElement('div');
            el.className = 'activity-item';
            el.innerHTML = `
                <div class="activity-icon-bullet ${log.cls}"><i class="fa-solid ${log.icon}"></i></div>
                <div class="activity-details">
                    <div class="activity-txt">${log.html}</div>
                    <div class="activity-time">${date}</div>
                </div>`;
            container.appendChild(el);
        });

    } catch (err) {
        console.error('Global events failed:', err);
        container.innerHTML = `<div style="text-align:center;color:rgba(255,80,80,0.7);padding:30px;font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load events. Try Refresh.</div>`;
    }
}

/* ── TX Modal helpers ── */
function openTxModal(title) {
    document.getElementById('tx-modal').classList.add('active');
    document.getElementById('tx-loading-state').style.display = 'block';
    document.getElementById('tx-success-state').style.display = 'none';
    document.getElementById('tx-fail-state').style.display    = 'none';
    document.getElementById('tx-loading-title').textContent   = title;
    document.getElementById('tx-hash-container').textContent  = 'Estimating gas…';
}
function setTxHash(hash) {
    document.getElementById('tx-hash-container').innerHTML =
        `Hash: <a href="${window.CONFIG.BLOCK_EXPLORER}/tx/${hash}" target="_blank" style="color:var(--primary);">${hash}</a>`;
}
function showTxSuccess(hash) {
    document.getElementById('tx-loading-state').style.display = 'none';
    document.getElementById('tx-success-state').style.display = 'block';
    document.getElementById('tx-explorer-link').href = `${window.CONFIG.BLOCK_EXPLORER}/tx/${hash}`;
}
function showTxFail(msg) {
    document.getElementById('tx-loading-state').style.display = 'none';
    document.getElementById('tx-fail-state').style.display    = 'block';
    document.getElementById('tx-error-msg').textContent       = msg;
}
window.closeTxModal = function () {
    document.getElementById('tx-modal').classList.remove('active');
};

function shortAddr(addr) {
    return addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : '—';
}
