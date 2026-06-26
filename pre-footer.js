/**
 * MetaPOL Pre-Footer Section v1.0
 * Referral Share Center · Team Milestones · Slot Progress Card
 */
;(function () {
  "use strict";

  /* ─────────────────────────────────
     MILESTONE CONFIG
  ───────────────────────────────── */
  const MILESTONES = [
    { refs: 5,  emoji: "🌟", label: "Rising Star",   reward: "Referral Bonus Active"  },
    { refs: 10, emoji: "🎉", label: "Team Builder",  reward: "Enhanced Pool Access"   },
    { refs: 25, emoji: "🚀", label: "Growth Leader", reward: "Priority Reward Queue"  },
    { refs: 50, emoji: "💎", label: "Elite Partner", reward: "Premium Tier Unlocked"  },
  ];

  /* ─────────────────────────────────
     SLOT CONFIG (mirrors contract)
  ───────────────────────────────── */
  const SLOTS = [
    { level: 1, price: 10,   dailyRate: 0.01  },
    { level: 2, price: 25,   dailyRate: 0.025 },
    { level: 3, price: 50,   dailyRate: 0.05  },
    { level: 4, price: 100,  dailyRate: 0.10  },
    { level: 5, price: 250,  dailyRate: 0.25  },
    { level: 6, price: 500,  dailyRate: 0.50  },
  ];

  /* ─────────────────────────────────
     STORAGE helpers
  ───────────────────────────────── */
  const SK = "mpol_pfs";
  function loadPFS() { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch { return {}; } }
  function savePFS(d) { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} }

  /* ─────────────────────────────────
     1. REFERRAL SHARE CENTER
  ───────────────────────────────── */
  window.pfsShareCenter = {
    /** Sync the referral link from the existing dashboard input */
    syncLink() {
      const src = document.getElementById("referral-link-input");
      const dst = document.getElementById("pfs-referral-input");
      if (!src || !dst) return;
      const val = src.value;
      if (val && !val.toLowerCase().includes("connect")) dst.value = val;
    },

    copyLink() {
      const input = document.getElementById("pfs-referral-input");
      if (!input || !input.value || input.value.includes("Connect")) {
        if (window.metapolApp?.showToast) window.metapolApp.showToast("Connect wallet to generate link", "warning");
        return;
      }
      navigator.clipboard.writeText(input.value).then(() => {
        const label = document.getElementById("pfs-copy-label");
        const btn   = document.getElementById("pfs-copy-btn");
        if (label) label.textContent = "Copied!";
        if (btn) btn.classList.add("pfs-copy-success");
        if (window.metapolApp?.showToast) window.metapolApp.showToast("Referral link copied!", "success");
        setTimeout(() => {
          if (label) label.textContent = "Copy";
          if (btn) btn.classList.remove("pfs-copy-success");
        }, 2000);
      });
    },

    share(platform) {
      // Delegate to the existing shareReferral function
      if (typeof shareReferral === "function") {
        shareReferral(platform);
        return;
      }
      const rawLink = document.getElementById("pfs-referral-input")?.value || "";
      if (!rawLink || rawLink.includes("Connect")) {
        if (window.metapolApp?.showToast) window.metapolApp.showToast("Connect wallet to share", "warning");
        return;
      }
      const link = encodeURIComponent(rawLink);
      const msg  = encodeURIComponent("🚀 Join MetaPOL — Decentralized Matrix & Passive Mining on Polygon. Use my referral: ");
      const urls = {
        whatsapp: `https://api.whatsapp.com/send?text=${msg}${link}`,
        telegram:  `https://t.me/share/url?url=${link}&text=${msg}`,
        facebook:  `https://www.facebook.com/sharer/sharer.php?u=${link}`,
        twitter:   `https://twitter.com/intent/tweet?text=${msg}${link}`,
      };
      if (urls[platform]) window.open(urls[platform], "_blank", "noopener");
    },

    /** Pull live stats from hidden DOM elements set by dashboard.js */
    syncStats() {
      const d = document.getElementById("pfs-directs-count");
      const t = document.getElementById("pfs-team-count");
      const e = document.getElementById("pfs-ref-earnings");
      const srcD = document.getElementById("team-directs-count") || document.getElementById("stat-direct-referrals");
      const srcT = document.getElementById("team-total-count") || document.getElementById("stat-team-size");
      const srcE = document.getElementById("team-total-earnings") || document.getElementById("stat-commission");
      if (d && srcD) d.textContent = srcD.textContent || "0";
      if (t && srcT) t.textContent = srcT.textContent || "0";
      if (e && srcE) e.textContent = parseFloat(srcE.textContent || "0").toFixed(2);
    },
  };

  /* ─────────────────────────────────
     2. TEAM MILESTONE POPUP
  ───────────────────────────────── */
  window.pfsMilestonePopup = {
    overlay: null,

    init() { this.overlay = document.getElementById("pfs-milestone-overlay"); },

    /** Called with the current direct referrals count */
    check(directs) {
      directs = parseInt(directs) || 0;
      const state = loadPFS();
      state.seenMilestones = state.seenMilestones || [];

      // Build milestone list UI
      pfsMilestonePopup._renderList(directs);

      // Check if any new milestone just crossed
      for (const ms of MILESTONES) {
        if (directs >= ms.refs && !state.seenMilestones.includes(ms.refs)) {
          state.seenMilestones.push(ms.refs);
          savePFS(state);
          setTimeout(() => pfsMilestonePopup._showPopup(ms, directs), 1200);
          break; // show one at a time
        }
      }
    },

    _renderList(directs) {
      const list = document.getElementById("pfs-milestone-list");
      if (!list) return;
      list.innerHTML = MILESTONES.map(ms => {
        const done = directs >= ms.refs;
        const pct  = Math.min(100, Math.round((directs / ms.refs) * 100));
        return `
          <div class="pfs-milestone-item${done ? " pfs-ms-done" : ""}">
            <div class="pfs-ms-left">
              <div class="pfs-ms-icon ${done ? "pfs-ms-complete" : "pfs-ms-locked"}">
                ${done ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-lock"></i>'}
              </div>
              <div>
                <div class="pfs-ms-title">${ms.refs} Direct Referrals</div>
                <div class="pfs-ms-sub">${done ? ms.reward : `${directs}/${ms.refs} — ${pct}%`}</div>
                ${!done ? `<div class="pfs-ms-bar"><div class="pfs-ms-bar-fill" style="width:${pct}%"></div></div>` : ""}
              </div>
            </div>
            <div class="pfs-ms-badge ${done ? "pfs-ms-badge-done" : "pfs-ms-badge-locked"}">
              ${done ? ms.label : "Locked"}
            </div>
          </div>
        `;
      }).join("");
    },

    _showPopup(ms, directs) {
      if (!this.overlay) this.overlay = document.getElementById("pfs-milestone-overlay");
      if (!this.overlay) return;
      document.getElementById("pfs-modal-emoji").textContent  = ms.emoji;
      document.getElementById("pfs-modal-title").textContent  = "Congratulations!";
      document.getElementById("pfs-modal-sub").textContent    = `You have reached ${ms.refs} Direct Referrals.`;
      document.getElementById("pfs-modal-badge-text").textContent = `${ms.refs} Referrals · ${ms.label}`;
      this._launchConfetti();
      this.overlay.classList.add("pfs-ms-overlay-visible");
    },

    dismiss() {
      if (this.overlay) this.overlay.classList.remove("pfs-ms-overlay-visible");
    },

    _launchConfetti() {
      const container = document.getElementById("pfs-confetti");
      if (!container) return;
      container.innerHTML = "";
      const colors = ["#2B7FFF","#7C4DFF","#00E5B4","#FFB547","#FF4B6B","#FFFFFF"];
      for (let i = 0; i < 48; i++) {
        const p = document.createElement("div");
        p.className = "pfs-confetti-piece";
        p.style.cssText = `
          left:${Math.random()*100}%;
          background:${colors[Math.floor(Math.random()*colors.length)]};
          width:${6+Math.random()*6}px;
          height:${6+Math.random()*6}px;
          border-radius:${Math.random()>0.5?"50%":"2px"};
          animation-delay:${Math.random()*0.6}s;
          animation-duration:${1.2+Math.random()*0.8}s;
        `;
        container.appendChild(p);
      }
    },
  };

  /* ─────────────────────────────────
     3. SLOT PROGRESS CARD
  ───────────────────────────────── */
  window.pfsSlotProgress = {
    currentLevel: 0,

    /** 
     * Update the card. Pass the highest active slot level.
     * Called after dashboard.js syncs slot state.
     */
    update(highestActiveSlot, claimableEarnings = 0) {
      highestActiveSlot  = parseInt(highestActiveSlot) || 0;
      claimableEarnings  = parseFloat(claimableEarnings) || 0;
      this.currentLevel  = highestActiveSlot;

      const cur  = SLOTS.find(s => s.level === highestActiveSlot);
      const next = SLOTS.find(s => s.level === highestActiveSlot + 1);

      // Update slot labels
      document.getElementById("pfs-current-slot").textContent = cur  ? `Slot ${cur.level}`  : "None";
      document.getElementById("pfs-next-slot").textContent    = next ? `Slot ${next.level}` : "—";

      const ctaWrap  = document.getElementById("pfs-upgrade-cta-wrap");
      const maxMsg   = document.getElementById("pfs-max-slot-msg");

      if (!next) {
        // Max slot reached
        ctaWrap.style.display  = "none";
        maxMsg.style.display   = "flex";
        document.getElementById("pfs-progress-fill").style.width = "100%";
        document.getElementById("pfs-progress-pct").textContent   = "100%";
        document.getElementById("pfs-progress-msg").textContent   = "Maximum slot reached";
        document.getElementById("pfs-upgrade-cost").textContent   = "—";
        document.getElementById("pfs-daily-increase").textContent = "—";
        return;
      }

      maxMsg.style.display  = "none";
      ctaWrap.style.display = "block";

      // Progress: earnings vs next slot price
      const pct = next ? Math.min(100, Math.round((claimableEarnings / next.price) * 100)) : 0;
      document.getElementById("pfs-progress-fill").style.width = pct + "%";
      document.getElementById("pfs-progress-pct").textContent  = pct + "%";
      document.getElementById("pfs-upgrade-cost").textContent  = `${next.price} POL`;
      document.getElementById("pfs-daily-increase").textContent = `+${(next.dailyRate - (cur?.dailyRate || 0)).toFixed(3)} POL/day`;

      const fireMsg  = document.getElementById("pfs-fire-text");
      const fireWrap = document.getElementById("pfs-fire-msg");

      if (pct >= 80) {
        document.getElementById("pfs-progress-msg").textContent = "🔥 You're very close to the next level!";
        if (fireWrap) fireWrap.style.display = "flex";
        if (fireMsg)  fireMsg.style.display = 'none';
      } else if (pct >= 50) {
        document.getElementById("pfs-progress-msg").textContent = "⚡ Good momentum — keep growing!";
        if (fireWrap) fireWrap.style.display = "none";
      } else {
        document.getElementById("pfs-progress-msg").textContent = `Start earning to unlock Slot ${next.level}`;
        if (fireWrap) fireWrap.style.display = "none";
      }
    },

    clickUpgrade() {
      if (typeof switchTab === "function") switchTab("slots");
      else {
        const btn = document.querySelector(`[data-tab='slots']`);
        if (btn) btn.click();
      }
      // Scroll to slots section smoothly
      setTimeout(() => {
        const el = document.getElementById("tab-slots") || document.getElementById("slots-cards-grid");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
    },
  };

  /* ─────────────────────────────────
     AUTO-SYNC LOOP
  ───────────────────────────────── */
  function syncAll() {
    pfsShareCenter.syncLink();
    pfsShareCenter.syncStats();

    // Read directs count from hidden DOM elements
    const directsEl = document.getElementById("team-directs-count")
      || document.getElementById("stat-direct-referrals");
    const directs = parseInt(directsEl?.textContent || "0") || 0;
    pfsMilestonePopup.check(directs);

    // Read highest active slot from contract data (set by dashboard.js)
    let highest = 0;
    if (window._mpolActiveSlots && Array.isArray(window._mpolActiveSlots)) {
      window._mpolActiveSlots.forEach((isActive, idx) => {
        if (isActive) highest = idx + 1;
      });
    } else {
      // Fallback: DOM
      document.querySelectorAll(".slot-card.active-slot").forEach(card => {
        const txt = card.querySelector(".slot-number")?.textContent || "";
        const lvl = parseInt(txt.replace(/[^0-9]/g,"")) || 0;
        if (lvl > highest) highest = lvl;
      });
    }

    // Claimable earnings
    const claimEl = document.getElementById("live-mining-counter")
      || document.getElementById("mining-tab-claimable");
    const earned = parseFloat(claimEl?.textContent?.replace(/[^\d.]/g,"") || "0") || 0;

    pfsSlotProgress.update(highest, earned);
  }

  /* ─────────────────────────────────
     INJECT CSS
  ───────────────────────────────── */
  function injectStyles() {
    const s = document.createElement("style");
    s.id = "mpol-pfs-css";
    s.textContent = `
/* ══ Pre-Footer Section ══ */
.pre-footer-section {
  padding: 60px 0 0;
  position: relative;
}

.pfs-inner {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Shared card base ── */
.pfs-card {
  position: relative;
  background: linear-gradient(145deg, rgba(13,21,48,0.92) 0%, rgba(10,18,54,0.96) 100%);
  border: 1px solid rgba(43,127,255,0.18);
  border-radius: 20px;
  padding: 28px;
  overflow: hidden;
  box-shadow: 0 4px 30px rgba(6,11,24,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
  transition: border-color 0.25s;
}
.pfs-card:hover { border-color: rgba(43,127,255,0.35); }
.pfs-card > * { position: relative; z-index: 1; }

.pfs-card-glow {
  position: absolute; top: -80px; right: -60px;
  width: 260px; height: 260px; border-radius: 50%;
  filter: blur(80px); opacity: 0.2; pointer-events: none; z-index: 0;
}
.pfs-glow-blue   { background: radial-gradient(circle, #2B7FFF, transparent); }
.pfs-glow-purple { background: radial-gradient(circle, #7C4DFF, transparent); }
.pfs-glow-cyan   { background: radial-gradient(circle, #00E5B4, transparent); }

/* ── Section title ── */
.pfs-section-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1rem; font-weight: 700;
  color: #fff; margin: 0 0 20px;
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(43,127,255,0.1);
}
.pfs-section-title i { color: #2b7fff; }

/* ══ 1. SHARE CENTER ══ */
.pfs-share-center {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 36px;
  align-items: start;
}

/* Badge */
.pfs-badge {
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(0,229,180,0.08);
  border: 1px solid rgba(0,229,180,0.2);
  color: #00e5b4;
  padding: 4px 12px; border-radius: 20px;
  font-size: 0.72rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 14px;
}
.pfs-badge-dot {
  width: 6px; height: 6px; background: #00e5b4;
  border-radius: 50%; box-shadow: 0 0 6px #00e5b4;
  animation: pfs-pulse 1.4s ease infinite;
}
@keyframes pfs-pulse {
  0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.6}
}

.pfs-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.5rem; font-weight: 700; color: #fff;
  margin: 0 0 10px; letter-spacing: -0.02em;
}
.pfs-desc { color: rgba(180,195,235,0.7); font-size: 0.875rem; line-height: 1.65; margin: 0 0 20px; }

.pfs-link-row { display: flex; gap: 10px; align-items: center; }
.pfs-link-input-wrap { flex: 1; }

.pfs-copy-btn {
  padding: 10px 18px; border-radius: 10px; white-space: nowrap;
  transition: all 0.25s;
}
.pfs-copy-success {
  background: linear-gradient(135deg, #00E5B4, #00B8E0) !important;
  color: #060b18 !important;
  box-shadow: 0 4px 16px rgba(0,229,180,0.35) !important;
}

/* Share grid */
.pfs-share-label {
  font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: rgba(180,195,235,0.55); margin-bottom: 14px;
}
.pfs-share-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 22px;
}
.pfs-share-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-radius: 12px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  color: rgba(180,195,235,0.8); cursor: pointer;
  font-family: 'Space Grotesk', sans-serif; font-size: 0.85rem; font-weight: 600;
  transition: all 0.22s;
}
.pfs-share-btn i { font-size: 1.1rem; }
.pfs-share-btn:hover { transform: translateY(-2px); }
.pfs-wa:hover { background: #25D366; color: #fff; border-color: #25D366; box-shadow: 0 4px 14px rgba(37,211,102,0.3); }
.pfs-tg:hover { background: #0088cc; color: #fff; border-color: #0088cc; box-shadow: 0 4px 14px rgba(0,136,204,0.3); }
.pfs-fb:hover { background: #1877F2; color: #fff; border-color: #1877F2; box-shadow: 0 4px 14px rgba(24,119,242,0.3); }
.pfs-tw:hover { background: #000; color: #fff; border-color: #555; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }

/* Share stats */
.pfs-share-stats {
  display: flex; align-items: center; gap: 0;
  background: rgba(43,127,255,0.05); border: 1px solid rgba(43,127,255,0.12);
  border-radius: 12px; padding: 14px 18px;
}
.pfs-share-stat { flex: 1; text-align: center; }
.pfs-share-stat-val { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 1.3rem; font-weight: 700; color: #fff; }
.pfs-share-stat-lbl { font-size: 0.68rem; color: rgba(180,195,235,0.55); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 3px; display: block; }
.pfs-share-stat-divider { width: 1px; background: rgba(43,127,255,0.15); align-self: stretch; margin: 0 4px; }

/* ══ 2 & 3. Bottom Row ══ */
.pfs-bottom-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

/* ══ 2. MILESTONE CARD ══ */
.pfs-milestone-list { display: flex; flex-direction: column; gap: 12px; }
.pfs-milestone-item {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 12px 0; border-bottom: 1px solid rgba(43,127,255,0.07);
}
.pfs-milestone-item:last-child { border-bottom: none; }
.pfs-milestone-item.pfs-ms-done .pfs-ms-title { color: #fff; }

.pfs-ms-left { display: flex; align-items: flex-start; gap: 14px; }

.pfs-ms-icon {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.85rem; flex-shrink: 0;
}
.pfs-ms-locked  { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: rgba(180,195,235,0.4); }
.pfs-ms-complete{ background: rgba(0,229,180,0.12); border: 1px solid rgba(0,229,180,0.3); color: #00e5b4; }

.pfs-ms-title { font-family: 'Space Grotesk', sans-serif; font-size: 0.875rem; font-weight: 600; color: rgba(180,195,235,0.85); }
.pfs-ms-sub   { font-size: 0.72rem; color: rgba(180,195,235,0.45); margin-top: 3px; }

.pfs-ms-bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 4px; margin-top: 6px; width: 130px; overflow: hidden; }
.pfs-ms-bar-fill { height: 100%; background: linear-gradient(90deg, #2B7FFF, #00E5B4); border-radius: 4px; transition: width 0.6s ease; }

.pfs-ms-badge { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 8px; white-space: nowrap; flex-shrink: 0; letter-spacing: 0.04em; }
.pfs-ms-badge-locked { background: rgba(255,255,255,0.06); color: rgba(180,195,235,0.4); }
.pfs-ms-badge-done   { background: rgba(0,229,180,0.12); color: #00e5b4; border: 1px solid rgba(0,229,180,0.25); }

/* ══ 3. SLOT PROGRESS CARD ══ */
.pfs-slot-badges-row {
  display: flex; align-items: center; gap: 14px;
  margin-bottom: 22px;
}
.pfs-slot-chip {
  flex: 1; background: rgba(43,127,255,0.06);
  border: 1px solid rgba(43,127,255,0.15);
  border-radius: 12px; padding: 12px 16px; text-align: center;
}
.pfs-slot-chip.pfs-slot-next { background: rgba(0,229,180,0.05); border-color: rgba(0,229,180,0.15); }
.pfs-slot-chip-lbl { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(180,195,235,0.5); margin-bottom: 4px; }
.pfs-slot-chip-val { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; font-weight: 700; color: #fff; }
.pfs-slot-arrow { color: rgba(180,195,235,0.3); font-size: 1rem; }

.pfs-progress-section { margin-bottom: 18px; }
.pfs-progress-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 0.8rem; color: rgba(180,195,235,0.7); }
.pfs-progress-pct { font-family: 'Space Grotesk', sans-serif; font-weight: 700; color: #fff; }
.pfs-progress-track { height: 7px; background: rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; }
.pfs-progress-fill  { height: 100%; background: linear-gradient(90deg, #2B7FFF, #00E5B4); border-radius: 6px; transition: width 0.7s cubic-bezier(0.4,0,0.2,1); position: relative; }
.pfs-progress-fill::after { content:''; position:absolute; right:0; top:0; bottom:0; width:6px; background:rgba(255,255,255,0.35); border-radius:50%; filter:blur(3px); }

.pfs-slot-detail-row { display: flex; gap: 20px; margin-bottom: 18px; }
.pfs-slot-detail { flex: 1; }
.pfs-slot-detail-lbl { font-size: 0.72rem; color: rgba(180,195,235,0.5); margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
.pfs-slot-detail-val { font-family: 'Space Grotesk', sans-serif; font-size: 0.95rem; font-weight: 700; color: #fff; }

.pfs-fire-msg {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,181,71,0.08); border: 1px solid rgba(255,181,71,0.2);
  border-radius: 10px; padding: 10px 14px;
  font-size: 0.82rem; color: rgba(255,181,71,0.9);
  margin-bottom: 14px;
}
.pfs-fire-icon { font-size: 1.2rem; }

.pfs-upgrade-btn { width: 100%; padding: 13px; border-radius: 12px; font-size: 0.9rem; }

.pfs-max-msg {
  display: flex; align-items: center; gap: 10px;
  background: rgba(255,181,71,0.07); border: 1px solid rgba(255,181,71,0.18);
  border-radius: 10px; padding: 12px 16px;
  font-size: 0.85rem; color: rgba(180,195,235,0.7);
}

/* ══ MILESTONE POPUP ══ */
.pfs-milestone-overlay {
  position: fixed; inset: 0; z-index: 9950;
  display: flex; align-items: center; justify-content: center; padding: 20px;
  background: rgba(6,11,24,0); backdrop-filter: blur(0px);
  transition: background 0.4s, backdrop-filter 0.4s;
  pointer-events: none;
}
.pfs-milestone-overlay.pfs-ms-overlay-visible {
  background: rgba(6,11,24,0.75); backdrop-filter: blur(12px); pointer-events: all;
}
.pfs-milestone-modal {
  position: relative; width: 100%; max-width: 400px;
  background: linear-gradient(160deg, #0D1530 0%, #0A1128 60%, #06193A 100%);
  border: 1px solid rgba(124,77,255,0.3);
  border-radius: 24px; padding: 40px 28px 32px;
  text-align: center; overflow: hidden;
  box-shadow: 0 24px 60px rgba(6,11,24,0.8), 0 0 40px rgba(124,77,255,0.15);
  transform: scale(0.88) translateY(20px); opacity: 0;
  transition: transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease;
}
.pfs-ms-overlay-visible .pfs-milestone-modal { transform: scale(1) translateY(0); opacity: 1; }

.pfs-milestone-modal::before {
  content: ''; position: absolute; top:0; left:0; width:100%; height:2px;
  background: linear-gradient(90deg, transparent 5%, rgba(124,77,255,0.6) 40%, rgba(0,229,180,0.5) 70%, transparent 95%);
}
.pfs-milestone-modal-glow {
  position: absolute; top: -80px; left: 50%; transform: translateX(-50%);
  width: 300px; height: 300px; border-radius: 50%;
  background: radial-gradient(circle, rgba(124,77,255,0.18), transparent);
  pointer-events: none; z-index: 0;
}
.pfs-milestone-modal > *:not(.pfs-milestone-modal-glow,.pfs-confetti) { position: relative; z-index: 1; }

.pfs-milestone-close {
  position: absolute; top: 14px; right: 14px;
  width: 30px; height: 30px; border-radius: 50%;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  color: rgba(180,195,235,0.6); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.85rem; transition: all 0.2s;
}
.pfs-milestone-close:hover { background: rgba(255,255,255,0.12); color: #fff; }

/* confetti */
.pfs-confetti { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; z-index: 0; }
.pfs-confetti-piece {
  position: absolute; top: -10px; opacity: 0;
  animation: pfs-confetti-fall 1.4s ease-in forwards;
}
@keyframes pfs-confetti-fall {
  0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
  100% { opacity: 0; transform: translateY(300px) rotate(720deg); }
}

.pfs-milestone-emoji { font-size: 3rem; display: block; margin-bottom: 12px; filter: drop-shadow(0 0 12px rgba(124,77,255,0.5)); }
.pfs-milestone-modal-title { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; color: #fff; margin: 0 0 8px; }
.pfs-milestone-modal-sub { font-size: 1rem; font-weight: 600; color: rgba(180,195,235,0.9); margin: 0 0 10px; }
.pfs-milestone-modal-body { font-size: 0.85rem; color: rgba(180,195,235,0.6); line-height: 1.6; margin: 0 0 20px; }
.pfs-milestone-modal-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(124,77,255,0.12); border: 1px solid rgba(124,77,255,0.3);
  color: #b69fff; padding: 7px 16px; border-radius: 20px;
  font-size: 0.8rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em;
  margin-bottom: 24px;
}
.pfs-milestone-modal-cta { width: 100%; padding: 13px; border-radius: 12px; font-size: 0.9rem; }

/* ══ RESPONSIVE ══ */
@media (max-width: 900px) {
  .pfs-share-center { grid-template-columns: 1fr; gap: 24px; }
  .pfs-bottom-row   { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .pfs-card { padding: 20px 16px; }
  .pfs-title { font-size: 1.25rem; }
  .pfs-share-grid { grid-template-columns: 1fr 1fr; }
}
    `;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────
     INIT
  ───────────────────────────────── */
  function init() {
    injectStyles();
    pfsMilestonePopup.init();

    // Initial sync after dashboard loads
    setTimeout(syncAll, 3000);
    // Periodic sync every 15 sec
    setInterval(syncAll, 15000);

    // Also sync when wallet connects
    const waitApp = setInterval(() => {
      if (!window.metapolApp) return;
      const origConnect = window.metapolApp.connectWallet?.bind(window.metapolApp);
      if (origConnect && !origConnect._pfsHooked) {
        window.metapolApp.connectWallet = async function (...a) {
          const r = await origConnect(...a);
          setTimeout(syncAll, 2500);
          return r;
        };
        window.metapolApp.connectWallet._pfsHooked = true;
        clearInterval(waitApp);
      }
    }, 400);
    setTimeout(() => clearInterval(waitApp), 15000);

    console.log("%c[MetaPOL] Pre-Footer Section ✓", "color:#00e5b4;font-weight:bold");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
