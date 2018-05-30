(() => {
  function callback() {
    Notifier.showDialog(`⚠ Issues in Edge`, `
      <paper-dialog-scrollable>
        There's currently a display bug in Edge. The app is usable but may look weird. We're apologising and working on a fix.
      </paper-dialog-scrollable>
      <div class="buttons">
        <paper-button autofocus dialog-confirm>Ok</paper-button>
      </div>
    `, { formatted: true })
  }
  
  if (navigator.userAgent.indexOf("Edge") > -1) {
    if ('Notifier' in window)
      callback()
    else
      window.addEventListener('notifier-ready', callback, { once: true });
  }
})();