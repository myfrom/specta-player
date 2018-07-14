/**
 * @constant
 */
window.MOBILE_MEDIA_QUERY = [
  '(orientation: landscape) and (max-width: 600px)',
  '(orientation: portrait) and (max-width: 960px)'
]

window.appState = {
  dragging: false,
  audio: {}
};


// Google Analytics
setTimeout(() => {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){dataLayer.push(arguments);}
  /*::DEV-ANALYTICS-OVERWRITE::*/
  window.gtag = (...args) => {
    console.log('GTAG:', args);
  };
  /*::DEV-ANALYTICS-OVERWRITE-END::*/
  gtag('js', new Date());
  gtag('config', 'UA-110620543-1', { 'transport_type': navigator.sendBeacon ? 'beacon' : 'xhr' });
}, 0);



// Helper functions
/**
 * Adds HTML import to the page
 * @param {string} src
 * @return {Promise} A promise which resolves when import loads or rejects when it fails
 */
function importHref(src) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'import');
    link.setAttribute('href', src);
    link.onload = resolve;
    link.onerror = err => {
      gtag('event', 'exception', {
        'description': 'Couldn\'t download HTML file ' + src,
        'error': err.toString(),
        'fatal': false
      });
      reject(err);
    };
    document.head.appendChild(link);
  });
}

/**
 * Adds CSS stylesheet to the page
 * @param {string} src
 * @return {Promise} A promise which resolves when styles load or rejects when they fail
 */
function importCSS(src) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', src);
    link.onload = resolve;
    link.onerror = err => {
      gtag('event', 'exception', {
        'description': 'Couldn\'t download CSS file ' + src,
        'error': err.toString(),
        'fatal': false
      });
      reject(err);
    };
    document.head.appendChild(link);
  });
}

/**
 * Execute callback in second requestAnimationFrame
 */
function doubleRAF(callback) {
  requestAnimationFrame(function() {
    requestAnimationFrame(callback);
  });
}


// Lazy-load non-critical files
setTimeout(() => {
  const noscriptTag = document.head.querySelector('noscript#lazy-load');
  let noscriptContent = noscriptTag.innerHTML;
  noscriptContent = noscriptContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  document.head.insertAdjacentHTML('beforeend', noscriptContent);
  noscriptTag.remove();
}, 0);


// Register Service Worker
/*::SERVICE-WORKER:: (will be activated at build)
window.addEventListener('load', () => {
  navigator.serviceWorker.register('service-worker.js',
    { scope: location.origin.includes('github') ? '/specta-player/' : '/' })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      const callback = () => {
        const channel = new MessageChannel();
        channel.port1.onmessage = e =>
          e.data === 'sw-ready' && Notifier.showToast(`App can now work offline ⚙`);
          navigator.serviceWorker.controller.postMessage('sw-update-question', [channel.port2]);
      };
      if (!('Notifier' in window))
        window.addEventListener('notifier-ready', callback, { once: true });
      else
        callback();
    });
}, { once: true });
::SERVICE-WORKER-END::*/


// Load drag-n-drop if on desktop
setTimeout(() => {
  const handleResize = () => {
    if (!window.matchMedia(window.MOBILE_MEDIA_QUERY).matches) {
      const el = document.createElement('script')
      el.setAttribute('src', 'src/js/dragndrop.js');
      el.setAttribute('async', true);
      document.head.appendChild(el);
      window.removeEventListener('resize', handleResize);
    }
  };
  window.addEventListener('resize', handleResize);
  handleResize();
}, 0);


// Disable right-click
window.addEventListener('contextmenu', e => e.preventDefault());


// Import Shell and Notifier
importHref('src/sp-shell.html').then(() => {
  const el = document.createElement('script');
  el.setAttribute('src', 'bower_components/Notifier/notifier.js');
  el.setAttribute('async', true);
  document.head.appendChild(el);
});


// Show error when IDB is unavailable
window.addEventListener('idb-check-fail', e => {
  waitForSmallCircle().then(() => {
    importCSS('src/css/noscript.css');
    circle.classList.add('no-idb');
  });
}, { once: true });


// Do the loading dance
(() => {
  const circle = document.querySelector('#circle');
  
  let uploadIcon = null;
  
  function showUploadIcon() {
    return new Promise(async r => {
      if (!uploadIcon) {
        const svg = await fetch('images/upload.svg').then(response => response.text());
        circle.insertAdjacentHTML('beforeend', svg);
        uploadIcon = document.querySelector('#upload-icon');
      }
      await waitForSmallCircle();
      circle.classList.add('no-animation');
      uploadIcon.classList.remove('hidden');
      uploadIcon.classList.remove('exit');
      uploadIcon.style.transitionTimingFunction = 'ease-out';
      return doubleRAF(() => {
        uploadIcon.classList.remove('faded-out');
        uploadIcon.addEventListener('transitionend', r, { once: true });
      });
    });
  }
  
  async function hideUploadIcon() {
    return new Promise(async r => {
      if (!uploadIcon || uploadIcon.classList.contains('hidden')) {
        r();
        return;
      }
      uploadIcon.classList.add('exit');
      uploadIcon.style.transitionTimingFunction = 'ease-in';
      return doubleRAF(() => {
        uploadIcon.classList.add('faded-out');
        uploadIcon.addEventListener('transitionend', r, { once: true });
      });
    }).then(e => {
      if (uploadIcon && !uploadIcon.classList.contains('hidden')) {
        uploadIcon.classList.add('hidden');
        circle.classList.remove('no-animation');
        return e;
      } else return false;
    });
  }
  
  function waitForSmallCircle() {
    return new Promise(r => {
      circle.addEventListener('animationiteration', function callback(e) {
        if (e.elapsedTime % 3 === 0) {
          circle.removeEventListener('animationiteration', callback, { passive: true });
          r(e);
        }
      }, { passive: true });
    });
  }
  
  async function finishAnimation(skipWaiting = false) {
    const haveUploaderLoaded = new Promise(r => window.addEventListener('uploader-loaded', r)),
          hiddenUploadIcon = await hideUploadIcon();
    if (!skipWaiting) {
      await haveUploaderLoaded;
    }
    if (!hiddenUploadIcon || !skipWaiting)
      await new Promise(r => circle.addEventListener('animationiteration', r, { once: true }));
    circle.classList.add('finishing-animation');
    const circlePos = circle.getBoundingClientRect(),
          radius = circlePos.width / 2,
          scale = Math.sqrt(Math.pow(circlePos.top + radius, 2) + Math.pow(circlePos.left + radius, 2)) / radius;
    circle.addEventListener('transitionend', () => {
      document.querySelector('sp-shell').classList.remove('hidden');
      circle.remove();
      document.body.classList.remove('unresolved');
      window.dispatchEvent(new CustomEvent(skipWaiting ? 'open-console' : 'open-uploader'));
    }, { once: true });
    doubleRAF(() => { circle.style.transform = 'scale(' + scale + ')'; });
  }
  
  function uploadFiles(e) {
    circle.blur();
    const input = document.createElement('input'),
          audioTester = new Audio();
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/mpeg,audio/flac/,audio/ogg,audio/webm,.mp3,.json';
    input.addEventListener('change', e => {
      hideUploadIcon();
      const files = e.target.files;
      const validFiles = Array.from(files).filter(file => {
        if (audioTester.canPlayType(file.type)) {
          console.log('Audio file received');
          return true;
        } else if (file.name.match(/\.json$/)) {
          console.log('JSON object received');
          return true;
        } else {
          console.log('Invalid file received');
          Notifier.showToast(`You uploaded invalid file 😟`);
          return false;
        }
      });
      if (validFiles.length) {
        circle.removeEventListener('click', uploadFiles);
        finishAnimation();
        document.querySelector('sp-shell').readFiles(validFiles);
      } else showUploadIcon();
      Array.from(document.querySelectorAll('input[type="file"]')).forEach(item => item.remove());
    });
    document.body.appendChild(input);
    input.dispatchEvent(new MouseEvent('click', { bubbles: false }))
  }

  window.addEventListener('files-added-alt', () => {
    Array.from(document.querySelectorAll('input[type="file"]')).forEach(item => item.remove());
    finishAnimation();
  });

  // Play animation when everything is ready
  window.addEventListener('shell-ready', e => {
    if (e.detail.noData) {
      showUploadIcon();
      circle.addEventListener('click', uploadFiles);
      circle.addEventListener('keydown', ev => {
        if (ev.keyCode === 13 || ev.keyCode === 32) uploadFiles(ev);
      });
      circle.tabIndex = 0;
      circle.focus();
    } else
      finishAnimation(true);
  }, { once: true });
})();
