import 'fg-loadcss/dist/polyfill.min.js';
import loadCSS, { onloadCSS } from './loadcss-promises';
import { Workbox } from 'workbox-window';
import Notifier from '@myfrom/notifier';

/**
 * @constant
 */
const MOBILE_MEDIA_QUERY = [
  '(orientation: landscape) and (max-width: 600px)',
  '(orientation: portrait) and (max-width: 960px)'
]
function NO_MOTION_MEDIA_QUERY() {
  return window.matchMedia('(prefers-reduced-motion: reduced)').matches;
}

window.appState = {
  dragging: false,
  audioBuffers: {},
  config: []
};

let spConsole, editor;

const circle = document.querySelector('#circle');


// Google Analytics
setTimeout(() => {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'UA-110620543-1', { 'transport_type': navigator.sendBeacon ? 'beacon' : 'xhr' });
}, 0);



// Helper functions

/**
 * Execute callback in second requestAnimationFrame
 * @param {function} callback
 */
function doubleRAF(callback) {
  requestAnimationFrame(function() {
    requestAnimationFrame(callback);
  });
}

/**
 * Wait for a CSS transition to end.
 * Takes into consideration (prefers-reduced-motion: reduced)
 * @param {HTMLElement} element - Element that will be transitioning
 * @returns {Promise} Returns a Promise once the transition is finished
 */
function waitForTransition(element) {
  return new Promise(r => {
    if (NO_MOTION_MEDIA_QUERY())
      // Without motion, there are no transitions, resolve immidietaly
      return r();
    else
      element.addEventListener('transitionend', function handler(e) {
        if (e.target === element) {
          element.removeEventListener('transitionend', handler);
          r();
        }
      });
  });
}

/**
 * Helper function with a promise resolving after given amount of ms
 * @param {number} time - Amount of ms to wait 
 */
function waitMs(time) {
  return new Promise(r => {
    setTimeout(r, time);
  });
}

/**
 * Check if uploaded files are playable and notifies user if not
 * @param {(File[]|FileList)} files - List of files to be validated
 * @returns {File[]} An array of valid files, empty if all are invalid
 */
function validateFilesUploaded(files) {
  const audioTester = new Audio();
  const output = Array.from(files).filter(file => {
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
  audioTester.remove();
  return output;
}


// Register Service Worker
let serviceWorker = new Promise((resolve, reject) => {
  if (!('serviceWorker' in window.navigator)) {
    /**
     * User browser is not supported, probably because of missing features
     * @event unsupported-browser
     * @type {object}
     * @param {array} missingFeatures - List of features that are missing in browser
     */
    window.dispatchEvent(new CustomEvent('unsupported-browser',
      { detail: { missingFeatures: [ 'Service Worker' ] } }));
    loadCSS('css/noscript.css');
    circle.classList.add('error');
    let circleSpan = document.querySelector('#circle span');
    if (!circleSpan) {
      circleSpan = document.createElement('span');
      circle.appendChild(circleSpan);
    }
    if (/firefox/i.test(navigator.userAgent))
      // Firefox disables SW in incognito
      circleSpan.textContent = 'Service Worker is not available, it might be because you are in Private mode. To use Specta Player, try leaving Private mode or switch to a newer browser';
    else
      circleSpan.textContent = 'Your probably using a very old browser, please switch to something newer ;-;';
    reject('Service Worker not supported');
  }
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) {
      serviceWorker = new Workbox('service-worker.js',
        { scope: location.origin.includes('github') ? '/specta-player/' : '/' });

      // Detect when the service worker has been activated
      serviceWorker.addEventListener('activated', e => {
        if (e.isUpdate) return;
        Notifier.showToast('App can now work offline ⚙', { duration: 4000, dismissButton: true });
      });

      // Detect and show a notification to reload when new SW is available
      serviceWorker.addEventListener('waiting', () => {
        Notifier.showToast('🔄 A new version is available', {
          duration: 10000,
          btnText: 'Update',
          btnFunction: async () => {
            // Ping the new SW about to update
            (await navigator.serviceWorker.ready).waiting.postMessage({ type: 'REQUEST_UPDATE' });
            location.reload();
          }
        });
      });

      serviceWorker.register();
      serviceWorker.active.then(() => resolve(serviceWorker));
    }
  }, { once: true });
});


// Load drag-n-drop if on desktop
setTimeout(() => {
  const handleResize = () => {
    if (!window.matchMedia(window.MOBILE_MEDIA_QUERY).matches) {
      import('./dragndrop');
      window.removeEventListener('resize', handleResize);
    }
  };
  window.addEventListener('resize', handleResize);
  handleResize();
}, 0);


// Disable right-click
window.addEventListener('contextmenu', e => e.preventDefault());



// Handle various events


// Show error when client doesn't support necessary features
window.addEventListener('unsupported-browser', e => {
  loadCSS('css/noscript.css');
  circle.classList.add('error');
  let circleSpan = document.querySelector('#circle span');
  if (!circleSpan) {
    circleSpan = document.createElement('span');
    circle.appendChild(circleSpan);
  }
  if (e.detail.missingFeatures[0] === 'Service Worker' && /firefox/i.test(navigator.userAgent))
    // Firefox disables SW in incognito
    circleSpan.textContent = 'Service Worker is not available, it might be because you are in Private mode. To use Specta Player, try leaving Private mode or switch to a newer browser';
  else
    circleSpan.textContent = 'Your probably using a very old browser, please switch to something newer ;-;';
}, { once: true });

// Listen and expose `beforeinstallprompt` event
window.installPromptEvent = new Promise((resolve, reject) => {
  if (!('BeforeInstallPromptEvent' in window)) reject('a2hs-not-supported');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    resolve(e);
  });
});

// Show circle when needed
window.addEventListener('show-upload-circle', async () => {
  const handler = e => {
    if (e instanceof KeyboardEvent && !(e.keyCode === 32 || e.keyCode === 13))
      // If event is keyboard and it wasn't enter or space, ignore
      return;
    circle.blur();
    circle.tabIndex = -1;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/mpeg,audio/flac/,audio/ogg,audio/webm,.mp3,.json';
    input.addEventListener('change', async e => {
      await hideUploadIcon();
      const files = e.target.files;
      const validFiles = validateFilesUploaded(files);
      if (validFiles.length) {
        // Start loading the editor in the background
        import('./editor');
        circle.removeEventListener('click', handler);
        circle.removeEventListener('keydown', handler);
        await hideUploadIcon();
        circle.classList.add('loading');
        window.dispatchEvent(new CustomEvent('files-added', {
          detail: { files: validFiles }
        }));
      } else {
        circle.classList.remove('loading');
        await showUploadIcon();
        window.dispatchEvent(new CustomEvent('show-upload-circle'));
      }
      Array.from(document.querySelectorAll('input[type="file"]')).forEach(item => item.remove());
    });
    document.body.appendChild(input);
    input.dispatchEvent(new MouseEvent('click', { bubbles: false }));
  };
  await showUploadButton();
  circle.tabIndex = 0;
  circle.addEventListener('click', handler);
  circle.addEventListener('keydown', handler);
  window.addEventListener('files-added-alt', () => {
    // Files added via drag-n-drop, cancel the circle
    circle.removeEventListener('click', handler);
    circle.removeEventListener('keydown', handler);
    hideUploadIcon();
    circle.classList.add('loading');
  });
  circle.focus();
});

// Handle file upload
window.addEventListener('files-added', async e => {
  /** @type {FileList} */
  const files = e.detail.files;

  // We need transferable objects so getting native SW implementation
  /** @type {ServiceWorkerContainer} */
  const nsw = await serviceWorker.getSW(),
        audioTester = new Audio();
  audioTester.preload = 'metadata';
  async function computeFile(file, providedBuffer = null) {
    const meta = {
      name: file.name,
      type: file.type,
      duration: null
    }
    audioTester.src = URL.createObjectURL(file);
    if (!audioTester.canPlayType(file.type)) {
      console.warn(`Skipping audio file "${fiel.name}", audio element can't play`);
      Notifier.showToast(`Can't play file "${fiel.name}", skipping 🔇`);
      return false;
    };
    meta.duration = await new Promise(r => { // Wait for metadata to process and get duration
      if (!isNaN(audioTester.duration)) {
        r(audioTester.duration);
        return;
      }
      audioTester.addEventListener('loadedmetadata', () =>
        r(audioTester.duration));
    });
    audioTester.src = '';
    URL.revokeObjectURL(audioTester.src);
    const buffer = providedBuffer || await file.arrayBuffer(),
          msgChannel = new MessageChannel();
    msgChannel.port1.addEventListener('message', e => {
      if (e.data.error)
        console.error('Details for error below,', e.data.payload);
        throw new Error(e.data.error);
    }, { once: true });
    nsw.postMessage({ type: 'SAVE_FILE', payload: { meta, buffer } }, [buffer, msgChannel.port2]);
    return true;
  }
  let atLeastOneAdded = false;
  for (let file of files) {
    if (file.type.match(/^audio/)) {
      const result = await computeFile(file);
      if (result) {
        window.appState.config.push({
          type: "audio",
          name: file.name.match(/(.+)\..[^\.]+$/)[1], // Get file name without .ext
          song: file.name
        });
        atLeastOneAdded = true;
      }
    } else {
      // Read from config file
      if (!file.name.match(/\.json$/))
        // Failsafe in case non-audio and non-json reaches this point
        throw new Error(`Invalid file passed to analyse! type: ${file.type}, name: ${file.name}`);
      const configFile = JSON.parse(await file.text());
      // Check JSON is a valid config file
      if (configFile.type !== "SpectaPlayerConfigJSON-rev1") {
        console.warn('Invalid JSON uploaded as config ', file.name);
        Notifier.showToast('Uploaded invalid config ⚠');
        continue;
      }
      // If config already exists, make sure user wants to replace
      let abortRead = false;
      if (window.appState.config.length) {
        const dialogResult = await Notifier.askDialog(
          'Replace current config?',
          {
            innerMsg: 'You have just uploaded a new config, if you choose use it, you will lose the current one.',
            cancelText: 'Cancel',
            acceptText: 'Replace'
          }
        ).then(() => true, result => {
          if (result.error)
            throw result.error;
          else
            return false;
        });
        abortRead = !dialogResult;
        // Remove all songs from current index
        if (!abortRead) {
          if (window.appState.config.length) {
            // Filter config to get list of used audio files
            const songsUsed = new Set(window.appState.config.map(item => item.song).filter(item => item !== undefined));
            window.appState.config = [];
            for (let song of songsUsed) {
              await (await serviceWorker).messageSW({ type: 'DELETE_FILE', payload: song });
            }
          }
        }
      }
      if (!abortRead) {
        // Read and save new songs
        for (let filename in configFile.audio) {
          const fileFetch = await fetch(configFile.audio[filename]),
                blob = await fileFetch.clone().blob();
          blob.name = filename;
          await computeFile(blob, await fileFetch.arrayBuffer());
        }
        window.appState.config = configFile.order;
        atLeastOneAdded = true;
      }
    }
  }
  audioTester.remove();
  if (!atLeastOneAdded) {
    if (!(editor && editor.isOpen) && !(spConsole && spConsole.isOpen)) {
      circle.classList.remove('loading');
      await showUploadIcon();
      window.dispatchEvent(new CustomEvent('show-upload-circle'));
    }
    return;
  }
  
  if (spConsole && spConsole.isOpen)
    await spConsole.close();
  circle.classList.remove('loading');
  await hideUploadButton();
  window.dispatchEvent(new CustomEvent('open-editor'));
});


// Handle Service Worker file exists check
serviceWorker.then(sw => sw.addEventListener('message', e => {
  if (e.data.type !== 'CHECK_IF_FILE_USED') return;
  const song = e.data.payload;
  if (!window.appState.config.length)
    return e.data.port.postMessage(false);
  else {
    // Filter config to get list of used audio files
    const songsUsed = new Set(window.appState.config.map(item => item.song).filter(item => item !== undefined));
    return e.data.port.postMessage(songsUsed.has(song));
  }
}));


// Handle clearing all data
window.addEventListener('clear-database', async () => {
  const sw = await serviceWorker;
  await sw.messageSW({ type: 'SAVE_CONFIG', payload: [] });
  const songsUsed = new Set(window.appState.config.map(item => item.song).filter(item => item !== undefined));
  window.appState = {
    dragging: false,
    audioBuffers: {},
    config: []
  };
  for (let song of songsUsed) {
    console.log(`Removing song ${song}:`, await (await serviceWorker).messageSW({ type: 'DELETE_FILE', payload: song }));
  }
  if (spConsole && spConsole.isOpen)
    await spConsole.close();
  if (editor && editor.isOpen)
    await editor.close();
  window.dispatchEvent(new CustomEvent('show-upload-circle'));
});


// Open console when needed
window.addEventListener('open-console', async () => {
  document.querySelector('#editor').classList.remove('first-time');
  if (spConsole) {
    spConsole.render();
    await spConsole.open();
  } else {
    spConsole = (await import('./console')).default;
    spConsole.render();
    await spConsole.open();
  }
});


// Open editor when needed
window.addEventListener('open-editor', async () => {
  if (editor) {
    editor.render();
    await editor.open();
  } else {
    editor = (await import('./editor')).default;
    editor.render();
    await editor.open();
    window.editor = editor
  }
});


// Handle setting theme
window.addEventListener('switch-theme-dark', () => {
  window.localStorage.theme = 'dark';
  document.documentElement.classList.add('theme', 'dark');
});
window.addEventListener('switch-theme-light', () => {
  window.localStorage.theme = 'light';
  document.documentElement.classList.add('theme');
  document.documentElement.classList.remove('dark');
});
window.addEventListener('switch-theme-system', () => {
  window.localStorage.removeItem('theme');
  document.documentElement.classList.remove('theme', 'dark');
});



// Functions for circle

/** Show the circle */
function showUploadButton() {
  return new Promise(async r => {
    if (circle.getAttribute('hidden') === null) return r();
    const uploadIcon = document.querySelector('#upload-icon');
    const waitForClose = [];
    if (editor) waitForClose.push(editor.close());
    if (spConsole) waitForClose.push(spConsole.close());
    const circleStylesLink = document.querySelector('link[href="css/circle.css"]');
    const circleRadius = Math.min(350, window.innerWidth * 0.35),
          screenDiameterHalf = Math.sqrt(Math.pow(window.innerHeight, 2) + Math.pow(window.innerWidth, 2)) / 2,
          transitionTime = Math.min(300, Math.round(screenDiameterHalf/circleRadius*100));
    circle.style.transitionDuration = `${transitionTime}ms`;
    circle.style.transform = `scale(${screenDiameterHalf/circleRadius})`;
    uploadIcon.style.transform = `scale(${circleRadius/screenDiameterHalf})`;
    uploadIcon.style.transitionDuration = `${transitionTime}ms, ${transitionTime}ms`;
    uploadIcon.classList.add('faded-out');
    uploadIcon.classList.remove('exit');
    await onloadCSS(circleStylesLink);
    document.body.classList.add('circle-on');
    circle.removeAttribute('hidden');
    uploadIcon.removeAttribute('hidden');
    doubleRAF(() => {
      circle.style.transform = '';
      uploadIcon.style.transform = '';
      uploadIcon.style.transitionDuration = '';
      uploadIcon.classList.remove('faded-out');
      waitForTransition(circle).then(r);
    });
  });
}

/** Hide the circle (considers upload icon is hidden) */
function hideUploadButton() {
  return new Promise(async r => {
    if (circle.getAttribute('hidden') !== null) return r();
    const uploadIcon = document.querySelector('#upload-icon');
    if (uploadIcon.getAttribute('hidden') === null)
      await hideUploadIcon();
    const circleRadius = Math.min(350, window.innerWidth * 0.35),
          screenDiameterHalf = Math.sqrt(Math.pow(window.innerHeight, 2) + Math.pow(window.innerWidth, 2)) / 2,
          transitionTime = Math.min(300, Math.round(screenDiameterHalf/circleRadius*50));
    circle.style.transform = '';
    circle.style.transitionDuration = `${transitionTime}ms`;
    circle.style.transitionTimingFunction = 'ease-in';
    doubleRAF(() => {
      circle.style.transform = `scale(${screenDiameterHalf/circleRadius})`;
      waitForTransition(circle).then(() => {
        document.body.classList.remove('circle-on');
        circle.setAttribute('hidden', true);
        r();
      });
    });
  });
}

/** Show only upload icon (considers circle is shown) */
function showUploadIcon() {
  if (circle.getAttribute('hidden') !== null)
    return showUploadButton();
  return new Promise(async r => {
    const uploadIcon = document.querySelector('#upload-icon');
    if (uploadIcon.getAttribute('hidden') === null)
      return r();
    uploadIcon.classList.remove('exit');
    uploadIcon.classList.add('faded-out');
    uploadIcon.removeAttribute('hidden');
    return doubleRAF(() => {
      uploadIcon.classList.remove('faded-out');
      waitForTransition(uploadIcon).then(r);
    });
  });
}

/** Hide only upload icon (considers circle is shown) */
function hideUploadIcon() {
  return new Promise(async r => {
    const uploadIcon = document.querySelector('#upload-icon');
    if (circle.getAttribute('hidden') !== null || uploadIcon.getAttribute('hidden') !== null)
      return r();
    uploadIcon.classList.add('exit');
    uploadIcon.style.transitionTimingFunction = 'ease-in';
    return doubleRAF(() => {
      uploadIcon.classList.add('faded-out');
      waitForTransition(uploadIcon).then(() => {
        uploadIcon.setAttribute('hidden', true);
        uploadIcon.classList.remove('exit');
        uploadIcon.style.transitionTimingFunction = '';
        r();
      });
    });
  });
}


// Main logic

// Check if there's saved data
serviceWorker.then(async sw => {
  const save = await sw.messageSW({ type: 'READ_CONFIG' });
  if (save) {
    window.appState.config = save;
    window.dispatchEvent(new CustomEvent('open-console'));
    // Preload editor for later 
    import('./editor');
  } else
    window.dispatchEvent(new CustomEvent('show-upload-circle'));
});

// Check for saved theme
if (window.localStorage.theme) {
  document.documentElement.classList.add('theme');
  if (window.localStorage.theme === 'dark')
    document.documentElement.classList.add('dark');
  else
  document.documentElement.classList.remove('dark');
}

window.showUploadButton =showUploadButton

// Export helper functions for other scripts
export { MOBILE_MEDIA_QUERY, NO_MOTION_MEDIA_QUERY, doubleRAF,
  waitMs, waitForTransition, validateFilesUploaded, serviceWorker }