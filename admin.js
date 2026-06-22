/**
 * MetaPOL Admin Back-Office Logic
 * Owner checks, founder status dispatching, global contract event queries
 */

document.addEventListener("DOMContentLoaded", () => {
    // Intercept wallet UI to trigger owner checks and admin stats loading
    const originalUpdateWalletUI = window.metapolApp.updateWalletUI;
    window.metapolApp.updateWalletUI = async function() {
        originalUpdateWalletUI.apply(this);

        const promptOverlay = document.getElementById("connect-prompt-overlay");
        const dashLayout = document.getElementById("dashboard-layout-wrapper");

        if (this.isConnected) {
            // Immediately hide the dashboard until owner is confirmed
            if (dashLayout) dashLayout.style.display = "none";

            try {
                const owner = await this.contract.ownerWallet();
                const isOwner = this.userAddress.toLowerCase() === owner.toLowerCase();

                if (isOwner) {
                    if (promptOverlay) promptOverlay.style.display = "none";
                    if (dashLayout) dashLayout.style.display = "grid";

                    // Show owner wallet address in admin header
                    const ownerBadge = document.getElementById("admin-owner-wallet");
                    if (ownerBadge) ownerBadge.innerText = this.userAddress;

                    syncAdminData();
                } else {
                    if (promptOverlay) {
                        promptOverlay.style.display = "flex";
                        promptOverlay.querySelector(".auth-title").innerText = "Access Denied";
                        promptOverlay.querySelector(".auth-subtitle").innerHTML = 
                            `Connected address is not authorized. <br><small style="font-family:monospace; color:var(--danger);">${this.userAddress}</small>`;
                    }
                    if (dashLayout) dashLayout.style.display = "none";
                }
            } catch (err) {
                console.error("Owner validation failed:", err);
                // On error keep dashboard hidden
                if (dashLayout) dashLayout.style.display = "none";
                if (promptOverlay) promptOverlay.style.display = "flex";
            }
        } else {
            if (promptOverlay) promptOverlay.style.display = "flex";
            if (dashLayout) dashLayout.style.display = "none";
        }
    };

    // Address verification listener for Founder inputs
    const inputFounder = document.getElementById("input-founder-address");
    if (inputFounder) {
        inputFounder.addEventListener("input", (e) => {
            validateFounderAddress(e.target.value);
        });
    }
});

// Sync admin metrics
async function syncAdminData() {
    if (!window.metapolApp.isConnected) return;
    window.metapolApp.showLoader();

    try {
        // Fetch stats from contract in parallel
        const [totalUsers, totalMining, contractBalance, totalFees] = await Promise.all([
            window.metapolApp.contract.currUserID(),
            window.metapolApp.contract.totalMiningDeposited(),
            window.metapolApp.provider.getBalance(window.CONFIG.CONTRACT_ADDRESS),
            window.metapolApp.contract.totalAdminFees()
        ]);

        document.getElementById("admin-total-users").innerText = Number(totalUsers).toLocaleString();
        document.getElementById("admin-total-mining").innerText = `${parseFloat(ethers.formatEther(totalMining)).toFixed(2)} POL`;
        document.getElementById("admin-contract-balance").innerText = `${parseFloat(ethers.formatEther(contractBalance)).toFixed(2)} POL`;
        document.getElementById("admin-total-fees").innerText = `${parseFloat(ethers.formatEther(totalFees)).toFixed(2)} POL`;

        // Sync global events
        await syncGlobalEvents();

    } catch (err) {
        console.error("Failed to load back-office statistics:", err);
        window.metapolApp.showToast("Failed to sync back-office parameters", "error");
    } finally {
        window.metapolApp.hideLoader();
    }
}

// Validate address for Founder grant input
async function validateFounderAddress(address) {
    const verifyText = document.getElementById("founder-verify-text");
    const btnGrant = document.getElementById("btn-grant-founder");

    if (!address) {
        verifyText.innerHTML = "Enter Address (0x...)";
        btnGrant.disabled = true;
        return;
    }

    if (!ethers.isAddress(address)) {
        verifyText.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Invalid EVM wallet address format`;
        btnGrant.disabled = true;
        return;
    }

    try {
        // Check if address already registered
        const userInfo = await window.metapolApp.contract.getUserInfo(address);
        const isRegistered = userInfo[0];

        if (isRegistered) {
            verifyText.innerHTML = `<i class="fa-solid fa-circle-xmark text-danger"></i> Wallet is already registered. Founders must be unregistered.`;
            btnGrant.disabled = true;
        } else {
            verifyText.innerHTML = `<i class="fa-solid fa-circle-check text-accent"></i> Valid address (Unregistered, ready to onboard)`;
            btnGrant.disabled = false;
        }
    } catch (err) {
        verifyText.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-warning"></i> Could not check address status`;
        btnGrant.disabled = false;
    }
}

// Grant Founder Status
async function executeGrantFounder() {
    const inputFounder = document.getElementById("input-founder-address");
    const recipientAddress = inputFounder.value.trim();

    if (!ethers.isAddress(recipientAddress)) {
        window.metapolApp.showToast("Please provide a valid wallet address", "error");
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
    loadingTitle.innerText = "Granting Founder Status";
    txHashContainer.innerText = "Estimating gas limits...";

    try {
        // Estimate Gas
        let gasLimit;
        try {
            gasLimit = await window.metapolApp.contract.grantFounderStatus.estimateGas(recipientAddress);
            gasLimit = (gasLimit * 120n) / 100n; // buffer
        } catch (err) {
            gasLimit = 350000n; // safe standard for pool setups
        }

        const tx = await window.metapolApp.contract.grantFounderStatus(recipientAddress, { gasLimit: gasLimit });
        console.log("Grant Founder transaction dispatched:", tx.hash);
        txHashContainer.innerHTML = `Hash: <a href="${window.CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank" style="color: var(--primary); text-decoration: underline;">${tx.hash}</a>`;

        const receipt = await tx.wait();
        if (receipt.status === 1) {
            txLoading.style.display = "none";
            txSuccess.style.display = "block";
            document.getElementById("tx-explorer-link").href = `${window.CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}`;
            window.metapolApp.showToast("Founder Club membership granted successfully!", "success");
            
            // Clear input and reload stats
            inputFounder.value = "";
            document.getElementById("founder-verify-text").innerText = "Enter Address (0x...)";
            document.getElementById("btn-grant-founder").disabled = true;

            setTimeout(() => {
                syncAdminData();
            }, 500);
        } else {
            throw new Error("Transaction was reverted by the EVM network.");
        }

    } catch (err) {
        console.error("Founder grant failed:", err);
        txLoading.style.display = "none";
        txFail.style.display = "block";

        let friendlyMsg = err.message;
        if (err.code === "ACTION_REJECTED") {
            friendlyMsg = "Transaction authorization rejected in wallet browser.";
        }
        txErrorMsg.innerText = friendlyMsg;
        window.metapolApp.showToast("Founder grant failed.", "error");
    }
}

// Synchronize global timeline logs
async function syncGlobalEvents() {
    try {
        const logsContainer = document.getElementById("global-activity-logs-container");
        logsContainer.innerHTML = "";

        // Query global events from contract
        const filterReg = window.metapolApp.contract.filters.RegUser();
        const filterUpgrade = window.metapolApp.contract.filters.RegPoolEntry();
        const filterWith = window.metapolApp.contract.filters.MiningWithdraw();
        const filterFounder = window.metapolApp.contract.filters.FounderGranted();

        // Query last 1000 blocks to avoid overloading RPC node
        const currentBlock = await window.metapolApp.provider.getBlockNumber();
        const startBlock = Math.max(0, currentBlock - 5000); // scan last 5000 blocks

        console.log(`Scanning block range: ${startBlock} to latest`);

        const [regEvents, upgEvents, withEvents, founderEvents] = await Promise.all([
            window.metapolApp.contract.queryFilter(filterReg, startBlock, "latest"),
            window.metapolApp.contract.queryFilter(filterUpgrade, startBlock, "latest"),
            window.metapolApp.contract.queryFilter(filterWith, startBlock, "latest"),
            window.metapolApp.contract.queryFilter(founderFounderGrantedFilterHelper(), startBlock, "latest")
        ]);

        const allLogs = [];

        regEvents.forEach(e => {
            allLogs.push({
                icon: "fa-user-plus",
                class: "reg",
                text: `Address <strong>${window.metapolApp.shortenAddress(e.args.user)}</strong> registered as ID #${e.args.userId}.`,
                time: Number(e.args.time)
            });
        });

        upgEvents.forEach(e => {
            allLogs.push({
                icon: "fa-layer-group",
                class: "buy",
                text: `Address <strong>${window.metapolApp.shortenAddress(e.args.user)}</strong> purchased Slot level ${e.args.level} (ID #${e.args.slotId}).`,
                time: Number(e.args.time)
            });
        });

        withEvents.forEach(e => {
            allLogs.push({
                icon: "fa-circle-down",
                class: "claim",
                text: `Address <strong>${window.metapolApp.shortenAddress(e.args.user)}</strong> claimed mining rewards: ${parseFloat(ethers.formatEther(e.args.grossAmount)).toFixed(2)} POL.`,
                time: Number(e.args.time)
            });
        });

        founderEvents.forEach(e => {
            allLogs.push({
                icon: "fa-crown",
                class: "upgrade",
                text: `Address <strong>${window.metapolApp.shortenAddress(e.args.addr)}</strong> granted Founder Club membership (ID #${e.args.userId}).`,
                time: Number(e.args.time)
            });
        });

        // Sort descending by time
        allLogs.sort((a, b) => b.time - a.time);

        // Render latest 50 events
        const displayLogs = allLogs.slice(0, 50);

        displayLogs.forEach(log => {
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

        if (displayLogs.length === 0) {
            logsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 40px 0;">No global ecosystem events in the last 5,000 blocks.</div>`;
        }

    } catch (err) {
        console.error("Global events sync failed:", err);
    }
}

// Helper to filter Founder events correctly
function founderFounderGrantedFilterHelper() {
    return {
        address: window.CONFIG.CONTRACT_ADDRESS,
        topics: [
            ethers.id("FounderGranted(address,uint256,uint256)")
        ]
    };
}

function closeTxModal() {
    document.getElementById("tx-modal").classList.remove("active");
}
