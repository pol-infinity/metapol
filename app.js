/**
 * MetaPOL Core Web3 Engine & UI Controller
 * Built using Ethers.js v6 CDN
 */

class MetaPOLApp {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.userAddress = null;
        this.contract = null;
        this.contractReadOnly = null;
        this.isConnected = false;
        
        // DOM Elements
        this.loadingScreen = document.getElementById("loading-screen");
        this.btnConnectWallet = document.getElementById("btn-connect-wallet");
        this.walletStatus = document.getElementById("wallet-status");
        this.walletAddressDisplay = document.getElementById("wallet-address-display");
        
        // Listeners & Initialization
        document.addEventListener("DOMContentLoaded", () => this.init());
    }

    async init() {
        // Setup Canvas Particle Background
        this.initCanvasBackground();

        // Parse referral query parameter
        this.parseReferral();

        // Add UI Action Listeners (Header, Modals, Hamburger, PDF)
        this.initUIListeners();

        // Check if Web3 wallet was previously authorized
        const autoReconnect = localStorage.getItem("metapol_autoreconnect") === "true";
        if (autoReconnect && window.ethereum) {
            try {
                await this.connectWallet(true);
            } catch (err) {
                console.error("Auto-reconnection failed:", err);
                localStorage.removeItem("metapol_autoreconnect");
                this.hideLoader();
                this.routePage();
            }
        } else {
            this.hideLoader();
            this.routePage();
        }

        // Setup Account and Network Change Listeners
        if (window.ethereum) {
            window.ethereum.on("accountsChanged", (accounts) => this.handleAccountsChanged(accounts));
            window.ethereum.on("chainChanged", (chainId) => this.handleChainChanged(chainId));
        }
    }

    // Initialize Canvas Particles Background
    initCanvasBackground() {
        const canvas = document.getElementById("bg-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        
        let particles = [];
        const colors = ["#00D4FF", "#8A2BE2", "#00FFB3"];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener("resize", resize);
        resize();

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.radius = Math.random() * 2 + 1;
                this.color = colors[Math.floor(Math.random() * colors.length)];
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;

                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.shadowBlur = 8;
                ctx.shadowColor = this.color;
                ctx.fill();
                ctx.shadowBlur = 0; // reset
            }
        }

        // Initialize particles based on screen width
        const density = window.innerWidth < 768 ? 30 : 80;
        for (let i = 0; i < density; i++) {
            particles.push(new Particle());
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });

            // Draw line connections between close particles
            ctx.shadowBlur = 0;
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 100) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 * (1 - dist / 100)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }

            requestAnimationFrame(animate);
        };
        animate();
    }

    // Check URL parameters for Referral ID
    parseReferral() {
        const urlParams = new URLSearchParams(window.location.search);
        const refId = urlParams.get("ref");
        if (refId && !isNaN(refId)) {
            localStorage.setItem("metapol_ref", refId);
            console.log(`Referral sponsor stored in memory: Sponsor ID ${refId}`);
        }
    }

    // Set up Global Navigation Hamburger Menu, Popups and PDF Modals
    initUIListeners() {
        // Hamburger Menu toggle
        const hamburger = document.querySelector(".hamburger");
        const drawer = document.querySelector(".mobile-nav-drawer");
        if (hamburger && drawer) {
            hamburger.addEventListener("click", () => {
                hamburger.classList.toggle("active");
                drawer.classList.toggle("active");
            });

            // Close drawer when clicking nav links
            drawer.querySelectorAll(".nav-item").forEach(link => {
                link.addEventListener("click", () => {
                    hamburger.classList.remove("active");
                    drawer.classList.remove("active");
                });
            });
        }

        // PDF Modals Action
        const pdfTriggers = document.querySelectorAll(".trigger-pdf-modal");
        const pdfModal = document.getElementById("pdf-modal");
        if (pdfModal) {
            pdfTriggers.forEach(btn => {
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    pdfModal.classList.add("active");
                });
            });

            const closeBtn = pdfModal.querySelector(".modal-close-btn");
            if (closeBtn) {
                closeBtn.addEventListener("click", () => {
                    pdfModal.classList.remove("active");
                });
            }

            // Close on overlay click
            pdfModal.addEventListener("click", (e) => {
                if (e.target === pdfModal) {
                    pdfModal.classList.remove("active");
                }
            });
        }
    }

    // Connect Web3 Wallet
    async connectWallet(isAutoReconnect = false) {
        if (!window.ethereum) {
            if (!isAutoReconnect) {
                this.showToast("Web3 provider not detected. Please install MetaMask, Trust Wallet, or Coinbase Wallet.", "error");
            }
            return;
        }

        try {
            // Create Ethers Provider
            this.provider = new ethers.BrowserProvider(window.ethereum);
            
            // Request accounts access
            const accounts = await this.provider.send("eth_requestAccounts", []);
            if (accounts.length === 0) {
                throw new Error("No accounts authorized.");
            }

            this.signer = await this.provider.getSigner();
            this.userAddress = await this.signer.getAddress();
            
            // Validate Polygon Mainnet Connection
            const network = await this.provider.getNetwork();
            const chainIdDecimal = Number(network.chainId);
            
            if (chainIdDecimal !== window.CONFIG.CHAIN_ID_DECIMAL) {
                const switchSuccess = await this.switchNetwork();
                if (!switchSuccess) {
                    throw new Error("Wrong network. Please connect to Polygon Mainnet.");
                }
                // Refresh provider and signer after network switch
                this.provider = new ethers.BrowserProvider(window.ethereum);
                this.signer = await this.provider.getSigner();
                this.userAddress = await this.signer.getAddress();
            }

            // Build writeable contract instance
            this.contract = new ethers.Contract(
                window.CONFIG.CONTRACT_ADDRESS,
                window.METAPOL_ABI,
                this.signer
            );

            // Build read-only provider contract (for gas-free loading if required)
            this.contractReadOnly = new ethers.Contract(
                window.CONFIG.CONTRACT_ADDRESS,
                window.METAPOL_ABI,
                this.provider
            );

            this.isConnected = true;
            localStorage.setItem("metapol_autoreconnect", "true");

            // Update UI State
            this.updateWalletUI();
            this.showToast(`Connected wallet: ${this.shortenAddress(this.userAddress)}`, "success");

            // Check Registration and auto-route
            await this.routePage();
        } catch (err) {
            console.error("Wallet connection error:", err);
            if (!isAutoReconnect) {
                this.showToast(err.message || "Failed to connect wallet", "error");
            }
            this.disconnectWallet();
        } finally {
            this.hideLoader();
        }
    }

    // Switch/Add Polygon Mainnet automatically
    async switchNetwork() {
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: window.CONFIG.CHAIN_ID }],
            });
            return true;
        } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask.
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: "wallet_addEthereumChain",
                        params: [
                            {
                                chainId: window.CONFIG.CHAIN_ID,
                                chainName: window.CONFIG.CHAIN_NAME,
                                rpcUrls: [window.CONFIG.RPC_URL],
                                blockExplorerUrls: [window.CONFIG.BLOCK_EXPLORER],
                                nativeCurrency: window.CONFIG.NATIVE_CURRENCY,
                            },
                        ],
                    });
                    return true;
                } catch (addError) {
                    console.error("Error adding Polygon network:", addError);
                    return false;
                }
            }
            console.error("Error switching network:", switchError);
            return false;
        }
    }

    // Disconnect Wallet
    disconnectWallet() {
        this.provider = null;
        this.signer = null;
        this.userAddress = null;
        this.contract = null;
        this.contractReadOnly = null;
        this.isConnected = false;
        localStorage.removeItem("metapol_autoreconnect");

        this.updateWalletUI();
        this.routePage();
    }

    // Handle wallet address switch directly inside browser
    async handleAccountsChanged(accounts) {
        if (accounts.length === 0) {
            this.disconnectWallet();
        } else {
            console.log("Account changed detected:", accounts[0]);
            await this.connectWallet(true);
        }
    }

    // Handle network change directly inside browser
    handleChainChanged(chainId) {
        console.log("Chain change detected, reloading page...");
        window.location.reload();
    }

    // Update Header Wallet Interface Elements
    updateWalletUI() {
        const headerConnectText = document.getElementById("header-connect-text");
        const headerWalletIcon = document.getElementById("header-wallet-icon");

        if (this.isConnected && this.userAddress) {
            const shortAddr = this.shortenAddress(this.userAddress);
            if (headerConnectText) headerConnectText.innerText = shortAddr;
            if (headerWalletIcon) {
                headerWalletIcon.className = "fa-solid fa-wallet-arrow-left text-accent";
            }
            if (this.btnConnectWallet) {
                this.btnConnectWallet.innerHTML = `<i class="fa-solid fa-wallet"></i> ${shortAddr}`;
                this.btnConnectWallet.className = "btn btn-primary";
            }
            
            // If in Dashboard prompt overlay, hide it
            const promptOverlay = document.getElementById("connect-prompt-overlay");
            if (promptOverlay) promptOverlay.style.display = "none";
            
            // If in normal dashboard layout wrapper, show it
            const dashLayout = document.getElementById("dashboard-layout-wrapper");
            if (dashLayout) dashLayout.style.display = "grid";

        } else {
            if (headerConnectText) headerConnectText.innerText = "Connect Wallet";
            if (headerWalletIcon) {
                headerWalletIcon.className = "fa-solid fa-wallet";
            }
            if (this.btnConnectWallet) {
                this.btnConnectWallet.innerHTML = `<i class="fa-solid fa-link"></i> Connect Wallet`;
                this.btnConnectWallet.className = "btn btn-primary btn-glow";
            }
            
            // If on dashboard, show prompt overlay and hide main container
            const promptOverlay = document.getElementById("connect-prompt-overlay");
            if (promptOverlay) promptOverlay.style.display = "flex";

            const dashLayout = document.getElementById("dashboard-layout-wrapper");
            if (dashLayout) dashLayout.style.display = "none";
        }
    }

    // Smart Routing Logic based on User Registration Status
    async routePage() {
        const currentPath = window.location.pathname;
        const pageName = currentPath.substring(currentPath.lastIndexOf("/") + 1);
        
        // If not connected
        if (!this.isConnected) {
            // If user is accessing dashboard.html or admin.html directly, we show connect wallet screen (prevent layout from loading)
            if (pageName === "dashboard.html" || pageName === "admin.html") {
                this.updateWalletUI(); // triggers display of prompt
            }
            this.hideLoader();
            return;
        }

        try {
            // Check registration
            const userInfo = await this.contract.getUserInfo(this.userAddress);
            const isRegistered = userInfo[0]; // isExist
            const isFounder = userInfo[7];
            const isOwner = this.userAddress.toLowerCase() === (await this.contract.ownerWallet()).toLowerCase();

            console.log(`Routing Check - Address: ${this.userAddress}, Registered: ${isRegistered}, Founder: ${isFounder}, Owner: ${isOwner}`);

            // Logic 1: Connected but NOT registered -> Redirect to register.html
            if (!isRegistered) {
                if (pageName !== "register.html" && pageName !== "index.html") {
                    this.showToast("Registration required. Redirecting...", "info");
                    setTimeout(() => {
                        window.location.href = "register.html";
                    }, 1000);
                }
            } 
            // Logic 2: Connected and REGISTERED
            else {
                // If on register.html or landing page index.html -> Auto-redirect to dashboard.html
                if (pageName === "register.html" || pageName === "" || pageName === "index.html") {
                    this.showToast("Already registered. Redirecting to dashboard...", "success");
                    setTimeout(() => {
                        window.location.href = "dashboard.html";
                    }, 1000);
                }
                
                // If trying to access admin.html, ensure they are owner
                if (pageName === "admin.html" && !isOwner) {
                    this.showToast("Access Denied: Owner only", "error");
                    setTimeout(() => {
                        window.location.href = "dashboard.html";
                    }, 1000);
                }
            }
        } catch (err) {
            console.error("Error reading profile details from contract:", err);
            this.showToast("Blockchain read failed. Please verify network.", "error");
        } finally {
            this.hideLoader();
        }
    }

    // Toast Notification System
    showToast(message, type = "info") {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            container.className = "toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        
        let icon = "fa-info-circle";
        if (type === "success") icon = "fa-check-circle";
        if (type === "error") icon = "fa-exclamation-triangle";

        toast.innerHTML = `
            <i class="fa-solid ${icon} toast-icon"></i>
            <div class="toast-content">${message}</div>
        `;

        container.appendChild(toast);

        // Slide in
        setTimeout(() => toast.classList.add("show"), 10);

        // Remove after 4s
        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // Helper functions
    shortenAddress(addr) {
        if (!addr) return "";
        return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
    }

    hideLoader() {
        if (this.loadingScreen) {
            this.loadingScreen.style.opacity = "0";
            setTimeout(() => {
                this.loadingScreen.style.display = "none";
            }, 600);
        }
    }

    showLoader() {
        if (this.loadingScreen) {
            this.loadingScreen.style.display = "flex";
            setTimeout(() => {
                this.loadingScreen.style.opacity = "1";
            }, 10);
        }
    }
}

// Bind to window context
window.metapolApp = new MetaPOLApp();
