/**
 * MetaPOL Language Switcher
 * Header globe-icon dropdown that translates the whole page via Google's
 * translation engine (loaded invisibly), with the selection remembered
 * across pages/visits via localStorage.
 */

const METAPOL_LANGS = [
    { code: 'en',    label: 'English',   flag: '🇬🇧' },
    { code: 'hi',    label: 'हिन्दी',      flag: '🇮🇳' },
    { code: 'te',    label: 'తెలుగు',     flag: '🇮🇳' },
    { code: 'ta',    label: 'தமிழ்',      flag: '🇮🇳' },
    { code: 'es',    label: 'Español',   flag: '🇪🇸' },
    { code: 'fr',    label: 'Français',  flag: '🇫🇷' },
    { code: 'pt',    label: 'Português', flag: '🇵🇹' },
    { code: 'ru',    label: 'Русский',   flag: '🇷🇺' },
    { code: 'ar',    label: 'العربية',    flag: '🇸🇦' },
    { code: 'zh-CN', label: '中文',       flag: '🇨🇳' },
];

const METAPOL_LANG_STORAGE_KEY = 'metapol_lang';

function metapolGetSavedLang() {
    try { return localStorage.getItem(METAPOL_LANG_STORAGE_KEY) || 'en'; }
    catch { return 'en'; }
}

function metapolSaveLang(lang) {
    try { localStorage.setItem(METAPOL_LANG_STORAGE_KEY, lang); } catch {}
}

function metapolLangLabel(code) {
    const l = METAPOL_LANGS.find(x => x.code === code);
    return l ? l.label : code.toUpperCase();
}

// Builds the dropdown markup and injects it just before the given mount node.
function metapolInitLangSwitcher(mountSelector) {
    const mount = document.querySelector(mountSelector);
    if (!mount) return;

    const saved = metapolGetSavedLang();

    const wrap = document.createElement('div');
    wrap.className = 'lang-switcher';
    wrap.id = 'lang-switcher';
    wrap.innerHTML = `
        <button class="lang-switcher-btn" id="lang-switcher-btn" onclick="metapolToggleLangMenu(event)" title="Change language">
            <i class="fa-solid fa-globe"></i>
            <span class="lang-switcher-code" id="lang-switcher-code">${saved === 'en' ? 'EN' : metapolLangLabel(saved)}</span>
            <i class="fa-solid fa-chevron-down lang-chevron"></i>
        </button>
        <div class="lang-switcher-menu" id="lang-switcher-menu">
            ${METAPOL_LANGS.map(l => `
                <button type="button" class="lang-option${l.code === saved ? ' active' : ''}" data-lang="${l.code}" onclick="metapolSetLanguage('${l.code}')">
                    <span class="lang-flag">${l.flag}</span> ${l.label}
                </button>
            `).join('')}
        </div>
    `;
    mount.insertBefore(wrap, mount.firstChild);

    // Hidden mount point required by the Google Translate widget — kept
    // off-screen/invisible but functional.
    if (!document.getElementById('google_translate_element')) {
        const gte = document.createElement('div');
        gte.id = 'google_translate_element';
        gte.style.display = 'none';
        document.body.appendChild(gte);
    }

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#lang-switcher')) metapolCloseLangMenu();
    });
}

function metapolToggleLangMenu(e) {
    e.stopPropagation();
    const menu = document.getElementById('lang-switcher-menu');
    if (menu) menu.classList.toggle('open');
}
function metapolCloseLangMenu() {
    const menu = document.getElementById('lang-switcher-menu');
    if (menu) menu.classList.remove('open');
}

function metapolUpdateBadge(lang) {
    const codeEl = document.getElementById('lang-switcher-code');
    if (codeEl) codeEl.textContent = lang === 'en' ? 'EN' : metapolLangLabel(lang);
    document.querySelectorAll('.lang-option').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
    });
}

// Applies translation by driving Google's hidden <select>. Retries briefly
// while the widget is still initializing.
function metapolApplyLanguage(lang, attempt = 1) {
    const combo = document.querySelector('select.goog-te-combo');
    if (combo) {
        combo.value = lang;
        combo.dispatchEvent(new Event('change'));
        return;
    }
    if (attempt < 20) {
        setTimeout(() => metapolApplyLanguage(lang, attempt + 1), 250);
    }
}

function metapolSetLanguage(lang) {
    metapolSaveLang(lang);
    metapolUpdateBadge(lang);
    metapolCloseLangMenu();
    if (lang === 'en') {
        // Reset to original by clearing Google's translate cookie + reload,
        // which is the most reliable way back to the untranslated page.
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${location.hostname}`;
        location.reload();
    } else {
        metapolApplyLanguage(lang);
    }
}

// Called by the Google Translate script once loaded (see script tag callback).
function googleTranslateElementInit() {
    new google.translate.TranslateElement(
        { pageLanguage: 'en', autoDisplay: false },
        'google_translate_element'
    );
    const saved = metapolGetSavedLang();
    if (saved && saved !== 'en') {
        metapolApplyLanguage(saved);
    }
}
