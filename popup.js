const statusEl = document.getElementById("status");
const badgeEl = document.getElementById("badge");
const enableBtn = document.getElementById("enableBtn");
const disableBtn = document.getElementById("disableBtn");

const STORAGE_KEYS = {
    enabled: "autoDemoEnabled",
    status: "autoDemoStatus",
};

function updateUI(enabled, status) {
    statusEl.textContent = status || "—";
    badgeEl.textContent = enabled ? "ON" : "OFF";
    badgeEl.className = "badge " + (enabled ? "active" : "inactive");
}

function refreshUI() {
    chrome.storage.local.get(
        [STORAGE_KEYS.enabled, STORAGE_KEYS.status],
        (result) => {
            updateUI(
                Boolean(result[STORAGE_KEYS.enabled]),
                result[STORAGE_KEYS.status] || "Disattivato",
            );
        },
    );
}

function setEnabled(value) {
    chrome.storage.local.set({
        [STORAGE_KEYS.enabled]: value,
        [STORAGE_KEYS.status]: value
            ? "Attivazione monitor..."
            : "Disattivato",
    });
}

enableBtn.addEventListener("click", () => {
    setEnabled(true);
});

disableBtn.addEventListener("click", () => {
    setEnabled(false);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
        areaName !== "local" ||
        (!changes[STORAGE_KEYS.enabled] && !changes[STORAGE_KEYS.status])
    ) {
        return;
    }

    refreshUI();
});

refreshUI();
