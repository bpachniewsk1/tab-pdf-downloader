# Download Selected Tabs as PDFs

A small Manifest V3 extension for Chrome, Brave and other Chromium browsers.
Select several tabs, trigger the extension once, and every PDF among them is
downloaded. Tabs that are not PDFs are skipped and listed in a notification
with the reason.

## Install

The extension is not on the Chrome Web Store. Load it from source:

1. Download or clone this repository.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the repository folder.
5. Pin the extension's icon to the toolbar.

## Use

1. Click the first tab, then Shift-click the last one. Every tab in between is
   selected, both ends included. Ctrl/Cmd-click adds or removes single tabs.
2. Trigger the download in one of three ways:
   - click the toolbar icon,
   - right-click inside a page and choose **Download selected tabs as PDFs**,
   - press `Alt+Shift+D` (change it at `chrome://extensions/shortcuts`).
3. A notification reports how many downloads started and which tabs were
   skipped.

With a single tab selected, only that tab is downloaded.

Chromium does not let extensions add entries to the tab strip's own right-click
menu, which is why the entry lives in the page menu and on the toolbar icon.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `tabs` | Read the addresses of the tabs you selected. |
| `downloads` | Start the downloads and detect ones that fail. |
| `contextMenus` | Add the right-click menu entry. |
| `notifications` | Show the result and any errors. |
| `http://*/*`, `https://*/*` | Request each selected tab's address to check that it really serves a PDF. |

## Privacy

The extension collects nothing. It has no analytics, no remote code and no
server of its own. It only contacts the addresses of the tabs you selected, at
the moment you trigger it, using your existing browser session. Nothing is
stored or sent anywhere else.

## Responsible use

Only download documents you are allowed to download. You are responsible for
respecting the copyright and the terms of use of the sites you use this on.

## License

[MIT](LICENSE). The software is provided as is, without warranty of any kind.
This project is not affiliated with Google, Brave Software or Adobe.
