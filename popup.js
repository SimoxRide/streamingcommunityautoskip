const statusEl = document.getElementById("status");
const badgeEl = document.getElementById("badge");
const enableBtn = document.getElementById("enableBtn");
const disableBtn = document.getElementById("disableBtn");

function updateUI(enabled, status) {
    statusEl.textContent = status || "—";
    badgeEl.textContent = enabled ? "ON" : "OFF";
    badgeEl.className = "badge " + (enabled ? "active" : "inactive");
}

function sendToContentScript(message, callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
            updateUI(false, "Nessuna scheda attiva");
            return;
        }
        chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
            if (chrome.runtime.lastError) {
                updateUI(false, "Content script non raggiungibile");
                return;
            }
            if (callback) callback(response);
        });
    });
}

enableBtn.addEventListener("click", () => {
    sendToContentScript({ type: "SET_ENABLED", enabled: true }, (res) => {
        updateUI(res.enabled, res.status);
    });
});

disableBtn.addEventListener("click", () => {
    sendToContentScript({ type: "SET_ENABLED", enabled: false }, (res) => {
        updateUI(res.enabled, res.status);
    });
});

sendToContentScript({ type: "GET_STATUS" }, (res) => {
    updateUI(res.enabled, res.status);
});
