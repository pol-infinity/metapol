/**
 * MetaPOL Admin Back-Office
 * grantFounderStatus(address, fromLevel, toLevel)  — address must NOT be registered
 * upgradeFounderSlots(address, fromLevel, toLevel) — address must already be a Founder
 */

document.addEventListener('DOMContentLoaded', () => {
    const origUpdateUI = window.metapolApp.updateWalletUI.bind(window.metapolApp);
    window.metapolApp.updateWalletUI = async function () {
        origUpdateUI();
        const overlay = document.getElementById('connect-prompt-overlay');
        const panel   = document.getElementById('admin-panel');
        const title   = document.getElementById('prompt-title');
        const sub     = document.getElementById('prompt-sub');

        if (!this.isConnected) {
            show(overlay); hide(panel);
            if (title) title.textContent = 'Admin Restricted Access';
            if (sub)   sub.innerHTML     = 'This portal is strictly authorized for the smart contract owner wallet only.';
            return;
        }

        hide(panel); show(overlay);
        try {
            const owner   = await this.contract.ownerWallet();
            const isOwner = this.userAddress.toLowerCase() === owner.toLowerCase();
            if (isOwner) {
                hide(overlay); show(panel);
                const el = document.getElementById('admin-owner-wallet');
                if (el) el.textContent = this.userAddress;
                syncAdminData();
            } else {
                show(overlay); hide(panel);
                if (title) title.textContent = 'Access Denied';
                if (sub)   sub.innerHTML     = `Connected wallet is not the contract owner.<br>
                    <small style="font-family:monospace;color:var(--danger);word-break:break-all;">${this.userAddress}</small>`;
            }
        } catch (err) {
            console.error('Owner check failed:', err);
            show(overlay); hide(panel);
            if (title) title.textContent = 'Verification Error';
            if (sub)   sub.innerHTML     = 'Could not verify owner status. Check your network connection.';
        }
    };

    function show(el) { if (el) el.style.display = 'flex'; }
    function hide(el) { if (el) el.style.display = 'none'; }
});

/* ── Sync Stats ── */
window.syncAdminData = async function () {
    if (!window.metapolApp.isConnected) return;
    window.metapolApp.showLoader();
    try {
        const contract = window.metapolApp.contract;
        const provider = window.metapolApp.provider;
        const [totalUsers, totalMining, balance, totalFees] = await Promise.all([
            contract.currUserID(),
            contract.totalMiningDeposited(),
            provider.getBalance(window.CONFIG.CONTRACT_ADDRESS),
            contract.totalAdminFees()
        ]);
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('admin-total-users',      Number(totalUsers).toLocaleString());
        set('admin-total-mining',     `${parseFloat(ethers.formatEther(totalMining)).toFixed(2)} POL`);
        set('admin-contract-balance', `${parseFloat(ethers.formatEther(balance)).toFixed(2)} POL`);
        set('admin-total-fees',       `${parseFloat(ethers.formatEther(totalFees)).toFixed(2)} POL`);
        await syncGlobalEvents();
    } catch (err) {
        console.error('Admin sync failed:', err);
        window.metapolApp.showToast('Failed to sync stats', 'error');
    } finally {
        window.metapolApp.hideLoader();
    }
};

/* ═══════════════════════════════════════════
   GRANT FOUNDER STATUS
   Requires: address NOT already registered
   Adds user to pools from _fromLevel to _toLevel
   ═══════════════════════════════════════════ */

window.checkGrantAddress = async function (address) {
    const hint = document.getElementById('grant-verify-hint');
    const btn  = document.getElementById('btn-grant-founder');
    if (!hint || !btn) return;

    // Reset
    btn.disabled = true;
    hint.className = 'verify-hint';

    if (!address) {
        hint.innerHTML = 'Enter the wallet address to grant Founder status'; return;
    }
    if (!ethers.isAddress(address)) {
        hint.className = 'verify-hint hint-error';
        hint.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Invalid Ethereum address format`; return;
    }

    hint.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying on-chain…`;
    try {
        const info      = await window.metapolApp.contract.getUserInfo(address);
        const isReg     = info[0];
        const isFounder = info[4];

        if (isFounder) {
            hint.className = 'verify-hint hint-warn';
            hint.innerHTML = `<i class="fa-solid fa-crown"></i> Already a Founder — use <strong>Upgrade Founder Slots</strong> below instead`;
            btn.disabled = true;
        } else if (isReg) {
            hint.className = 'verify-hint hint-error';
            hint.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> This wallet is already registered as a regular member. 
                Contract requires an <strong>unregistered</strong> wallet for grantFounderStatus.`;
            btn.disabled = true;
        } else {
            hint.className = 'verify-hint hint-ok';
            hint.innerHTML = `<i class="fa-solid fa-circle-check"></i> Unregistered wallet — ready to be onboarded as Founder`;
            btn.disabled = false;
        }
    } catch {
        hint.className = 'verify-hint hint-warn';
        hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Could not verify on-chain — check RPC connection`;
        btn.disabled = true;
    }
};

window.executeGrantFounder = async function () {
    const addr      = document.getElementById('input-grant-addr').value.trim();
    const fromLevel = parseInt(document.getElementById('grant-from-level').value);
    const toLevel   = parseInt(document.getElementById('grant-to-level').value);

    if (!ethers.isAddress(addr)) {
        window.metapolApp.showToast('Enter a valid wallet address', 'error'); return;
    }
    if (fromLevel > toLevel) {
        window.metapolApp.showToast('From Level must be ≤ To Level', 'error'); return;
    }

    // Pre-flight check — prevent wasting gas on a known revert
    try {
        const info  = await window.metapolApp.contract.getUserInfo(addr);
        if (info[0]) {
            window.metapolApp.showToast('Address is already registered — contract will reject this', 'error');
            return;
        }
    } catch { /* proceed */ }

    openTxModal(`Granting Founder Status — Slots ${fromLevel} → ${toLevel}`);
    try {
        let gasLimit;
        try {
            gasLimit = await window.metapolApp.contract.grantFounderStatus.estimateGas(addr, fromLevel, toLevel);
            gasLimit = (gasLimit * 130n) / 100n;
        } catch (e) {
            console.warn('Gas estimate failed:', e);
            gasLimit = 800000n;
        }

        const tx      = await window.metapolApp.contract.grantFounderStatus(addr, fromLevel, toLevel, { gasLimit });
        setTxHash(tx.hash);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            showTxSuccess(tx.hash);
            window.metapolApp.showToast('Founder status granted successfully!', 'success');
            document.getElementById('input-grant-addr').value = '';
            document.getElementById('grant-verify-hint').innerHTML = 'Enter the wallet address to grant Founder status';
            document.getElementById('grant-verify-hint').className = 'verify-hint';
            document.getElementById('btn-grant-founder').disabled = true;
            setTimeout(syncAdminData, 1500);
        } else {
            throw new Error('Transaction reverted by contract');
        }
    } catch (err) {
        console.error('Grant failed:', err);
        showTxFail(parseRevertReason(err));
        window.metapolApp.showToast('Transaction failed', 'error');
    }
};

/* ═══════════════════════════════════════════
   UPGRADE FOUNDER SLOTS
   Requires: address IS already a Founder
   Upgrades from _fromLevel to _toLevel
   ═══════════════════════════════════════════ */

window.checkUpgradeAddress = async function (address) {
    const hint = document.getElementById('upgrade-verify-hint');
    const btn  = document.getElementById('btn-upgrade-founder');
    if (!hint || !btn) return;

    btn.disabled = true;
    hint.className = 'verify-hint';

    if (!address) {
        hint.innerHTML = 'Enter the Founder wallet address to upgrade'; return;
    }
    if (!ethers.isAddress(address)) {
        hint.className = 'verify-hint hint-error';
        hint.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Invalid Ethereum address format`; return;
    }

    hint.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying on-chain…`;
    try {
        const info      = await window.metapolApp.contract.getUserInfo(address);
        const isReg     = info[0];
        const isFounder = info[4];

        if (!isReg) {
            hint.className = 'verify-hint hint-error';
            hint.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Not registered — use <strong>Grant Founder Status</strong> above first`;
            btn.disabled = true;
        } else if (!isFounder) {
            hint.className = 'verify-hint hint-error';
            hint.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Registered but not a Founder — use <strong>Grant Founder Status</strong> above first`;
            btn.disabled = true;
        } else {
            hint.className = 'verify-hint hint-ok';
            hint.innerHTML = `<i class="fa-solid fa-circle-check"></i> Confirmed Founder — ready to upgrade slot range`;
            btn.disabled = false;
        }
    } catch {
        hint.className = 'verify-hint hint-warn';
        hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Could not verify on-chain — check RPC connection`;
        btn.disabled = true;
    }
};

window.executeUpgradeFounder = async function () {
    const addr      = document.getElementById('input-upgrade-addr').value.trim();
    const fromLevel = parseInt(document.getElementById('upgrade-from-level').value);
    const toLevel   = parseInt(document.getElementById('upgrade-to-level').value);

    if (!ethers.isAddress(addr)) {
        window.metapolApp.showToast('Enter a valid wallet address', 'error'); return;
    }
    if (fromLevel > toLevel) {
        window.metapolApp.showToast('From Level must be ≤ To Level', 'error'); return;
    }

    // Pre-flight check
    try {
        const info = await window.metapolApp.contract.getUserInfo(addr);
        if (!info[0]) {
            window.metapolApp.showToast('Address not registered — grant Founder status first', 'error'); return;
        }
        if (!info[4]) {
            window.metapolApp.showToast('Address is not a Founder — grant Founder status first', 'error'); return;
        }
    } catch { /* proceed */ }

    openTxModal(`Upgrading Founder Slots ${fromLevel} → ${toLevel}`);
    try {
        let gasLimit;
        try {
            gasLimit = await window.metapolApp.contract.upgradeFounderSlots.estimateGas(addr, fromLevel, toLevel);
            gasLimit = (gasLimit * 130n) / 100n;
        } catch (e) {
            console.warn('Gas estimate failed:', e);
            gasLimit = 800000n;
        }

        const tx      = await window.metapolApp.contract.upgradeFounderSlots(addr, fromLevel, toLevel, { gasLimit });
        setTxHash(tx.hash);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            showTxSuccess(tx.hash);
            window.metapolApp.showToast('Founder slots upgraded successfully!', 'success');
            document.getElementById('input-upgrade-addr').value = '';
            document.getElementById('upgrade-verify-hint').innerHTML = 'Enter the Founder wallet address to upgrade';
            document.getElementById('upgrade-verify-hint').className = 'verify-hint';
            document.getElementById('btn-upgrade-founder').disabled = true;
            setTimeout(syncAdminData, 1500);
        } else {
            throw new Error('Transaction reverted by contract');
        }
    } catch (err) {
        console.error('Upgrade failed:', err);
        showTxFail(parseRevertReason(err));
        window.metapolApp.showToast('Transaction failed', 'error');
    }
};

/* ── Parse revert reason cleanly ── */

/* ═══════════════════════════════════════════
   GIVE SLOTS TO REGISTERED MEMBER
   Checks member status and uses the right contract function:
   - If Founder → upgradeFounderSlots
   - If regular registered → grantFounderStatus is blocked by contract;
     show clear error explaining the limitation
   ═══════════════════════════════════════════ */

let _memberIsFounder = false;
let _memberIsReg = false;

window.checkMemberAddress = async function (address) {
    const hint    = document.getElementById('member-verify-hint');
    const wrap    = document.getElementById('member-action-wrap');
    const btn     = document.getElementById('btn-member-slots');
    if (!hint) return;

    _memberIsFounder = false;
    _memberIsReg = false;
    if (wrap) wrap.style.display = 'none';
    if (btn)  btn.disabled = true;

    if (!address) { hint.className = 'verify-hint'; hint.innerHTML = 'Enter a member wallet address to check status'; return; }
    if (!ethers.isAddress(address)) {
        hint.className = 'verify-hint hint-error';
        hint.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Invalid address format`; return;
    }

    hint.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking on-chain…`;
    try {
        const info = await window.metapolApp.contract.getUserInfo(address);
        _memberIsReg     = info[0];
        const userId     = Number(info[1]);
        _memberIsFounder = info[4];

        // Check active slots
        const slotChecks = [];
        for (let i = 1; i <= 12; i++) slotChecks.push(window.metapolApp.contract.isUserInSlot(address, i));
        const slotResults = await Promise.all(slotChecks);
        const activeSlots = slotResults.map((a, i) => a ? i + 1 : null).filter(Boolean);

        if (!_memberIsReg) {
            hint.className = 'verify-hint hint-warn';
            hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Not registered — use <strong>Grant Founder Status</strong> above`;
            return;
        }

        if (_memberIsFounder) {
            hint.className = 'verify-hint hint-ok';
            hint.innerHTML = `<i class="fa-solid fa-crown"></i> Founder (ID #${userId}) — Active slots: ${activeSlots.length ? activeSlots.join(', ') : 'none'}. Ready to upgrade.`;
            if (wrap) wrap.style.display = 'block';
            if (btn)  { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-arrow-up-right-dots"></i> Upgrade Founder Slots'; }
        } else {
            hint.className = 'verify-hint hint-error';
            hint.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Registered member (ID #${userId}) but NOT a Founder. Active slots: ${activeSlots.length ? activeSlots.join(', ') : 'none'}.<br>
                <span style="font-size:0.78rem;color:rgba(255,150,150,0.8);">The contract's <code>grantFounderStatus</code> only works for unregistered wallets. 
                To give this user slots, they need to purchase via <strong>buySlot1/buyLevel</strong> themselves, 
                or you need to deploy with admin slot-assign capability.</span>`;
        }
    } catch(e) {
        hint.className = 'verify-hint hint-warn';
        hint.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Could not verify — check RPC`;
    }
};

window.executeMemberSlots = async function () {
    const addr      = document.getElementById('input-member-addr').value.trim();
    const fromLevel = parseInt(document.getElementById('member-from-level').value);
    const toLevel   = parseInt(document.getElementById('member-to-level').value);

    if (!ethers.isAddress(addr)) { window.metapolApp.showToast('Invalid address', 'error'); return; }
    if (fromLevel > toLevel)     { window.metapolApp.showToast('From Level must be ≤ To Level', 'error'); return; }
    if (!_memberIsFounder)       { window.metapolApp.showToast('Member is not a Founder — cannot upgrade slots', 'error'); return; }

    openTxModal(`Upgrading Founder Slots ${fromLevel} → ${toLevel} for ${short(addr)}`);
    try {
        let gasLimit;
        try {
            gasLimit = await window.metapolApp.contract.upgradeFounderSlots.estimateGas(addr, fromLevel, toLevel);
            gasLimit = (gasLimit * 130n) / 100n;
        } catch(e) { gasLimit = 800000n; }

        const tx      = await window.metapolApp.contract.upgradeFounderSlots(addr, fromLevel, toLevel, { gasLimit });
        setTxHash(tx.hash);
        const receipt = await tx.wait();
        if (receipt.status === 1) {
            showTxSuccess(tx.hash);
            window.metapolApp.showToast('Slots upgraded successfully!', 'success');
            setTimeout(syncAdminData, 1500);
        } else {
            throw new Error('Transaction reverted');
        }
    } catch(err) {
        showTxFail(parseRevertReason(err));
        window.metapolApp.showToast('Transaction failed', 'error');
    }
};

function parseRevertReason(err) {
    if (err.code === 'ACTION_REJECTED') return 'Transaction was rejected in your wallet.';
    if (err.reason)  return `Contract rejected: "${err.reason}"`;
    if (err.message) {
        if (err.message.includes('Already registered'))   return 'Contract rejected: address is already registered.';
        if (err.message.includes('Not owner'))            return 'Contract rejected: caller is not the owner.';
        if (err.message.includes('insufficient funds'))   return 'Insufficient POL for gas fees.';
        if (err.message.includes('user rejected'))        return 'Transaction was rejected in your wallet.';
        return err.message.length > 120 ? err.message.slice(0, 120) + '…' : err.message;
    }
    return 'Transaction failed. Check Polygonscan for details.';
}

/* ── Global Events Timeline ── */
async function syncGlobalEvents() {
    const container = document.getElementById('global-activity-logs-container');
    if (!container) return;
    container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:30px;">
        <i class="fa-solid fa-spinner fa-spin"></i> Scanning recent blocks…</div>`;
    try {
        const contract     = window.metapolApp.contract;
        const currentBlock = await window.metapolApp.provider.getBlockNumber();
        const startBlock   = Math.max(window.CONFIG.CONTRACT_DEPLOY_BLOCK, currentBlock - 5000);

        const [regEvs, slotEvs, withdrawEvs, founderGrantedEvs, founderUpgradedEvs] = await Promise.all([
            contract.queryFilter(contract.filters.RegUser(),              startBlock, 'latest'),
            contract.queryFilter(contract.filters.RegPoolEntry(),         startBlock, 'latest'),
            contract.queryFilter(contract.filters.MiningWithdraw(),       startBlock, 'latest'),
            contract.queryFilter(contract.filters.FounderGranted(),       startBlock, 'latest'),
            contract.queryFilter(contract.filters.FounderSlotsUpgraded(), startBlock, 'latest').catch(() => [])
        ]);

        const logs = [];
        regEvs.forEach(e => logs.push({ icon: 'fa-user-plus', cls: 'reg',
            html: `<strong>${short(e.args.user)}</strong> registered — ID #${e.args.userId}`,
            time: Number(e.args.time) }));
        slotEvs.forEach(e => logs.push({ icon: 'fa-layer-group', cls: 'buy',
            html: `<strong>${short(e.args.user)}</strong> entered Slot ${e.args.level} — ${fmt(e.args.value)} POL`,
            time: Number(e.args.time) }));
        withdrawEvs.forEach(e => logs.push({ icon: 'fa-circle-down', cls: 'claim',
            html: `<strong>${short(e.args.user)}</strong> withdrew mining — ${fmt(e.args.netAmount)} POL net`,
            time: Number(e.args.time) }));
        founderGrantedEvs.forEach(e => logs.push({ icon: 'fa-crown', cls: 'upgrade',
            html: `<strong>${short(e.args.addr)}</strong> granted Founder (ID #${e.args.userId}) — slots ${e.args.fromLevel}→${e.args.toLevel}`,
            time: Number(e.args.time) }));
        founderUpgradedEvs.forEach(e => logs.push({ icon: 'fa-arrow-up-right-dots', cls: 'upgrade',
            html: `<strong>${short(e.args.addr)}</strong> upgraded Founder slots — ${e.args.fromLevel}→${e.args.toLevel}`,
            time: Number(e.args.time) }));

        logs.sort((a, b) => b.time - a.time);
        if (!logs.length) {
            container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:0.85rem;">No activity in last 5,000 blocks.</div>`;
            return;
        }
        container.innerHTML = '';
        logs.slice(0, 60).forEach(log => {
            const el = document.createElement('div');
            el.className = 'activity-item';
            el.innerHTML = `
                <div class="activity-icon-bullet ${log.cls}"><i class="fa-solid ${log.icon}"></i></div>
                <div class="activity-details">
                    <div class="activity-txt">${log.html}</div>
                    <div class="activity-time">${new Date(log.time * 1000).toLocaleString()}</div>
                </div>`;
            container.appendChild(el);
        });
    } catch (err) {
        console.error('Events failed:', err);
        container.innerHTML = `<div style="text-align:center;color:rgba(255,80,80,0.7);padding:30px;font-size:0.85rem;">
            <i class="fa-solid fa-triangle-exclamation"></i> Failed to load events. Try Refresh.</div>`;
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

function short(addr) { return addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : '—'; }
function fmt(val)    { return val  ? parseFloat(ethers.formatEther(val)).toFixed(2) : '0.00'; }
