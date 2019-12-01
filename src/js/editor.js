import loadCSS from './loadcss-promises';
import Slip from 'slipjs';
import Notifier from '@myfrom/notifier';
import { MOBILE_MEDIA_QUERY, NO_MOTION_MEDIA_QUERY, waitForTransition, doubleRAF,
  serviceWorker, validateFilesUploaded } from './index';
import './preview-player';

loadCSS('css/editor.css');

// For editor syntax highlighting
const html = String.raw;

class SPEditor {

  constructor() {
    this.dom = document.querySelector('#editor');
    if (!this.dom)
      throw new Error('SPEditor cannot be initialised without DOM');

    this._listItemTemplate = this.dom.querySelector('#editor-table-content-template');

    // Shortcut for phone media query
    this._mobileMediaQueryRef = window.matchMedia(MOBILE_MEDIA_QUERY);
    this._mobileMediaQueryRef.addListener(e => this._isPhone = e.matches);
    this._isPhone = this._mobileMediaQueryRef.matches;

    this.render();

    // Bind buttons to dialogs
    this.dom.querySelector('#editor-add-audio-btn')
      .addEventListener('click', this._addAudio.bind(this));
    this.dom.querySelector('#editor-add-label-btn')
      .addEventListener('click', this._addLabel.bind(this));

    // Bind save buttons
    this.dom.querySelector('#editor-done-btn')
      .addEventListener('click', this._proceed.bind(this));
    this.dom.querySelector('#editor-fab')
      .addEventListener('click', this._proceed.bind(this));

    this._songsToRemove = [];

    // Bind event handlers
    this._reactToKeys = this._reactToKeys.bind(this);
  }

  get isOpen() {
    return this.dom.getAttribute('hidden') === null;
  }

  async open() {
    if (this.isOpen)
      return;
    else {
      // Bind key listeners
      window.addEventListener('keydown', this._reactToKeys.bind(this));
      // Animate if allowed
      if (!NO_MOTION_MEDIA_QUERY()) {
        await new Promise(r => requestAnimationFrame(async () => {
          document.body.style.overflowY = 'hidden';
          this.dom.classList.add('opening');
          this.dom.removeAttribute('hidden');
          doubleRAF(() => {
            // Prevent FAB from layout jumping
            if (this.dom.offsetHeight > window.innerHeight)
              this.dom.querySelector('#editor-fab').style.top = `${window.innerHeight - 72 + window.scrollY}px`;
            this.dom.classList.remove('opening');
          });
          await waitForTransition(this.dom);
          // Reset FAB position
          this.dom.querySelector('#editor-fab').style.top = '';
          document.body.style.overflowY = 'hidden';
          r();
        }));
      } else
        this.dom.removeAttribute('hidden');
      
    }
    this.dom.classList.remove('first-time');

    this._songsToRemove = [];
  }

  async close() {
    if (!this.isOpen)
      return;
    else {
      // Unbind key listeners
      window.removeEventListener('keydown', this._reactToKeys);
      // Animate if allowed
      if (!NO_MOTION_MEDIA_QUERY()) {
        await new Promise(r => requestAnimationFrame(async () => {
          // Prevent FAB from layout jumping
          if (this.dom.offsetHeight > window.innerHeight)
            this.dom.querySelector('#editor-fab').style.top = `${window.innerHeight - 72 + window.scrollY}px`;
          document.body.style.overflowY = 'hidden';
          doubleRAF(() => {
            this.dom.classList.add('closing');
          });
          await waitForTransition(this.dom);
          // Reset FAB position
          this.dom.querySelector('#editor-fab').style.top = '';
          document.body.style.overflowY = 'hidden';
          this.dom.classList.remove('closing');
          r();
        }));
      }
      this.dom.setAttribute('hidden', true);

      // Clear the container
      this.dom.querySelectorAll('#editor-slip-container .list-item').forEach(el => el.remove());
    }
  }

  render() {
    if (!(window.appState && window.appState.config)) {
      console.warn('Editor: No config object available');
      return;
    }
    const list = this.config = window.appState.config,
          cont = this.dom.querySelector('#editor-slip-container');
    
    // Clear the container
    cont.querySelectorAll('.list-item').forEach(el => el.remove());

    // Setup Slip
    if (!this._slip) {
      cont.addEventListener('slip:beforewait', e => {
        if (!this._isPhone)
          if (e.target.closest('div').classList.contains('table-left-icons'))
            e.preventDefault();
      });
      cont.addEventListener('slip:beforeswipe', e => {
        if (e.target.tagName === 'INPUT')
          e.preventDefault();
      });
      cont.addEventListener('slip:swipe', e => {
        this._removeConfigEntry(e.detail.originalIndex - 1);
      });
      cont.addEventListener('slip:afterswipe', e => {
        e.target.parentNode.removeChild(e.target);
      });
      cont.addEventListener('slip:reorder', e => {
        e.target.parentNode.insertBefore(e.target, e.detail.insertBefore);
        const moved = this.config.splice(e.detail.originalIndex - 1, 1)[0];
        this.config.splice(e.detail.spliceIndex - 1, 0, moved);
        return false;
      });

      this._slip = new Slip(cont, { ignoredElements: 'template' });
    }

    // Fill the table with items
    for (let i = 0; i < list.length; i++) {
      const item = list[i],
            element = this._makeListItem(item);
      cont.appendChild(element);
    }
  }

  async _proceed() {
    window.appState.config = this.config;
    this._songsToRemove.forEach(song => {
      // Remove buffer of deleted song
      if (window?.appState?.config?.[song])
      delete window.appState.config[song];
      // And delete that song from the save
      /* serviceWorker.then(sw => sw.messageSW({ type: 'DELETE_FILE', payload: song })) */
      serviceWorker.messageSW({ type: 'DELETE_FILE', payload: song });
    });
    /* serviceWorker.then(sw => {
      sw.messageSW({
        type: 'SAVE_CONFIG',
        payload: window.appState.config
      }) */serviceWorker.messageSW({
        type: 'SAVE_CONFIG',
        payload: window.appState.config
      }).then(response => {
        if (response.error) {
          if (response.error === 'Failed saving config') {
            Notifier.showToast('❗ Saving failed! Your data won\'t persist after reload');
            gtag('event', 'exception', {
              'description': 'saving_config_error',
              'fatal': false
            });
          } else {
            console.error(response);
            throw new Error(response.error);
          }
        } else if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(persistend => {
            if (persistend) {
              if (!window.localStorage.savedToastShown) {
                Notifier.showToast('✅ Saved! Now you can come back to it even offline.', { dismissButton: true });
                window.localStorage.savedToastShown = true;
              }
              gtag('event', 'persistent_storage', {
                'event_category': 'saved_to_persistent'
              });
            } else {
              gtag('event', 'persistent_storage', {
                'event_category': 'saved_to_best_effort'
              });
            }
          });
        } else {
          gtag('event', 'persistent_storage', {
            'event_category': 'saved_with_no_storage_manager'
          });
        }
      });
    // });
    await this.close();
    window.dispatchEvent(new CustomEvent('open-console'));
  }

  _addAudio() {
    let audioElements = '';
    // Filter config to get list of used audio files
    const songsUsed = new Set(window.appState.config.map(item => item.song).filter(item => item !== undefined));
    songsUsed.forEach(key => {
      audioElements += html`
        <button dialogAction="ok" song="${key}" class="uaad-tile material-button">
          <sp-preview-player song="${key}"></sp-preview-player>
          <div><abbr title="${key}">${key}</abbr></div>
        </button>
      `;
    });
    // const dialogContainer = document.createElement('div');
    // dialogContainer.setAttribute('id', 'add-audio-dialog-container');
    // document.body.appendChild(dialogContainer);
    const promise = Notifier.showDialog('Add audio', html`
      <div class="uaad-grid">
        <button dialogAction="ok" dialogInitialFocus class="uaad-tile uaad-upload material-button">
          <i class="uaad-big-icon icon i-upload"></i>
        </button>
        ${audioElements}
      </div>
      <button class="material-button" dialogAction="cancel" slot="primaryAction">Cancel</button>
    `, {
      attributes: {
        id: 'add-audio-dialog',
        class: 'bottom-sheet'
      },
      formatted: true
    });
    let pickedSong = null;
    const buttons = document.querySelectorAll('.uaad-tile'),
          onAudioChosenHandler = e => {
            if (e.target.tagName === 'SP-PREVIEW-PLAYER') {
              e.preventDefault();
              e.stopPropagation();
            } else
              pickedSong = e.target.closest('.uaad-tile').getAttribute('song');
          };
    buttons.forEach((el, index) => {
      if (index === 0)
        el.addEventListener('click', e => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = 'audio/mpeg,audio/flac/,audio/ogg,audio/webm,.mp3';
          input.addEventListener('change', async e => {
            const files = e.target.files;
            const validFiles = validateFilesUploaded(files);
            if (validFiles.length) {
              window.dispatchEvent(new CustomEvent('files-added', {
                detail: { files: validFiles }
              }));
            }
            Array.from(document.querySelectorAll('input[type="file"]')).forEach(item => item.remove());
          });
          document.body.appendChild(input);
          input.dispatchEvent(new MouseEvent('click', { bubbles: false }));
        }, { once: true });
      else
        el.addEventListener('click', onAudioChosenHandler);
    });
    promise.then(_ => _, err => {
      if (err.error) {
        gtag('event', 'exception', {
          'description': 'add_label_dialog_error',
          'fatal': false
        });
        throw err;
      };
    }).then(() => {
      if (pickedSong) {
        const newItem = {
          type: "audio",
          name: pickedSong.match(/(.+)\..[^\.]+$/)[1], // Get file name without .ext
          song: pickedSong
        };
        window.appState.config.push(newItem);
        this.dom.querySelector('#editor-slip-container').appendChild(this._makeListItem(newItem));
      }
      buttons.forEach((el, index) => {
        if (index !== 0) el.removeEventListener('click', onAudioChosenHandler);
      });
      // dialogContainer.remove();
    });
  }

  _addLabel() {
    const promise = Notifier.showDialog('', html`
      <div>
        <div class="textbox">
          <input type="text" label="Add label" placeholder="Add label" dialogInitialFocus>
          <div class="textbox-underline"></div>
        </div>
      </div>
      <button class="material-button" dialogAction="ok" slot="primaryAction">Add</button>
      <button class="material-button" dialogAction="cancel" slot="secondaryAction">Cancel</button>
    `, {
      attributes: {
        id: 'add-label-dialog',
        class: 'bottom-sheet'
      },
      formatted: true,
      beforeClose: e => {
        const input = e.target.querySelector('input'),
              output = input.value;
        input.value = '';
        return output;
      }
    });
    promise.then(label => {
      if (label && /\S+/.test(String(label))) {
        const newItem = {
          type: 'label',
          name: label
        };
        window.appState.config.push(newItem);
        this.dom.querySelector('#editor-slip-container').appendChild(this._makeListItem(newItem));
        gtag('event', 'added_in_uploader', {
          'event_category': 'label'
        });
      };
    }, err => {
      if (err.error) {
        gtag('event', 'exception', {
          'description': 'add_label_dialog_error',
          'fatal': false
        });
        throw err;
      }
    });
  }

  _makeListItem(item) {
    const instance = document.importNode(this._listItemTemplate.content, true),
          cont = this.dom.querySelector('#editor-slip-container');
    instance.querySelector('[data-template="insertTypeIcon"]').classList.add(`i-${item.type}`);
    instance.querySelector('[data-template="name"]').value = item.name;
    instance.querySelector('[data-template="name"]').addEventListener('change', e => {
      const listItem = e.target.closest('.list-item'),
            // Get the index of clicked element, -1 because of template element in DOM
            index = Array.from(cont.children).indexOf(listItem) - 1;
      window.appState.config[index].name = e.target.value;
    });
    instance.querySelector('[data-template="insertFilename"]').textContent = item.song;
    instance.querySelector('[data-template="insertFilename"]').title = item.song;
    if (item.type === 'audio')
      instance.querySelector('[data-template="songPreview"]').song = item.song;
    else
    instance.querySelector('[data-template="songPreview"]').remove();
    instance.querySelector('.editor-table-delete-btn').addEventListener('click', e => {
      const listItem = e.target.closest('.list-item'),
            // Get the index of clicked element, -1 because of template element in DOM
            index = Array.from(cont.children).indexOf(listItem) - 1;
      this._removeConfigEntry(index);
      listItem.remove();
    });
    return instance;
  }

  _reactToKeys(e) {
    // Don't interrupt writing
    if (e.target.tagName === 'INPUT') return;
    if (e.keyCode === 76) this._addLabel();
    if (e.keyCode === 65) this._addAudio();
  }

  _removeConfigEntry(index) {
    const removedEntry = this.config[index];
    this.config.splice(index, 1);
    if (removedEntry.type === 'audio') {
      // Check if audio is used elsewhere, if not remove on save
      const removedSongFilename = removedEntry.song;
      const songsUsed = new Set(this.config.map(item => item.song).filter(item => item !== undefined));
      if (!songsUsed.has(removedSongFilename))
        this._songsToRemove.push(removedSongFilename);
    }
  }

}

export default new SPEditor();