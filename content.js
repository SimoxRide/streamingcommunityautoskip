(() => {
    const CONFIG = {
        TIMER_XPATH: '//*[@id="player"]/div[2]/div[13]/div[4]/div[2]/div[10]',
        BUTTON_XPATH: '//*[@id="player"]/div[2]/div[13]/div[4]/div[2]/div[13]',
        PLAY_BUTTON_XPATHS: [
            '//*[@id="player"]/div[2]/div[13]/div[1]/div/div/div[2]/div',
            '//*[@id="player"]/div[2]/div[13]/div[4]/div[2]/div[1]',
        ],
        PLAY_BUTTON_SELECTORS: [
            '#player .jw-display-icon-display .jw-icon-display[aria-label="Play"]',
            '#player .jw-button-container .jw-icon-playback[aria-label="Play"]',
            '#player .jw-display-icon-display [role="button"][aria-label="Play"]',
            '#player .jw-button-container [role="button"][aria-label="Play"]',
            '[data-plyr="play"]',
            ".plyr__control--overlaid",
            ".jw-icon-playback",
            ".jw-icon-display",
            '[aria-label*="play" i]',
            '[title*="play" i]',
            'button[class*="play"]',
            '[role="button"][class*="play"]',
            '[class*="play-icon"]',
        ],
        TIMER_SELECTORS: [
            "#player .jw-text-countdown",
            "#player .jw-text-elapsed",
        ],
        VIDEO_SELECTORS: ["#player video.jw-video", "#player video"],
        THRESHOLD_SECONDS: 60,
        CLICK_DELAY_MS: 3000,
        CHECK_INTERVAL_MS: 1000,
    };

    const STORAGE_KEYS = {
        enabled: "autoDemoEnabled",
        status: "autoDemoStatus",
    };

    let notificationEl = null;
    let enabled = false;
    let intervalId = null;
    let pendingTimeout = null;
    let playStartTimeout = null;
    let alreadyTriggeredForCurrentLowWindow = false;
    let lastStatus = "Disattivato";
    let countdownInterval = null;
    let playRetryInterval = null;
    let playbackRecoveryAttemptedForCurrentRun = false;

    function isContextValid() {
        try {
            return typeof chrome !== "undefined" && !!chrome.runtime?.id;
        } catch (e) {
            return false;
        }
    }

    function setLastStatus(text) {
        lastStatus = text;
    }

    function showNotification(text) {
        if (!document.body) return;

        if (!notificationEl) {
            notificationEl = document.createElement("div");
            Object.assign(notificationEl.style, {
                position: "fixed",
                top: "10px",
                right: "10px",
                zIndex: "2147483647",
                background: "rgba(0,0,0,0.85)",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                fontFamily: "Arial, sans-serif",
                pointerEvents: "none",
                transition: "opacity 0.3s",
            });
            document.body.appendChild(notificationEl);
        }

        notificationEl.textContent = text;
        notificationEl.style.opacity = "1";
    }

    function hideNotification() {
        if (notificationEl) notificationEl.style.opacity = "0";
    }

    function updateStatus(text) {
        setLastStatus(text);

        if (!isContextValid()) {
            return;
        }

        chrome.storage.local.set({ [STORAGE_KEYS.status]: text });
    }

    function getElementByXPath(xpath, root = document) {
        try {
            return document.evaluate(
                xpath,
                root,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            ).singleNodeValue;
        } catch (e) {
            console.error("XPath non valido:", xpath, e);
            return null;
        }
    }

    function findFirstByXPath(xpaths) {
        for (const xpath of xpaths) {
            const match = getElementByXPath(xpath);
            if (match) return match;
        }

        return null;
    }

    function extractTimeText(el) {
        if (!el) return null;
        return (el.textContent || el.innerText || "").trim();
    }

    function findPlayerRoot() {
        return document.getElementById("player");
    }

    function parseTimeToSeconds(timeStr) {
        if (!timeStr) return null;

        const clean = timeStr.trim();

        if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(clean)) {
            return null;
        }

        const parts = clean.split(":").map(Number);

        if (parts.length === 2) {
            const [mm, ss] = parts;
            return mm * 60 + ss;
        }

        if (parts.length === 3) {
            const [hh, mm, ss] = parts;
            return hh * 3600 + mm * 60 + ss;
        }

        return null;
    }

    function isPlayerFrame() {
        return (
            Boolean(findPlayerRoot()) ||
            window.location.pathname.includes("/iframe/")
        );
    }

    function isElementVisible(el) {
        if (!(el instanceof Element)) return false;

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number.parseFloat(style.opacity || "1") > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function getClickableTarget(el) {
        if (!(el instanceof Element)) return null;

        return (
            el.closest(
                'button, [role="button"], a, [tabindex], [onclick], div, span',
            ) || el
        );
    }

    function getTopMostTarget(el) {
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;

        if (rect.width <= 0 || rect.height <= 0) {
            return getClickableTarget(el);
        }

        const topMost = document.elementFromPoint(clientX, clientY);

        if (
            topMost &&
            (el === topMost || el.contains(topMost) || topMost.contains(el))
        ) {
            return getClickableTarget(topMost);
        }

        return getClickableTarget(el);
    }

    function dispatchMouseLikeEvent(target, type, clientX, clientY) {
        const common = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX,
            clientY,
            button: 0,
        };

        if (type.startsWith("pointer") && typeof PointerEvent === "function") {
            target.dispatchEvent(
                new PointerEvent(type, {
                    ...common,
                    pointerId: 1,
                    pointerType: "mouse",
                    isPrimary: true,
                }),
            );
            return;
        }

        target.dispatchEvent(new MouseEvent(type, common));
    }

    function clickElementLikeUser(el) {
        const target = getTopMostTarget(el);
        if (!target) return false;

        try {
            target.scrollIntoView({
                block: "center",
                inline: "center",
                behavior: "instant",
            });
        } catch (e) {
            target.scrollIntoView({
                block: "center",
                inline: "center",
            });
        }

        if (!isElementVisible(target)) {
            return false;
        }

        target.focus?.({ preventScroll: true });

        if (typeof target.click === "function") {
            target.click();
        } else {
            const rect = target.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;
            dispatchMouseLikeEvent(target, "click", clientX, clientY);
        }

        return true;
    }

    function dispatchKeyboardLikeEvent(target, type, options) {
        target.dispatchEvent(
            new KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                composed: true,
                ...options,
            }),
        );
    }

    function pressPlayerHotkey() {
        const playerRoot = findPlayerRoot();
        if (!playerRoot) return false;

        playerRoot.focus?.({ preventScroll: true });
        dispatchKeyboardLikeEvent(playerRoot, "keydown", {
            key: " ",
            code: "Space",
            keyCode: 32,
            which: 32,
        });
        dispatchKeyboardLikeEvent(playerRoot, "keyup", {
            key: " ",
            code: "Space",
            keyCode: 32,
            which: 32,
        });
        return true;
    }

    function findVideoElement() {
        for (const selector of CONFIG.VIDEO_SELECTORS) {
            const video = document.querySelector(selector);
            if (video instanceof HTMLVideoElement) {
                return video;
            }
        }

        return null;
    }

    function getJwPlayerState() {
        const playerRoot = findPlayerRoot();
        if (!playerRoot) return null;

        const knownStates = [
            "playing",
            "paused",
            "buffering",
            "idle",
            "complete",
            "error",
        ];

        return (
            knownStates.find((state) =>
                playerRoot.classList.contains(`jw-state-${state}`),
            ) || null
        );
    }

    function isVideoPlaying() {
        const jwState = getJwPlayerState();

        if (jwState === "playing" || jwState === "buffering") {
            return true;
        }

        if (
            jwState === "paused" ||
            jwState === "idle" ||
            jwState === "complete" ||
            jwState === "error" ||
            isPlayRejectedState()
        ) {
            return false;
        }

        const video = findVideoElement();
        return Boolean(
            video &&
            !video.paused &&
            !video.ended &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
        );
    }

    function isPlayRejectedState() {
        return Boolean(
            findPlayerRoot()?.classList.contains("jw-flag-play-rejected"),
        );
    }

    function scheduleProgrammaticPlaybackFallback(label) {
        setTimeout(() => {
            const video = findVideoElement();
            if (video && video.paused) {
                tryProgrammaticVideoPlay(`${label} - fallback video`);
            }
        }, 400);
    }

    function runInPageContext(source) {
        const parent =
            document.documentElement || document.head || document.body;

        if (!parent) {
            return false;
        }

        const script = document.createElement("script");
        script.textContent = source;
        parent.appendChild(script);
        script.remove();
        return true;
    }

    function tryJwPlayerApiPlay(label) {
        if (!findPlayerRoot()) {
            return false;
        }

        const injected = runInPageContext(`
            (() => {
                try {
                    const player =
                        typeof window.jwplayer === "function"
                            ? window.jwplayer("player")
                            : null;

                    if (!player || typeof player.getState !== "function") {
                        return;
                    }

                    const state = player.getState();
                    if (state !== "playing" && state !== "buffering") {
                        player.play();
                    }
                } catch (error) {
                    console.debug("jwplayer.play() fallito:", error);
                }
            })();
        `);

        if (!injected) {
            return false;
        }

        updateStatus(`Resume richiesto via JW API (${label})`);
        showNotification(`▶ Resume richiesto via JW API (${label})`);
        scheduleProgrammaticPlaybackFallback(label);
        return true;
    }

    function findPlayButton() {
        const xpathMatch = findFirstByXPath(CONFIG.PLAY_BUTTON_XPATHS);
        if (
            xpathMatch &&
            xpathMatch.getAttribute("aria-label")?.toLowerCase() !== "pause"
        ) {
            return xpathMatch;
        }

        const playerRoot = findPlayerRoot() || document;

        for (const selector of CONFIG.PLAY_BUTTON_SELECTORS) {
            const match = Array.from(
                playerRoot.querySelectorAll(selector),
            ).find(
                (el) =>
                    isElementVisible(el) &&
                    el.getAttribute("aria-label")?.toLowerCase() !== "pause",
            );

            if (match) return match;
        }

        return null;
    }

    function tryProgrammaticVideoPlay(label) {
        const video = findVideoElement();
        if (!video || typeof video.play !== "function") {
            return false;
        }

        const originalMuted = video.muted;
        const originalVolume = video.volume;

        const restoreAudio = () => {
            try {
                video.muted = originalMuted;
                video.volume = originalVolume;
            } catch (e) {
                console.debug("Ripristino volume fallito:", e);
            }
        };

        try {
            const playAttempt = video.play();

            if (!playAttempt || typeof playAttempt.then !== "function") {
                updateStatus(`Play video richiesto (${label})`);
                showNotification(`▶ Play video richiesto (${label})`);
                return true;
            }

            playAttempt
                .then(() => {
                    updateStatus(`Play video avviato (${label})`);
                    showNotification(`▶ Play video avviato (${label})`);
                })
                .catch(() => {
                    try {
                        video.muted = true;
                        video.volume = 0;
                    } catch (e) {
                        console.debug("Mute fallback fallito:", e);
                    }

                    Promise.resolve(video.play())
                        .then(() => {
                            updateStatus(
                                `Play video avviato in mute (${label})`,
                            );
                            showNotification(
                                `▶ Play video avviato in mute (${label})`,
                            );

                            setTimeout(() => {
                                restoreAudio();
                            }, 1500);
                        })
                        .catch((error) => {
                            restoreAudio();
                            updateStatus(
                                `Play bloccato dal browser (${label})${
                                    isPlayRejectedState()
                                        ? " - jw-flag-play-rejected"
                                        : ""
                                }`,
                            );
                            showNotification(
                                "❌ Browser ha bloccato l'avvio automatico",
                            );
                            console.debug("video.play() fallito:", error);
                        });
                });

            return true;
        } catch (error) {
            console.debug("Errore durante video.play():", error);
            return false;
        }
    }

    function tryResumePausedPlayback(label) {
        if (isVideoPlaying()) {
            return true;
        }

        if (tryJwPlayerApiPlay(label)) {
            return true;
        }

        if (tryProgrammaticVideoPlay(`${label} - video`)) {
            return true;
        }

        updateStatus(`Resume fallito (${label})`);
        showNotification(`❌ Resume fallito (${label})`);
        return false;
    }

    function tryClickPlay(label) {
        if (isVideoPlaying()) {
            return true;
        }
        const video = findVideoElement();
        if (video && !video.paused) {
            return true;
        }

        const playBtn = findPlayButton();
        const playerRoot = findPlayerRoot();
        const mediaArea = playerRoot?.querySelector(".jw-media");

        if (playBtn && clickElementLikeUser(playBtn)) {
            updateStatus(`Tentativo play inviato (${label} - bottone JW)`);
            showNotification(
                `▶ Tentativo play inviato (${label} - bottone JW)`,
            );
            scheduleProgrammaticPlaybackFallback(label);
            return true;
        }

        if (mediaArea && clickElementLikeUser(mediaArea)) {
            updateStatus(`Tentativo play inviato (${label} - area video)`);
            showNotification(
                `▶ Tentativo play inviato (${label} - area video)`,
            );
            scheduleProgrammaticPlaybackFallback(label);
            return true;
        }

        if (playerRoot && clickElementLikeUser(playerRoot)) {
            updateStatus(`Tentativo play inviato (${label} - player root)`);
            showNotification(
                `▶ Tentativo play inviato (${label} - player root)`,
            );
            scheduleProgrammaticPlaybackFallback(label);
            return true;
        }

        if (pressPlayerHotkey()) {
            updateStatus(`Tentativo play inviato (${label} - tasto spazio)`);
            showNotification(
                `▶ Tentativo play inviato (${label} - tasto spazio)`,
            );
            scheduleProgrammaticPlaybackFallback(label);
            return true;
        }

        if (tryProgrammaticVideoPlay(label)) {
            return true;
        }

        updateStatus(`Play non trovato (${label})`);
        showNotification(`❌ Play non trovato (${label})`);
        return false;
    }

    function readTimerSeconds() {
        const timerEl = getElementByXPath(CONFIG.TIMER_XPATH);
        const selectorMatch =
            timerEl ||
            CONFIG.TIMER_SELECTORS.map((selector) =>
                document.querySelector(selector),
            ).find(Boolean);

        if (!selectorMatch) return { seconds: null, raw: null };

        const raw = extractTimeText(selectorMatch);
        const seconds = parseTimeToSeconds(raw);

        return { seconds, raw };
    }

    function clearRuntimeTimers() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
        }

        if (playStartTimeout) {
            clearTimeout(playStartTimeout);
            playStartTimeout = null;
        }

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        if (playRetryInterval) {
            clearInterval(playRetryInterval);
            playRetryInterval = null;
        }
    }

    function stopMonitoring({ persistStatus = true } = {}) {
        clearRuntimeTimers();
        alreadyTriggeredForCurrentLowWindow = false;
        playbackRecoveryAttemptedForCurrentRun = false;
        hideNotification();

        if (persistStatus) {
            updateStatus("Disattivato");
        } else {
            setLastStatus("Disattivato");
        }
    }

    function triggerClickIfNeeded() {
        if (!isContextValid()) {
            stopMonitoring({ persistStatus: false });
            return;
        }

        if (!isPlayerFrame()) {
            return;
        }

        const { seconds, raw } = readTimerSeconds();

        if (seconds === null) {
            hideNotification();
            updateStatus(
                `Timer non trovato o formato non valido${raw ? `: ${raw}` : ""}`,
            );
            return;
        }

        if (seconds === 0) {
            playbackRecoveryAttemptedForCurrentRun = false;

            if (!playRetryInterval) {
                showNotification("▶ Timer a 00:00 - tento avvio...");
                updateStatus("Timer a 00:00 - attendo 1s per click play");

                playStartTimeout = setTimeout(() => {
                    playStartTimeout = null;
                    tryClickPlay("iniziale");
                }, 1000);

                playRetryInterval = setInterval(() => {
                    if (!isContextValid() || !enabled) {
                        clearInterval(playRetryInterval);
                        playRetryInterval = null;
                        return;
                    }

                    if (isVideoPlaying()) {
                        clearInterval(playRetryInterval);
                        playRetryInterval = null;
                        showNotification("⏱ Video avviato");
                        updateStatus("Monitor attivo - video in riproduzione");
                        return;
                    }

                    const check = readTimerSeconds();
                    if (check.seconds !== null && check.seconds > 0) {
                        clearInterval(playRetryInterval);
                        playRetryInterval = null;
                        showNotification(`⏱ Timer partito: ${check.raw}`);
                        updateStatus(`Monitor attivo - timer: ${check.raw}`);
                        return;
                    }

                    tryClickPlay("retry");
                }, 3000);
            }

            alreadyTriggeredForCurrentLowWindow = false;
            return;
        }

        if (playRetryInterval) {
            clearInterval(playRetryInterval);
            playRetryInterval = null;
        }

        if (playStartTimeout) {
            clearTimeout(playStartTimeout);
            playStartTimeout = null;
        }

        if (!isVideoPlaying()) {
            if (!playbackRecoveryAttemptedForCurrentRun) {
                playbackRecoveryAttemptedForCurrentRun = true;
                updateStatus(
                    `Timer attivo (${raw}) ma video in pausa - provo resume`,
                );
                showNotification(
                    "▶ Timer partito ma video in pausa, provo resume...",
                );
                tryResumePausedPlayback("resume timer attivo");
                return;
            }

            updateStatus(`Timer attivo (${raw}) ma video in pausa`);
            showNotification(`⏸ Video in pausa con timer attivo: ${raw}`);
            return;
        }

        updateStatus(`Monitor attivo - timer: ${raw}`);
        showNotification(`⏱ Timer: ${raw}`);

        if (seconds <= CONFIG.THRESHOLD_SECONDS) {
            if (alreadyTriggeredForCurrentLowWindow || pendingTimeout) {
                return;
            }

            alreadyTriggeredForCurrentLowWindow = true;

            let remaining = Math.round(CONFIG.CLICK_DELAY_MS / 1000);
            updateStatus(
                `Soglia raggiunta (${raw}), skip tra ${remaining}s...`,
            );
            showNotification(`⚡ Stiamo per skippare tra ${remaining}s...`);

            countdownInterval = setInterval(() => {
                remaining--;

                if (remaining > 0) {
                    showNotification(
                        `⚡ Stiamo per skippare tra ${remaining}s...`,
                    );
                }
            }, 1000);

            pendingTimeout = setTimeout(() => {
                pendingTimeout = null;

                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }

                if (!enabled) {
                    updateStatus("Disattivato");
                    hideNotification();
                    return;
                }

                const buttonEl = getElementByXPath(CONFIG.BUTTON_XPATH);
                if (!buttonEl) {
                    updateStatus("Bottone non trovato");
                    showNotification("❌ Bottone skip non trovato");
                    return;
                }

                const clicked = clickElementLikeUser(buttonEl);
                if (!clicked) {
                    updateStatus("Bottone skip trovato ma non cliccabile");
                    showNotification("❌ Bottone skip non cliccabile");
                    return;
                }

                updateStatus("Click skip eseguito");
                showNotification("✅ Skip eseguito!");
                setTimeout(hideNotification, 3000);
            }, CONFIG.CLICK_DELAY_MS);
        } else {
            alreadyTriggeredForCurrentLowWindow = false;
        }
    }

    function startMonitoring() {
        clearRuntimeTimers();
        playbackRecoveryAttemptedForCurrentRun = false;

        if (!isPlayerFrame()) {
            setLastStatus("In attesa del frame player");
            return;
        }

        updateStatus("Monitor avviato");
        intervalId = setInterval(
            triggerClickIfNeeded,
            CONFIG.CHECK_INTERVAL_MS,
        );
        triggerClickIfNeeded();
    }

    function setEnabled(value) {
        enabled = value;

        if (isContextValid()) {
            chrome.storage.local.set({ [STORAGE_KEYS.enabled]: value });
        }

        if (enabled) {
            startMonitoring();
        } else {
            stopMonitoring();
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || !message.type) return;

        if (message.type === "GET_STATUS") {
            sendResponse({
                enabled,
                status: lastStatus,
            });
            return true;
        }

        if (message.type === "SET_ENABLED") {
            setEnabled(Boolean(message.enabled));
            sendResponse({
                enabled,
                status: lastStatus,
            });
            return true;
        }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[STORAGE_KEYS.enabled]) {
            return;
        }

        const nextEnabled = Boolean(changes[STORAGE_KEYS.enabled].newValue);

        if (nextEnabled === enabled) {
            return;
        }

        enabled = nextEnabled;

        if (enabled) {
            startMonitoring();
        } else {
            stopMonitoring();
        }
    });

    chrome.storage.local.get([STORAGE_KEYS.enabled], (result) => {
        enabled = Boolean(result[STORAGE_KEYS.enabled]);

        if (enabled) {
            startMonitoring();
        } else {
            setLastStatus("Disattivato");
        }
    });
})();
