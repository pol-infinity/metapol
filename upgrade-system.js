/**
 * MetaPOL Upgrade Conversion System v1.0
 * Premium, non-intrusive upgrade promotions — Binance/Bybit style
 */

;(function () {
  "use strict";

  /* ─────────────────────────────────────────
     CONFIG
  ───────────────────────────────────────── */
  const CFG = {
    cooldownMs: 30 * 60 * 1000,   // 30 min between popups
    idleMs: [3 * 60 * 1000, 5 * 60 * 1000], // 3–5 min idle trigger
    storageKey: "mpol_upgrade_system",
  };

  /* ─────────────────────────────────────────
     STATE  (persisted in localStorage)
  ───────────────────────────────────────── */
  function loadState() {
    try { return JSON.parse(localStorage.getItem(CFG.storageKey)) || {}; }
    catch { return {}; }
  }
  function saveState(s) {
    try { localStorage.setItem(CFG.storageKey, JSON.stringify(s)); } catch {}
  }

  /* ─────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────── */
  function canShowPopup() {
    const s = loadState();
    if (!s.lastPopupTime) return true;
    return Date.now() - s.lastPopupTime >= CFG.cooldownMs;
  }

  function recordPopupShown(id) {
    const s = loadState();
    s.lastPopupTime = Date.now();
    s.dismissed = s.dismissed || {};
    s.dismissed[id] = (s.dismissed[id] || 0) + 1;
    saveState(s);
  }

  function wasDismissedRecently(id, times = 2) {
    const s = loadState();
    return (s.dismissed || {})[id] >= times;
  }

  /* ─────────────────────────────────────────
     POPUP TEMPLATES
  ───────────────────────────────────────── */
  const POPUPS = {
    afterLogin: {
      id: "after_login",
      icon: "🚀",
      title: "Unlock Higher Earnings",
      body: "You have active slots generating rewards. Upgrading to the next level increases your earning potential, gives you access to higher reward pools, and maximises mining benefits.",
      cta: "Upgrade Now",
      ctaAction: () => UpgradeSystem.goToSlots(),
    },
    afterClaim: {
      id: "after_claim",
      icon: "⭐",
      title: "You're Ready for the Next Level",
      body: "Based on your recent claim activity, you qualify for the next slot upgrade. Higher slots unlock larger reward opportunities and stronger team earning potential.",
      cta: "View Upgrade",
      ctaAction: () => UpgradeSystem.goToSlots(),
    },
    idle: {
      id: "idle_dashboard",
      icon: "💎",
      title: "Maximize Your Rewards",
      body: "Members in higher slots enjoy greater earning opportunities, enhanced pool participation, and access to premium reward levels. Your next level is within reach.",
      cta: "Upgrade Slot",
      ctaAction: () => UpgradeSystem.goToSlots(),
    },
    enoughEarnings: {
      id: "enough_earnings",
      icon: "🔥",
      title: "New Opportunity Available",
      body: "A higher slot is now available for your account. Upgrade now to expand your earning capacity and unlock additional platform benefits without delay.",
      cta: "Upgrade Now",
      ctaAction: () => UpgradeSystem.goToSlots(),
    },
    slotAvailable: {
      id: "slot_available",
      icon: "⚡",
      title: "Higher Slot Unlocked",
      body: "Congratulations — a new slot tier is now available for your wallet. Activate it now to start earning at a higher rate immediately.",
      cta: "Activate Slot",
      ctaAction: () => UpgradeSystem.goToSlots(),
    },
    viewingSlots: {
      id: "viewing_slots",
      icon: "📈",
      title: "Ready to Level Up?",
      body: "You're browsing slots — that tells us you're serious. Members who upgrade consistently see compounding reward growth across mining, referral, and pool income streams.",
      cta: "Choose a Slot",
      ctaAction: () => UpgradeSystem.goToSlots(),
    },
  };

  /* ─────────────────────────────────────────
     MODAL RENDERER
  ───────────────────────────────────────── */
  function renderModal(popup, opts = {}) {
    if (!canShowPopup()) {
      // fallback: show a subtle toast instead
      showUpgradeToast(popup);
      return;
    }
    if (wasDismissedRecently(popup.id, 3)) return;

    const id = "mpol-upgrade-modal-" + popup.id;
    if (document.getElementById(id)) return;

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "mpol-upgrade-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    overlay.innerHTML = `
      <div class="mpol-upgrade-modal">
        <button class="mpol-upgrade-dismiss" aria-label="Dismiss">
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="mpol-upgrade-header">
          <div class="mpol-upgrade-icon-wrap">
            <span class="mpol-upgrade-emoji">${popup.icon}</span>
            <div class="mpol-upgrade-icon-ring"></div>
          </div>
          <div class="mpol-upgrade-badge">
            <span class="mpol-upgrade-badge-dot"></span>
            Upgrade Available
          </div>
        </div>

        <div class="mpol-upgrade-body">
          <h2 class="mpol-upgrade-title">${popup.title}</h2>
          <p class="mpol-upgrade-desc">${popup.body}</p>

          ${opts.slotLabel ? `
            <div class="mpol-upgrade-slot-chip">
              <i class="fa-solid fa-layer-group"></i>
              ${opts.slotLabel}
            </div>` : ""}
        </div>

        <div class="mpol-upgrade-footer">
          <button class="mpol-upgrade-cta btn btn-primary btn-glow">
            ${popup.cta}
            <i class="fa-solid fa-arrow-right"></i>
          </button>
          <button class="mpol-upgrade-later">Maybe later</button>
        </div>

        <div class="mpol-upgrade-glow-bg"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add("mpol-upgrade-visible"));
    });

    // Dismiss handlers
    function dismiss() {
      overlay.classList.remove("mpol-upgrade-visible");
      setTimeout(() => overlay.remove(), 400);
      recordPopupShown(popup.id);
    }

    overlay.querySelector(".mpol-upgrade-dismiss").addEventListener("click", dismiss);
    overlay.querySelector(".mpol-upgrade-later").addEventListener("click", dismiss);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });

    // CTA
    overlay.querySelector(".mpol-upgrade-cta").addEventListener("click", () => {
      dismiss();
      popup.ctaAction();
    });

    recordPopupShown(popup.id);
  }

  /* ─────────────────────────────────────────
     UPGRADE TOAST
  ───────────────────────────────────────── */
  function showUpgradeToast(popup, message = null) {
    const msg = message ||
      `${popup.icon} ${popup.title} — ${popup.cta}.`;

    // Use existing MetaPOL toast if available
    if (window.metapolApp && window.metapolApp.showToast) {
      window.metapolApp.showToast(msg, "info");
      return;
    }

    // Fallback standalone toast
    let container = document.getElementById("mpol-upgrade-toasts");
    if (!container) {
      container = document.createElement("div");
      container.id = "mpol-upgrade-toasts";
      container.style.cssText = `
        position:fixed;bottom:28px;left:24px;z-index:8888;
        display:flex;flex-direction:column;gap:10px;max-width:340px;width:calc(100% - 48px);
      `;
      document.body.appendChild(container);
    }

    const t = document.createElement("div");
    t.className = "mpol-upgrade-toast";
    t.innerHTML = `
      <div class="mpol-upgrade-toast-icon">${popup.icon}</div>
      <div class="mpol-upgrade-toast-content">
        <div class="mpol-upgrade-toast-title">${popup.title}</div>
        <div class="mpol-upgrade-toast-msg">Tap to view upgrade options.</div>
      </div>
      <button class="mpol-upgrade-toast-close"><i class="fa-solid fa-xmark"></i></button>
    `;

    container.appendChild(t);
    requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add("mpol-toast-show")); });

    function removeToast() {
      t.classList.remove("mpol-toast-show");
      setTimeout(() => t.remove(), 350);
    }

    t.querySelector(".mpol-upgrade-toast-close").addEventListener("click", removeToast);
    t.addEventListener("click", (e) => {
      if (!e.target.closest(".mpol-upgrade-toast-close")) {
        removeToast();
        UpgradeSystem.goToSlots();
      }
    });

    setTimeout(removeToast, 8000);
  }

  /* ─────────────────────────────────────────
     ELIGIBLE SLOT TOAST (inline reminder)
  ───────────────────────────────────────── */
  function showEligibleSlotToast(slotLevel) {
    const msg = `⚡ You're eligible for Slot ${slotLevel}. Upgrade now to unlock higher earning opportunities.`;
    if (window.metapolApp && window.metapolApp.showToast) {
      window.metapolApp.showToast(msg, "info");
    } else {
      showUpgradeToast(POPUPS.slotAvailable, msg);
    }
  }

  /* ─────────────────────────────────────────
     IDLE TIMER
  ───────────────────────────────────────── */
  let idleTimer = null;

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    const delay = CFG.idleMs[0] + Math.random() * (CFG.idleMs[1] - CFG.idleMs[0]);
    idleTimer = setTimeout(() => {
      // Only trigger if user is on dashboard page
      if (window.location.pathname.includes("dashboard")) {
        renderModal(POPUPS.idle);
      }
    }, delay);
  }

  function initIdleTracker() {
    ["mousemove", "keydown", "touchstart", "scroll", "click"].forEach((ev) => {
      document.addEventListener(ev, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  /* ─────────────────────────────────────────
     TAB OBSERVER — fire when user opens Slots
  ───────────────────────────────────────── */
  function observeTabSwitches() {
    // Intercept the existing switchTab function in dashboard.js
    const _original = window.switchTab;
    if (typeof _original === "function") {
      window.switchTab = function (tabId) {
        _original(tabId);
        if (tabId === "slots") {
          setTimeout(() => renderModal(POPUPS.viewingSlots), 1800);
        }
      };
      return;
    }

    // MutationObserver fallback — watch for slots panel becoming active
    const observer = new MutationObserver(() => {
      const slotsPanel = document.getElementById("tab-slots") ||
        document.querySelector("[data-tab='slots'].active") ||
        document.querySelector(".tab-panel.active[id*='slot']");
      if (slotsPanel && slotsPanel.classList.contains("active")) {
        observer.disconnect();
        setTimeout(() => renderModal(POPUPS.viewingSlots), 1800);
      }
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  /* ─────────────────────────────────────────
     HOOK — After wallet connects / login
  ───────────────────────────────────────── */
  function hookWalletConnect() {
    const checkInterval = setInterval(() => {
      if (window.metapolApp && window.metapolApp.connectWallet) {
        const _orig = window.metapolApp.connectWallet.bind(window.metapolApp);
        window.metapolApp.connectWallet = async function (...args) {
          const result = await _orig(...args);
          // After connect, fire after-login popup with 4 sec delay
          if (window.metapolApp.isConnected) {
            setTimeout(() => renderModal(POPUPS.afterLogin), 4000);
          }
          return result;
        };
        clearInterval(checkInterval);
      }
    }, 300);
  }

  /* ─────────────────────────────────────────
     HOOK — After claim mining rewards
  ───────────────────────────────────────── */
  function hookClaimFunctions() {
    // Watch dashboard.js for claimMiningRewards calls
    const checkInterval = setInterval(() => {
      // Look for the claim buttons in the DOM and intercept
      const claimBtns = document.querySelectorAll(
        "[onclick*='claimMining'], [onclick*='claimPassive'], #btn-claim-mining, .btn-claim-mining, [data-action='claim']"
      );
      claimBtns.forEach((btn) => {
        if (btn.dataset.mpolHooked) return;
        btn.dataset.mpolHooked = "1";
        btn.addEventListener("click", () => {
          // Fire after a short delay so the actual claim tx can complete
          setTimeout(() => renderModal(POPUPS.afterClaim), 6000);
        });
      });

      // Also hook the global claimMiningRewards if exposed
      if (window.claimMiningRewards && !window.claimMiningRewards._mpolHooked) {
        const _orig = window.claimMiningRewards;
        window.claimMiningRewards = async function (...args) {
          const result = await _orig(...args);
          setTimeout(() => renderModal(POPUPS.afterClaim), 5000);
          return result;
        };
        window.claimMiningRewards._mpolHooked = true;
        clearInterval(checkInterval);
      }
    }, 500);

    // Stop checking after 30 sec
    setTimeout(() => clearInterval(checkInterval), 30000);
  }

  /* ─────────────────────────────────────────
     HOOK — Check earnings & slot availability
  ───────────────────────────────────────── */
  function hookEarningsCheck() {
    // Poll the existing dashboard UI for claimable value
    const checkInterval = setInterval(() => {
      const claimableEl =
        document.getElementById("live-mining-counter") ||
        document.getElementById("mining-claimable-val") ||
        document.querySelector(".claimable-widget-value");

      if (!claimableEl) return;

      const text = claimableEl.textContent || "";
      const match = text.match(/[\d.]+/);
      if (!match) return;

      const earned = parseFloat(match[0]);
      if (isNaN(earned)) return;

      // Check slot cards for upgradeable slots
      const upgradeableCards = document.querySelectorAll(".slot-card.upgradeable-slot, .slot-card[data-status='available']");
      if (upgradeableCards.length > 0) {
        const firstCard = upgradeableCards[0];
        const level = firstCard.dataset.slot || firstCard.querySelector(".slot-number")?.textContent?.trim();
        if (level) {
          // Show toast reminder — non-intrusive
          const s = loadState();
          const lastSlotToast = s.lastSlotToast || 0;
          if (Date.now() - lastSlotToast > 10 * 60 * 1000) {
            showEligibleSlotToast(level);
            s.lastSlotToast = Date.now();
            saveState(s);
          }
        }
        // Show popup if enough earnings
        if (earned >= 0.01) {
          clearInterval(checkInterval);
          setTimeout(() => renderModal(POPUPS.enoughEarnings), 3000);
        }
      }
    }, 10000); // check every 10 sec

    setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000); // stop after 5 min
  }

  /* ─────────────────────────────────────────
     INJECT CSS
  ───────────────────────────────────────── */
  function injectStyles() {
    const style = document.createElement("style");
    style.id = "mpol-upgrade-system-css";
    style.textContent = `
/* ── MetaPOL Upgrade System Styles ── */

.mpol-upgrade-overlay {
  position: fixed;
  inset: 0;
  z-index: 9900;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 16px 0;
  background: rgba(6, 11, 24, 0);
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  transition: background 0.4s ease, backdrop-filter 0.4s ease;
  pointer-events: none;
}

.mpol-upgrade-overlay.mpol-upgrade-visible {
  background: rgba(6, 11, 24, 0.65);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  pointer-events: all;
}

.mpol-upgrade-modal {
  position: relative;
  width: 100%;
  max-width: 420px;
  background: linear-gradient(160deg, #0D1530 0%, #0A1128 60%, #06193A 100%);
  border: 1px solid rgba(43, 127, 255, 0.22);
  border-bottom: none;
  border-radius: 24px 24px 0 0;
  padding: 28px 24px 36px;
  box-shadow:
    0 -12px 60px rgba(6, 11, 24, 0.7),
    0 0 0 1px rgba(255,255,255,0.04) inset;
  overflow: hidden;
  transform: translateY(100px);
  opacity: 0;
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.35s ease;
}

.mpol-upgrade-overlay.mpol-upgrade-visible .mpol-upgrade-modal {
  transform: translateY(0);
  opacity: 1;
}

/* Top highlight line */
.mpol-upgrade-modal::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 1px;
  background: linear-gradient(90deg, transparent 5%, rgba(43,127,255,0.6) 40%, rgba(0,229,180,0.5) 70%, transparent 95%);
}

/* Ambient glow blob */
.mpol-upgrade-glow-bg {
  position: absolute;
  top: -80px; right: -60px;
  width: 240px; height: 240px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(43,127,255,0.12) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.mpol-upgrade-modal > *:not(.mpol-upgrade-glow-bg) {
  position: relative;
  z-index: 1;
}

/* Dismiss X */
.mpol-upgrade-dismiss {
  position: absolute;
  top: 16px; right: 16px;
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(180,195,235,0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  transition: background 0.2s, color 0.2s;
}
.mpol-upgrade-dismiss:hover {
  background: rgba(255,255,255,0.12);
  color: white;
}

/* Header */
.mpol-upgrade-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.mpol-upgrade-icon-wrap {
  position: relative;
  width: 52px; height: 52px;
  flex-shrink: 0;
}

.mpol-upgrade-emoji {
  font-size: 2rem;
  line-height: 52px;
  display: block;
  text-align: center;
  filter: drop-shadow(0 0 10px rgba(43,127,255,0.4));
}

.mpol-upgrade-icon-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px solid transparent;
  border-top-color: rgba(43,127,255,0.6);
  border-bottom-color: rgba(0,229,180,0.4);
  animation: mpol-spin 2.5s linear infinite;
}
@keyframes mpol-spin { to { transform: rotate(360deg); } }

.mpol-upgrade-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(0,229,180,0.08);
  border: 1px solid rgba(0,229,180,0.2);
  color: #00e5b4;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.mpol-upgrade-badge-dot {
  width: 6px; height: 6px;
  background: #00e5b4;
  border-radius: 50%;
  box-shadow: 0 0 6px #00e5b4;
  animation: mpol-pulse 1.4s ease infinite;
}
@keyframes mpol-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.6; }
}

/* Body */
.mpol-upgrade-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.3rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 10px;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.mpol-upgrade-desc {
  font-size: 0.875rem;
  color: rgba(180,195,235,0.75);
  line-height: 1.65;
  margin: 0 0 18px;
}

.mpol-upgrade-slot-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(43,127,255,0.1);
  border: 1px solid rgba(43,127,255,0.25);
  color: #5ca0ff;
  padding: 6px 14px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 18px;
}

/* Footer */
.mpol-upgrade-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mpol-upgrade-cta {
  width: 100%;
  padding: 14px;
  font-size: 0.95rem;
  border-radius: 12px;
  background: linear-gradient(135deg, #1A4DC4 0%, #7C4DFF 100%);
  color: #fff;
  font-weight: 700;
  border: 1px solid rgba(255,255,255,0.12);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 4px 20px rgba(43,127,255,0.35), 0 1px 0 rgba(255,255,255,0.1) inset;
  transition: box-shadow 0.25s, transform 0.2s;
  font-family: 'Space Grotesk', sans-serif;
}
.mpol-upgrade-cta:hover {
  box-shadow: 0 8px 30px rgba(43,127,255,0.5);
  transform: translateY(-2px);
}

.mpol-upgrade-later {
  background: transparent;
  border: none;
  color: rgba(180,195,235,0.45);
  font-size: 0.8rem;
  cursor: pointer;
  text-align: center;
  padding: 6px;
  transition: color 0.2s;
  font-family: 'Inter', sans-serif;
}
.mpol-upgrade-later:hover { color: rgba(180,195,235,0.8); }

/* ── STANDALONE TOAST ── */
.mpol-upgrade-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(10,18,40,0.95);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(43,127,255,0.2);
  border-left: 3px solid #2b7fff;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 8px 30px rgba(6,11,24,0.6);
  cursor: pointer;
  transform: translateX(-110%);
  opacity: 0;
  transition: transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275), opacity 0.35s ease;
}
.mpol-upgrade-toast.mpol-toast-show {
  transform: translateX(0);
  opacity: 1;
}

.mpol-upgrade-toast-icon { font-size: 1.4rem; flex-shrink: 0; }
.mpol-upgrade-toast-content { flex: 1; min-width: 0; }
.mpol-upgrade-toast-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.82rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
}
.mpol-upgrade-toast-msg { font-size: 0.75rem; color: rgba(180,195,235,0.65); }
.mpol-upgrade-toast-close {
  background: transparent;
  border: none;
  color: rgba(180,195,235,0.4);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 2px;
  flex-shrink: 0;
  transition: color 0.2s;
}
.mpol-upgrade-toast-close:hover { color: white; }

/* Desktop: show as centered bottom-sheet style modal */
@media (min-width: 640px) {
  .mpol-upgrade-overlay {
    align-items: center;
    padding: 20px;
  }
  .mpol-upgrade-modal {
    border-radius: 20px;
    border: 1px solid rgba(43,127,255,0.22);
    transform: translateY(30px) scale(0.95);
    max-width: 440px;
  }
  .mpol-upgrade-overlay.mpol-upgrade-visible .mpol-upgrade-modal {
    transform: translateY(0) scale(1);
  }
}
    `;
    document.head.appendChild(style);
  }

  /* ─────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────── */
  window.UpgradeSystem = {
    /** Navigate to the Slots tab */
    goToSlots() {
      // Try to use MetaPOL's own tab switcher
      if (typeof switchTab === "function") {
        switchTab("slots");
        return;
      }
      // Or click a tab link
      const slotsLink =
        document.querySelector("[data-tab='slots'], [onclick*=\"switchTab('slots')\"], .sidebar-link[data-tab='slots']");
      if (slotsLink) { slotsLink.click(); return; }
      // Redirect
      if (window.location.pathname.includes("dashboard")) {
        window.location.hash = "slots";
      } else {
        window.location.href = "dashboard.html#slots";
      }
    },

    /** Manually trigger a specific popup by name */
    trigger(name, opts = {}) {
      const popup = POPUPS[name];
      if (!popup) return console.warn("UpgradeSystem: unknown popup:", name);
      renderModal(popup, opts);
    },

    /** Show a slot-eligible toast */
    notifyEligibleSlot(level) {
      showEligibleSlotToast(level);
    },

    /** Reset all tracking (useful for testing) */
    resetTracking() {
      localStorage.removeItem(CFG.storageKey);
      console.log("UpgradeSystem: tracking reset.");
    },
  };

  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  function init() {
    injectStyles();
    hookWalletConnect();
    hookClaimFunctions();
    observeTabSwitches();
    initIdleTracker();

    // Start earnings check after 20 sec (dashboard needs time to load)
    setTimeout(hookEarningsCheck, 20000);

    console.log("%c[MetaPOL] Upgrade System ✓", "color:#2b7fff;font-weight:bold");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
