// Small guard to ensure body/html overflow is restored when no modal overlays are present.
export function initOverflowGuard() {
  const checkAndRestore = () => {
    try {
      const html = document.documentElement;
      const body = document.body;
      // Consider common overlay/dialog selectors used across the app
      const hasOverlay = !!document.querySelector('.modal-overlay, .feedback-overlay, .confirm-overlay, .player-profile-modal, [aria-modal="true"]');
      if (!hasOverlay) {
        // restore only if something is set to 'hidden' to avoid clobbering intentional styles
        if (html.style.overflow === 'hidden') html.style.overflow = '';
        if (body.style.overflow === 'hidden') body.style.overflow = '';
        if (body.style.paddingRight && body.style.paddingRight !== '0px') {
          body.style.paddingRight = '';
        }
        if (body.classList.contains('nav-open')) body.classList.remove('nav-open');
        if (body.classList.contains('gallery-modal-open')) body.classList.remove('gallery-modal-open');
      }
    } catch (e) {
      // swallow errors — guard should not break app
      // eslint-disable-next-line no-console
      console.warn('overflowGuard check failed', e);
    }
  };

  // run on common events that may follow an interrupted modal lifecycle
  window.addEventListener('focus', checkAndRestore);
  window.addEventListener('popstate', checkAndRestore);
  window.addEventListener('visibilitychange', checkAndRestore);
  window.addEventListener('resize', checkAndRestore);
  document.addEventListener('click', checkAndRestore);

  // run once at init
  setTimeout(checkAndRestore, 500);
}

export default initOverflowGuard;
