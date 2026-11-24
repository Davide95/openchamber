import { isAutoOpenableExternalUrl } from './external-url-policy.mjs';
import { shouldBlockGuestFrameNavigation } from './guest-frame-navigation.mjs';

export const attachWindowNavigationGuards = ({
  webContents,
  uiProtocol,
  getAllowedOrigins,
  findConfiguredHostForUrl,
  sessionRouteFromUrl,
  openHostWindow,
  onOpenSession,
  openExternal,
  log,
  allowConfiguredHostNavigation = true,
}) => {
  const isAllowedNavigationUrl = (raw, { includeHosts = true } = {}) => {
    try {
      const url = new URL(raw);
      if (url.protocol === 'devtools:') return true;
      if (url.protocol === `${uiProtocol}:`) return true;
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      try {
        if (new URL(webContents.getURL()).origin === url.origin) return true;
      } catch {
      }
      for (const candidate of getAllowedOrigins()) {
        if (!candidate) continue;
        try {
          if (new URL(candidate).origin === url.origin) return true;
        } catch {
        }
      }
      return includeHosts && findConfiguredHostForUrl(raw) !== null;
    } catch {
      return false;
    }
  };

  const openConfiguredHost = (host, url) => {
    void openHostWindow(host, sessionRouteFromUrl(url), { reuseOpenWindow: true }).catch((error) => {
      log.warn('[electron] failed to open host window from link:', error);
    });
  };

  webContents.setWindowOpenHandler(({ url }) => {
    const host = findConfiguredHostForUrl(url);
    if (host) {
      openConfiguredHost(host, url);
      return { action: 'deny' };
    }
    if (isAllowedNavigationUrl(url, { includeHosts: false })) {
      const route = sessionRouteFromUrl(url);
      if (route) onOpenSession(route);
      return { action: 'deny' };
    }
    if (isAutoOpenableExternalUrl(url)) {
      void openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigationUrl(url, { includeHosts: allowConfiguredHostNavigation })) return;
    event.preventDefault();
    const host = findConfiguredHostForUrl(url);
    if (host) {
      openConfiguredHost(host, url);
      return;
    }
    if (isAutoOpenableExternalUrl(url)) {
      void openExternal(url).catch(() => {});
    }
  });

  webContents.on('will-frame-navigate', (details) => {
    let frameOrigin;
    try {
      frameOrigin = details.frame?.origin;
    } catch {
      frameOrigin = undefined;
    }
    if (!shouldBlockGuestFrameNavigation({
      isMainFrame: details.isMainFrame,
      frameOrigin,
      frame: details.frame,
      initiator: details.initiator,
      mainFrame: webContents.mainFrame,
      url: details.url,
      isAppOrigin: isAllowedNavigationUrl,
    })) return;
    details.preventDefault();
    let host = '';
    try {
      host = new URL(details.url).host;
    } catch {
      host = '';
    }
    log.warn(`[guests] refused an extension frame navigating to ${host || 'an invalid URL'}`);
  });
};
