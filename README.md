# Auto Timer Click Streaming Community

A Manifest V3 browser extension that monitors a page timer and automatically clicks a button when the countdown drops below a defined threshold.

The project also includes automatic player start logic: if the timer is stuck at `00:00`, the extension tries to click the `play` button and keeps checking until the timer starts again.

## Features

- Quick enable and disable controls from the popup.
- Timer monitoring every second.
- Automatic click on the skip button when the timer reaches 60 seconds or less.
- Visual countdown before the click.
- Automatic attempt to click `play` when the timer is stuck at `00:00`.
- State persistence through `chrome.storage.local`.
- On-page visual notifications.

## Project Structure

- `manifest.json`: extension configuration.
- `popup.html`: popup interface.
- `popup.js`: popup UI logic and communication with the content script.
- `content.js`: timer monitoring, play/skip handling, state management, and notifications.

## Installation

1. Open `chrome://extensions` in Chrome or another Chromium-based browser.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the project folder.

## Usage

1. Open the target web page where the player is available.
2. Open the extension popup.
3. Click `Attiva`.
4. Keep the page open: the extension will start reading the timer and acting automatically.
5. Click `Disattiva` to stop monitoring.

## Technical Configuration

The main logic is in `content.js`, inside the `CONFIG` object:

- `TIMER_XPATH`: XPath of the element that contains the timer.
- `BUTTON_XPATH`: XPath of the button to click when the threshold is reached.
- `PLAY_BUTTON_PRIMARY_XPATH`: primary XPath for the play button.
- `PLAY_BUTTON_XPATH`: fallback XPath for the play button.
- `THRESHOLD_SECONDS`: threshold below which the skip action is triggered.
- `CLICK_DELAY_MS`: delay before the automatic click.
- `CHECK_INTERVAL_MS`: timer check frequency.

If the target page DOM changes, the XPath selectors will need to be updated.

## Permissions Used

- `storage`: stores the enabled/disabled state and runtime status.
- `tabs`: sends messages to the active tab from the popup.
- `host_permissions: <all_urls>`: injects the content script on all pages.

## Current Limitations

- The extension depends on very specific XPath selectors.
- It is designed for one specific web app, not for generic websites.
- If the DOM changes, the timer or buttons may no longer be found.
- There are no automated tests or build pipeline.

## Notes

The browser name is `Auto Timer Click Streaming Community`, while the popup title is `Auto Timer Click`.
