(() => {
    const CONFIG = {
        TIMER_XPATH: '//*[@id="player"]/div[2]/div[13]/div[4]/div[2]/div[10]',
        BUTTON_XPATH: '//*[@id="player"]/div[2]/div[13]/div[4]/div[2]/div[13]',
        PLAY_BUTTON_PRIMARY_XPATH:
            '//*[@id="player"]/div[2]/div[13]/div[1]/div/div/div[2]/div/svg[3]',
        PLAY_BUTTON_XPATH:
            '//*[@id="player"]/div[2]/div[13]/div[4]/div[2]/div[1]',
        THRESHOLD_SECONDS: 60,
        CLICK_DELAY_MS: 3000,
        CHECK_INTERVAL_MS: 1000,
    };

    let notificationEl = null;

    function showNotification(text) {
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

    let enabled = false;
    let intervalId = null;
    let pendingTimeout = null;
    let alreadyTriggeredForCurrentLowWindow = false;
    let lastStatus = "Disattivato";

    function getElementByXPath(xpath) {
        try {
            return document.evaluate(
                xpath,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            ).singleNodeValue;
        } catch (e) {
            console.error("XPath non valido:", xpath, e);
            return null;
        }
    }

    function extractTimeText(el) {
        if (!el) return null;
        return (el.textContent || el.innerText || "").trim();
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

    function isContextValid() {
        try {
            return !!chrome.runtime.id;
        } catch (e) {
            return false;
        }
    }

    function updateStatus(text) {
        lastStatus = text;
        if (!isContextValid()) {
            stopMonitoring();
            return;
        }
        chrome.storage.local.set({ autoDemoStatus: text });
    }

    function readTimerSeconds() {
        const timerEl = getElementByXPath(CONFIG.TIMER_XPATH);
        if (!timerEl) return { seconds: null, raw: null };

        const raw = extractTimeText(timerEl);
        const seconds = parseTimeToSeconds(raw);

        return { seconds, raw };
    }

    let countdownInterval = null;
    let playRetryInterval = null;

    function triggerClickIfNeeded() {
        if (!isContextValid()) {
            stopMonitoring();
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

        // 00:00 = non ancora partito, clicca play dopo 1s e ricontrolla ogni 3s
        if (seconds === 0) {
            if (!playRetryInterval) {
                showNotification("▶ Timer a 00:00 - tento avvio...");
                updateStatus("Timer a 00:00 - attendo 1s per click play");
                setTimeout(() => {
                    let playBtn = getElementByXPath(
                        CONFIG.PLAY_BUTTON_PRIMARY_XPATH,
                    );
                    if (playBtn) {
                        playBtn.click();
                        updateStatus(
                            "Timer a 00:00 - click play (primary) eseguito",
                        );
                        showNotification(
                            "▶ Click play (primary) eseguito, verifico...",
                        );
                    } else {
                        playBtn = getElementByXPath(CONFIG.PLAY_BUTTON_XPATH);
                        if (playBtn) {
                            playBtn.click();
                            updateStatus(
                                "Timer a 00:00 - click play (fallback) eseguito",
                            );
                            showNotification(
                                "▶ Click play (fallback) eseguito, verifico...",
                            );
                        }
                    }
                }, 1000);

                playRetryInterval = setInterval(() => {
                    if (!isContextValid() || !enabled) {
                        clearInterval(playRetryInterval);
                        playRetryInterval = null;
                        return;
                    }
                    const check = readTimerSeconds();
                    if (check.seconds !== null && check.seconds > 0) {
                        clearInterval(playRetryInterval);
                        playRetryInterval = null;
                        showNotification(`⏱ Timer partito: ${check.raw}`);
                        return;
                    }
                    let playBtn = getElementByXPath(
                        CONFIG.PLAY_BUTTON_PRIMARY_XPATH,
                    );
                    if (playBtn) {
                        playBtn.click();
                        updateStatus(
                            "Timer ancora a 00:00 - riprovo click play (primary)",
                        );
                        showNotification(
                            "▶ Ancora 00:00, riprovo play (primary)...",
                        );
                    } else {
                        playBtn = getElementByXPath(CONFIG.PLAY_BUTTON_XPATH);
                        if (playBtn) {
                            playBtn.click();
                            updateStatus(
                                "Timer ancora a 00:00 - riprovo click play (fallback)",
                            );
                            showNotification(
                                "▶ Ancora 00:00, riprovo play (fallback)...",
                            );
                        }
                    }
                }, 3000);
            }
            alreadyTriggeredForCurrentLowWindow = false;
            return;
        }

        // Timer ha superato 00:00, pulisci retry play se attivo
        if (playRetryInterval) {
            clearInterval(playRetryInterval);
            playRetryInterval = null;
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

                buttonEl.click();
                updateStatus("Click skip eseguito");
                showNotification("✅ Skip eseguito!");
                setTimeout(hideNotification, 3000);
            }, CONFIG.CLICK_DELAY_MS);
        } else {
            alreadyTriggeredForCurrentLowWindow = false;
        }
    }

    function startMonitoring() {
        stopMonitoring();
        updateStatus("Monitor avviato");
        intervalId = setInterval(
            triggerClickIfNeeded,
            CONFIG.CHECK_INTERVAL_MS,
        );
        triggerClickIfNeeded();
    }

    function stopMonitoring() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
        }

        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }

        if (playRetryInterval) {
            clearInterval(playRetryInterval);
            playRetryInterval = null;
        }

        alreadyTriggeredForCurrentLowWindow = false;
        hideNotification();
        updateStatus("Disattivato");
    }

    function setEnabled(value) {
        enabled = value;
        chrome.storage.local.set({ autoDemoEnabled: value });

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

    chrome.storage.local.get(["autoDemoEnabled"], (result) => {
        enabled = Boolean(result.autoDemoEnabled);
        if (enabled) {
            startMonitoring();
        } else {
            updateStatus("Disattivato");
        }
    });
})();
