// Service worker (Manifest V3). Stateless: every listener is registered at the
// top level so the browser can wake the worker for any of them.

const MENU_ID = 'download-selected-tabs';
const COMMAND_ID = 'download-selected-tabs';
const MAX_PARALLEL = 4;
const PROBE_TIMEOUT_MS = 15_000;
const NOTIFICATION_ICON = 'icons/icon128.png';

// --- Triggers ---------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  // Chrome/Brave do not let extensions add items to the tab-strip menu, so the
  // entry lives in the page menu and in the toolbar icon's menu instead.
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Download selected tabs as PDFs',
    contexts: ['all'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) downloadSelectedTabs(tab?.windowId);
});

chrome.action.onClicked.addListener((tab) => downloadSelectedTabs(tab?.windowId));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMAND_ID) downloadSelectedTabs(tab?.windowId);
});

// Downloads can still fail after they start (network drop, disk full, ...).
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'interrupted') return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item || item.byExtensionId !== chrome.runtime.id) return;
  if (item.error === 'USER_CANCELED') return;
  notify('PDF download failed', `${shorten(item.finalUrl || item.url)}\nReason: ${item.error}`);
});

// --- Core -------------------------------------------------------------------

async function downloadSelectedTabs(windowId) {
  try {
    const query = { highlighted: true };
    if (windowId === undefined) query.lastFocusedWindow = true;
    else query.windowId = windowId;

    // "highlighted" = the tabs selected with Shift/Cmd-click (always includes
    // the active tab). Sorted left to right, de-duplicated by URL.
    const tabs = (await chrome.tabs.query(query)).sort((a, b) => a.index - b.index);
    const seen = new Set();
    const unique = tabs.filter((t) => !seen.has(t.url) && seen.add(t.url));

    await chrome.action.setBadgeText({ text: '…' });
    const results = await mapWithLimit(unique, MAX_PARALLEL, downloadTab);
    report(results);
  } catch (err) {
    console.error(err);
    notify('Download selected tabs as PDFs', `Unexpected error: ${err.message}`);
  } finally {
    await chrome.action.setBadgeText({ text: '' });
  }
}

/** @returns {Promise<{tab: chrome.tabs.Tab, ok: boolean, reason?: string}>} */
async function downloadTab(tab) {
  const check = await checkIsPdf(tab.url);
  if (!check.ok) return { tab, ok: false, reason: check.reason };
  try {
    // No filename given: the browser picks it from Content-Disposition / URL.
    await chrome.downloads.download({ url: tab.url, conflictAction: 'uniquify', saveAs: false });
    return { tab, ok: true };
  } catch (err) {
    return { tab, ok: false, reason: err.message };
  }
}

/** Decide whether a URL serves a PDF by reading its response headers. */
async function checkIsPdf(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'no accessible URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `unsupported address (${parsed.protocol}//)` };
  }
  const looksLikePdf = /\.pdf$/i.test(parsed.pathname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // credentials: 'include' so PDFs behind a login (course portals etc.) work.
    const res = await fetch(url, { credentials: 'include', signal: controller.signal });
    if (!res.ok) return { ok: false, reason: `server answered HTTP ${res.status}` };

    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const disposition = res.headers.get('content-disposition') || '';
    const isPdf =
      type === 'application/pdf' ||
      type === 'application/x-pdf' ||
      // Some servers send PDFs as a generic binary; trust the file name then.
      (type === 'application/octet-stream' && (looksLikePdf || /\.pdf\b/i.test(disposition)));

    return isPdf ? { ok: true } : { ok: false, reason: `not a PDF (${type || 'unknown type'})` };
  } catch {
    // Header check failed (timeout, network). Fall back to the URL's extension.
    return looksLikePdf ? { ok: true } : { ok: false, reason: 'could not reach the page' };
  } finally {
    clearTimeout(timer);
    controller.abort(); // we only needed the headers, drop the body
  }
}

// --- Helpers ----------------------------------------------------------------

function report(results) {
  const failed = results.filter((r) => !r.ok);
  const okCount = results.length - failed.length;
  const title = failed.length
    ? `Downloading ${okCount} of ${results.length} tabs, ${failed.length} skipped`
    : `Downloading ${okCount} PDF${okCount === 1 ? '' : 's'}`;
  const message = failed
    .map((r) => `✗ ${shorten(r.tab.title || r.tab.url || 'Untitled tab', 40)}: ${r.reason}`)
    .join('\n');
  notify(title, message || 'All selected tabs were PDFs.');
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title,
    message,
  });
}

function shorten(text, max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Run `fn` over `items` with at most `limit` running at once; keeps order. */
async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
