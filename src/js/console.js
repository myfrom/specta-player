import { saveAs } from 'file-saver';
import Notifier from '@myfrom/notifier';
import { NO_MOTION_MEDIA_QUERY, MOBILE_MEDIA_QUERY, waitForTransition, doubleRAF, serviceWorker } from './index';
import './player';
import './temp-sp-menu';

class SPConsole {

  constructor() {
    this.dom = document.querySelector('#console');
    if (!this.dom)
      throw new Error('SPConsole cannot be initialised without DOM');

    this.render();

    // Handle the menu button
    this._menu = this.dom.querySelector('sp-menu');
    this._menu.anchorMenu(this.dom.querySelector('#menu-btn'));
    this._menu.addEventListener('sp-menu-about-clicked', () => {
      Notifier.showDialog('About', `
        <div class="mdc-dialog__content" id="my-dialog-content">
          Have you played music on your spectacles from system music player? Yeah, it's a pain. I had too, so I present to you - an easier and more enjoyable way to do that!
          <br><br>
          Main focus of this app was to provide a beautful, fast and smooth experience for those who need it, even without internet connection.
          <br><br>
          App developed with 🎧 & ❤ by <a href="https://myfrom.me" target="_blank" rel="noreferrer noopener">myfrom</a>.
        </div>
        <button class="material-button" dialogAction="ok" slot="primaryAction" dialogInitialFocus>Close</button>
      `, { formatted: true });
    });

    // Bind buttons to their functions
    this.dom.querySelector('#edit-btn').addEventListener('click', async () => {
      await this.close();
      window.dispatchEvent(new CustomEvent('open-editor'));
    });
    this.dom.querySelector('#download-btn').addEventListener('click', this.downloadConfig.bind(this));
    this.dom.querySelector('#clear-btn').addEventListener('click', this.clearData.bind(this));
    this.dom.querySelector('#stop-btn').addEventListener('click', this.stopAllTracks.bind(this));
    this.dom.querySelector('#loop-btn').addEventListener('click', () => this.loop = !this.loop);
    this.dom.querySelector('#crossfade-btn').addEventListener('click', () => this.crossfade = !this.crossfade);
    this.dom.querySelector('#multi-btn').addEventListener('click', this.multiChanged.bind(this));
    this.dom.querySelector('#menu-btn').addEventListener('click', () => this._menu.open());

    this._playingTracks = [];

    // Show Add to Home Screen UI if needed
    window.installPromptEvent.then(this._enableA2hsUI.bind(this), () => console.log('a2hs not supported'));

    // Bind event handlers
    this._handleSongPlay = this._handleSongPlay.bind(this);
    this._handleSongPause = this._handleSongPause.bind(this);
  }

  get loop() {
    return this._loop;
  }
  set loop(value) {
    this._loop = Boolean(value);
    this.dom.querySelectorAll('sp-player').forEach(el => el.loop = this._loop);
    this.dom.querySelector('#loop-btn').classList.toggle('active', value);
  }

  get crossfade() {
    return this._crossfade;
  }
  set crossfade(value) {
    this._crossfade = Boolean(value);
    this.dom.querySelectorAll('sp-player').forEach(el => el.crossfade = this._crossfade);
    this.dom.querySelector('#crossfade-btn').classList.toggle('active', value);
  }

  get multi() {
    return this._multi;
  }
  set multi(value) {
    this._multi = Boolean(value);
    this.dom.querySelector('#multi-btn').classList.toggle('active', value);
  }

  get isOpen() {
    return this.dom.getAttribute('hidden') === null;
  }

  async open() {
    if (this.isOpen)
      return;
    else {
      // Add event listeners
      window.addEventListener('player-play', this._handleSongPlay);
      window.addEventListener('player-pause', this._handleSongPause);

      // Animate if allowed
      if (!NO_MOTION_MEDIA_QUERY()) {
        await new Promise(r => requestAnimationFrame(async () => {
          document.body.style.overflowY = 'hidden';
          this.dom.classList.add('opening');
          this.dom.removeAttribute('hidden');
          doubleRAF(() => {
            // Prevent FAB from layout jumping
            if (this.dom.offsetHeight > window.innerHeight) {
              const actionsRow = this.dom.querySelector('#actions-row');
              actionsRow.style.top = `${window.innerHeight - actionsRow.offsetHeight + window.scrollY}px`;
            }
            this.dom.classList.remove('opening');
          });
          await waitForTransition(this.dom);
          // Reset FAB position
          this.dom.querySelector('#actions-row').style.top = '';
          document.body.style.overflowY = 'hidden';
          r();
        }));
      } else
        this.dom.removeAttribute('hidden');

      // Open install banner if exists
      if (this._shouldShowInstallBanner() && this._installBannerImport)
        this._installBannerImport.then(installBanner => installBanner.open());

      this._playingTracks = [];
    }
  }

  async close() {
    if (!this.isOpen)
      return;
    else {
      // Remove event listeners
      window.removeEventListener('player-play', this._handleSongPlay);
      window.removeEventListener('player-pause', this._handleSongPause);
      // Close install banner if exists
      if (this._installBannerImport) this._installBannerImport.then(installBanner => installBanner.close());
      // Animate if allowed
      if (!NO_MOTION_MEDIA_QUERY()) {
        await new Promise(r => requestAnimationFrame(async () => {
          // Prevent FAB from layout jumping
          if (this.dom.offsetHeight > window.innerHeight) {
            const actionsRow = this.dom.querySelector('#actions-row');
            actionsRow.style.top = `${window.innerHeight - actionsRow.offsetHeight + window.scrollY}px`;
          }
          document.body.style.overflowY = 'hidden';
          doubleRAF(() => {
            this.dom.classList.add('closing');
          });
          await waitForTransition(this.dom);
          // Reset FAB position
          this.dom.querySelector('#actions-row').style.top = '';
          document.body.style.overflowY = 'hidden';
          this.dom.classList.remove('closing');
          r();
        }));
      }
      this.dom.setAttribute('hidden', true);
      
      // Clear the container
      Array.from(this.dom.querySelector('#audio-container').children).forEach(el => el.remove());
    }
  }

  render() {
    if (!window?.appState?.config?.length) {
      console.warn('Trying to render console but config is empty!');
      return;
    }
    
    const cont = this.dom.querySelector('#audio-container');

    // Clear the container
    Array.from(cont.children).forEach(el => el.remove());

    for (let item of window.appState.config) {
      const el = document.createElement(item.type === 'audio' ? 'sp-player' : 'h2');
      if (item.type === 'audio') {
        // Add audio element
        el.name = item.name;
        el.song = item.song;
      } else {
        // Add label element
        el.textContent = item.name;
      }
      cont.appendChild(el);
    }
  }
  
  async downloadConfig() {
    const usedSongs = new Set(window.appState.config.map(item => item.song).filter(item => item !== undefined)),
          audioFiles = {},
          fileReader = new FileReader();
    for (let song of usedSongs) {
      /* const sw = await serviceWorker; */
      const meta = await /* sw */serviceWorker.messageSW({ type: 'FILE_METADATA_REQUEST', payload: song });
      if (meta.error) {
        const err = meta.error === 'NOT-FOUND' ?
          new Error(`Trying to download an undefined song ${song}`) :
          meta.error;
        Notifier.showToast('❗ Failed to download config!', { duration: 6000, dismissButton: true });
        gtag('event', 'exception', {
          'description': 'downloading_config_error_meta',
          'fatal': false
        });
        throw err;
      }
      const buffer = await /* sw */serviceWorker.messageSW({ type: 'FILE_CONTENT_REQUEST', payload: song });
      if (buffer.error) {
        Notifier.showToast('❗ Failed to download config!', { duration: 6000, dismissButton: true });
        gtag('event', 'exception', {
          'description': 'downloading_config_error_buffer',
          'fatal': false
        });
        throw err;
      }
      const blob = new Blob([buffer], { type: meta.type });
      fileReader.readAsDataURL(blob);
      await new Promise(r => {
        fileReader.onload = () => {
          const base64 = fileReader.result;
          audioFiles[song] = base64;
          r();
        }
      });
    }
    const data = {
      type: 'SpectaPlayerConfigJSON-rev1',
      order: window.appState.config,
      audio: audioFiles
    };
    const file = new File([JSON.stringify(data)], 'specta-player-config.json', { type: "application/json;charset=utf-8" });
    saveAs(file);
  }

  clearData() {
    Notifier.askDialog('Remove everything?', {
      innerMsg: 'Delete app data and start over?\n(This won\'t remove files from your device)',
      cancelText: 'Keep it',
      acceptText: 'Remove',
      attributes: { id: 'clear-all-dialog' }
    }).then(() => {
      window.dispatchEvent(new CustomEvent('clear-database'), { bubbles: true, composed: true });
    }).catch(e => {
      if (e.error) throw e.error;
    });
  }

  stopAllTracks() {
    // A little animation
    if (!this._stopBtnCancelAnimation && !NO_MOTION_MEDIA_QUERY())
      requestAnimationFrame(() => {
        this.dom.querySelector('#stop-btn').classList.add('active');
        setTimeout(() => 
          this.dom.querySelector('#stop-btn').classList.remove('active'), 160);
      });

    this._stopBtnCancelAnimation = false;
    
    if (this._playingTracks.length)
      this._playingTracks.forEach(el => {
        el.togglePlay(false);
      });
  }

  multiChanged() {
    this.multi = !this.multi;
    if (!this.multi && this._playingTracks.length) {
      const temp = this._playingTracks.pop();
      this.stopAllTracks();
      this._playingTracks.push(temp);
    }
  }

  _handleSongPlay(e) {
    if (!this.multi) {
      this._stopBtnCancelAnimation = true;
      this.stopAllTracks();
    }
    this._playingTracks.push(e.detail);
  }

  _handleSongPause(e) {
    const player = e.detail;
    this._playingTracks.splice(this._playingTracks.indexOf(player), 1);
  }

  _enableA2hsUI(event) {
    this._installBannerImport = import('./install-banner').then(() => {
      const installBanner = document.createElement('sp-install-banner');
      installBanner.installPromptEvent = event;
      this.dom.appendChild(installBanner);
      return installBanner;
    });

    /* const installBtn = this.dom.querySelector('#a2hs-install-btn');
    installBtn.disabled = false;
    installBtn.addEventListener('click', () => { */
    this._menu.showInstallBtn();
    this._menu.addEventListener('sp-menu-install-clicked', () => {
      event.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          console.info('Installed to homescreen');
          gtag('event', 'installed-pwa', {
            'event_category': 'add-to-homescreen',
            'event_label': 'User has added PWA to their home screen'
          });
        } else {
          console.info('Install prompt rejected');
          gtag('event', 'install-rejected', {
            'event_category': 'add-to-homescreen',
            'event_label': 'User has rejected add to homescreen prompt'
          });
        }
        window.dispatchEvent(new CustomEvent('delete-a2hs-ui'), { bubbles: true, composed: true });
      });

      event.prompt();
    });
    window.addEventListener('delete-a2hs-ui', () => {
      /* installBtn.remove(); */
      this._menu.hideInstallBtn();
    }, { once: true });

    if (this._shouldShowInstallBanner()) {
      // On phones show the banner
      this._installBannerImport.then(installBanner => {
        if (this.isOpen)
          installBanner.open();
      });
      const resizeHandler = () => {
        if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
          this._installBannerImport.then(installBanner => installBanner.close());
          window.removeEventListener('resize', resizeHandler, { passive: true });
        }
      };
      window.addEventListener('resize', resizeHandler, { passive: true });
    } else {
      this._installBannerImport.then(installBanner => installBanner.close());
    }
  }

  _shouldShowInstallBanner() {
    if (!window.matchMedia(MOBILE_MEDIA_QUERY).matches) return false;
    // Don't show if was dismissed during this session
    if (window.sessionStorage.installBannerDismissed) return false;
    // Don't show if banner was dismissed more then two times already
    if (window.localStorage.installBannerDismissed > 2) return false;
    return true;
  }

}

export default new SPConsole();