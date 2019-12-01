import SPAudioNode from './audio-node';

// For editor syntax highlighting
const html = String.raw;

class PreviewPlayer extends HTMLElement {

  static get observedAttributes() { return ['song']; }

  get template() {
    return html`
      <style>
        :host {
          display: block;
          height: 40px;
          width: 40px;
          border-radius: 50%;
          position: relative;
          background: none;
          border: none;
          outline: none !important;
        }
        #shade {
          border-radius: 50%;
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          background-color: var(--divider-color);
          opacity: 0;
          transition: 160ms opacity ease-in;
        }
        :host(:focus) #shade, :host(:hover) #shade {
          opacity: 0.75;
          transition-timing-function: ease-out;
        }
        #play-button:active ~ #shade {
          opacity: 1;
        }
        #play-button {
          display: block;
          width: var(--icon-size, 24px);
          height: var(--icon-size, 24px);
          background: none;
          border: none;
          outline: none !important;
          margin: 0;
          padding: calc(var(--icon-size, 24px) * 0.135);
          border-radius: 0;
          overflow: hidden;
          position: relative;
        }
        .left, .right {
          width: 36%;
          height: 100%;
          background-color: var(--preview-player-color, var(--secondary-text-color));
          transition: all 240ms cubic-bezier(0.77, 0, 0.175, 1);
        }
        .left {
          float: left;
        }
        .right {
          float: right;
        }
        .triangle-1, .triangle-2 {
          position: absolute;
          top: 0;
          right: 0;
          width: 0;
          height: 0;
          background-color: transparent;
          border-top: calc(var(--icon-size, 24px) / 2) solid transparent;
          border-bottom: calc(var(--icon-size, 24px) / 2) solid transparent;
          border-right: var(--icon-size, 24px) solid var(--preview-player-background, var(--white-color));
          transition: transform 240ms cubic-bezier(0.77, 0, 0.175, 1);
        }
        .triangle-1 {
          top: calc(var(--icon-size, 24px) * 0.135);
          transform: translateY(-100%);
        }
        .triangle-2 {
          top: calc(var(--icon-size, 24px) * -0.135);
          transform: translateY(100%);
        }
        :host(:not([playing])) .left {
          width: 50%;
        }
        :host(:not([playing])) .right {
          width: 50%;
        }
        :host(:not([playing])) .triangle-1 {
          transform: translateY(-50%);
        }
        :host(:not([playing])) .triangle-2 {
          transform: translateY(50%);
        }
      </style>
      <button id="play-button">
        <div class="left"></div>
        <div class="right"></div>
        <div class="triangle-1"></div>
        <div class="triangle-2"></div>
      </button>
      <div id="shade"></div>
    `;
  }

  get song() {
    return this.getAttribute('song');
  }
  set song(value) {
    if (value === undefined) return;
    if (this.song)
      console.warn('Setting song on already initialised preview player does nothing!');
    this.setAttribute('song', value);
  }

  get playing() {
    return this.getAttribute('playing') !== null;
  }
  set playing(value) {
    if (value)
      this.setAttribute('playing', true);
    else
      this.removeAttribute('playing');
  }

  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = this.template;

    // Bind event handlers
    this._handleClick = this._handleClick.bind(this);
    this.pause = this.pause.bind(this);
  }

  connectedCallback() {
    this.addEventListener('click', this._handleClick);
    window.addEventListener('preview-player-play', this.pause);

    if (!this._initialised && this.song)
      this._init();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._handleClick);
    window.removeEventListener('preview-player-play', this.pause);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'song' && oldValue !== newValue && newValue)
      this._init();
  }

  play() {
    this.dispatchEvent(new CustomEvent('preview-player-play',
      { detail: this.song, composed: true, bubbles: true }));
    this.playing = true;
    return this._audio.play(0);
  }

  pause() {
    this.dispatchEvent(new CustomEvent('preview-player-pause',
      { detail: this.song, composed: true, bubbles: true }));
    this.playing = false;
    return this._audio.pause();
  }

  _init() {
    if (!this._initialised && this.song) {
      this._initialised = true;
      this._audio = new SPAudioNode(this.song);
      this._audio.addEventListener('audio-paused', () => {
        this.dispatchEvent(new CustomEvent('preview-player-pause',
          { detail: this.song, composed: true, bubbles: true }));
        this.playing = false;
      });
    } else {
      console.warn(`Tried to initialise preview player when ${this.song ? 'no song is set' : 'already initialised'}!`);
    }
  }

  _handleClick() {
    if (this.playing)
      this.pause();
    else
      this.play();
  }

}

customElements.define('sp-preview-player', PreviewPlayer);
