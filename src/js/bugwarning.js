(() => {
  function callback() {
    Notifier.showDialog(`⚠ Issues in Firefox and Edge`, `
      <paper-dialog-scrollable>
        We are aware of a few bugs appearing in Edge and Firefox which might prevent you from editing the config.
        You still can use a confgi that you downloaded eariler.
        Currently, there are no known bugs in Chrome, Opera and Samsung Internet.
        We are very sory for the inconvenience.
        The bugs should be fixed by Wednesday or eariler.
      </paper-dialog-scrollable>
      <div class="buttons">
        <paper-button autofocus dialog-confirm>Ok</paper-button>
      </div>
    `, { formatted: true })
  }


  const isChromium = window.chrome,
        winNav = window.navigator,
        vendorName = winNav.vendor,
        isIEedge = winNav.userAgent.indexOf("Edge") > -1,
        isIOSChrome = winNav.userAgent.match("CriOS");

  if (!(
    isIOSChrome || (
    isChromium !== null &&
    typeof isChromium !== "undefined" &&
    vendorName === "Google Inc." &&
    isIEedge === false))
  ) {
    if ('Notifier' in window)
      callback()
    else
      window.addEventListener('notifier-ready', callback, { once: true });
  }
})();