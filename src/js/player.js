import SPAudioNode from './audio-node';

// For editor syntax highlighting
const html = String.raw;

class SPPlayer extends HTMLElement {

  static get observedAttributes() { return [ 'song', 'name', 'loop', 'crossfade' ] }

  get template() {
    return html`
      <style>
        :host {
          position: relative;
          min-width: 0;
          height: 82px;
        }
        button {
          border-radius: 0;
          border: none;
          outline: none !important;
          position: relative;
          width: 100%;
          height: 100%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          color: var(--primary-text-color);
          background-color: var(--white-color);
          font-family: var(--main-font);
          padding: 8px 16px;
          justify-content: space-evenly;
          outline: none !important;
        }
        button::before {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          background-color: var(--primary-color);
          opacity: 0;
          transition: opacity 160ms ease-in-out;
          pointer-events: none;
        }
        :host([playing]) button::before {
          opacity: 0.1;
        }
        #progress-container {
          pointer-events: none;
          box-sizing: border-box;
          overflow: hidden;
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
        }
        #progress-bar {
          box-sizing: border-box;
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          transform: scaleX(0);
          transform-origin: left;
          background-color: var(--primary-color);
          opacity: var(--hint-opacity);
        }
        #label, #filename, #progress-time {
          position: absolute;
          left: 16px;
          right: 16px;
          text-align: start;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-decoration: none;
        }
        #label {
          font-size: 16px;
          top: 12px;
        }
        #filename {
          font-size: 12px;
          color: var(--secondary-text-color);
          top: 36px;
        }
        #progress-time {
          font-size: 12px;
          font-weight: 500;
          top: 55px;
        }
      </style>
      <button>
        <div id="progress-container">
          <div id="progress-bar"></div>
        </div>
        <abbr id="label"></abbr>
        <abbr id="filename"></abbr>
        <div id="progress-time">0:00 / 0:00</div>
      </button>
    `;
  }

  get song() {
    return this.getAttribute('song');
  }
  set song(value) {
    if (value === undefined) return;
    if (this.song) {
      console.warn('Setting song on already initialised preview player does nothing!');
      return;
    }
    this.setAttribute('song', value);
    this.shadowRoot.querySelector('#filename').textContent = value;
    this.shadowRoot.querySelector('#filename').title = value;
  }

  get name() {
    return this.getAttribute('name');
  }
  set name(value) {
    if (value === undefined) return;
    if (this.name) {
      console.warn('Setting name on already initialised preview player does nothing!');
      return;
    }
    this.setAttribute('name', value);
    this.shadowRoot.querySelector('#label').textContent = value;
    this.shadowRoot.querySelector('#label').title = value;
  }

  get playing() {
    return this.getAttribute('playing') !== null;
  }
  set playing(value) {
    if (this._playing === Boolean(value)) return;
    if (value)
      this.setAttribute('playing', true);
    else
      this.removeAttribute('playing');
    this._playing = Boolean(value);
    this._notifyAboutPlayback(value);
  }

  get loop() {
    return this.getAttribute('loop') !== null;
  }
  set loop(value) {
    if (value)
      this.setAttribute('loop', true);
    else
      this.removeAttribute('loop');
    if (this._audio) this._audio.loop = value;
  }

  get crossfade() {
    return this.getAttribute('crossfade') !== null;
  }
  set crossfade(value) {
    if (value)
      this.setAttribute('crossfade', true);
    else
      this.removeAttribute('crossfade');
    if (this._audio) this._audio.crossfade = value;
  }

  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = this.template;
    this._btn = this.shadowRoot.querySelector('button');
    this._progressBar = this.shadowRoot.querySelector('#progress-bar');
    this._progressTime = this.shadowRoot.querySelector('#progress-time');

    // Bind event handlers
    this.togglePlay = this.togglePlay.bind(this);
    this._dragCallbackMove = this._dragCallbackMove.bind(this);
    this._dragCallbackEnd = this._dragCallbackEnd.bind(this);
  }

  connectedCallback() {
    this._btn.addEventListener('click', this.togglePlay);

    if (!this._initialised && this.song)
      this._init();

    this.addEventListener('mousedown', this._dragCallbackStart, { passive: true });
    this.addEventListener('touchstart', this._dragCallbackStart, { passive: true });
    window.addEventListener('mousemove', this._dragCallbackMove, { passive: false });
    window.addEventListener('touchmove', this._dragCallbackMove, { passive: false });
    window.addEventListener('mouseup', this._dragCallbackEnd, { passive: false });
    window.addEventListener('touchend', this._dragCallbackEnd, { passive: false });
  }

  disconnectedCallback() {
    if (this.playing) this.togglePlay(false);

    this._btn.removeEventListener('click', this.togglePlay);

    this.removeEventListener('mousedown', this._dragCallbackStart, { passive: true });
    this.removeEventListener('touchstart', this._dragCallbackStart, { passive: true });
    window.removeEventListener('mousemove', this._dragCallbackMove, { passive: false });
    window.removeEventListener('touchmove', this._dragCallbackMove, { passive: false });
    window.removeEventListener('mouseup', this._dragCallbackEnd, { passive: true });
    window.removeEventListener('touchend', this._dragCallbackEnd, { passive: true });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'song' && oldValue !== newValue && newValue)
      this._init();
    if (name === 'loop' && oldValue !== newValue)
      this.loop = newValue;
    if (name === 'crossfade' && oldValue !== newValue)
      this.crossfade = newValue;
  }

  async togglePlay(forcedState) {
    // Check for Boolean to reject false postives from events getting passed as argument
    const playState = forcedState instanceof Boolean ? forcedState : this._playing;
    if (this._preventClick) return;
    if (playState) {
      await this._audio.pause();
      this.playing = false;
    } else {
      this.playing = true;

      const duration = this._audio.meta.duration,
            callback = () => {
              if (window.appState.dragging !== this) {
                const currentTime = this._audio.currentTime;
                this._progressBar.style.transform = `scaleX(${currentTime / duration})`;
                this._progressTime.textContent = `${this._toMinutes(currentTime)} / ${this._durationFormatted}`;
              }
              if (this._playing) requestAnimationFrame(callback);
            };
      requestAnimationFrame(callback);

      await this._audio.play();
    }
  }

  _init() {
    if (!this._initialised && this.song) {
      this._initialised = true;
      this._audio = new SPAudioNode(this.song);
      this._audio.addEventListener('audio-paused', () => {
        this.playing = false;
      });
      this._audio.loop = this.loop;
      this._audio.crossfade = this.crossfade;
      this._setDuration();
    } else {
      console.warn(`Tried to initialise preview player when ${this.song ? 'no song is set' : 'already initialised'}!`);
    }
  }

  async _setDuration() {
    await this._audio.ready;
    this._durationFormatted = this._toMinutes(this._audio.meta.duration);
    this._progressTime.textContent = `0:00 / ${this._durationFormatted}`;
  }

  _toMinutes(input) {
    let seconds = Math.round(input);
    const minutes = Math.floor(seconds / 60);
    seconds = seconds - minutes * 60;
    if (seconds < 10) seconds = '0' + seconds;
    return `${minutes}:${seconds}`; 
  }

  _notifyAboutPlayback(state) {
    this.dispatchEvent(new CustomEvent(`player-${state ? 'play' : 'pause'}`,
      { bubbles: true, composed: true, detail: this }));
  }


  // Drag handlers

  _dragCallbackStart(e) {
    if (window.appState.dragging) return;
    const currentX = e.clientX || e.touches[0].clientX,
          currentY = e.clientY || e.touches[0].clientY;
    this._initialDragCords = { x: currentX, y: currentY };
    window.appState.dragging = this;
  }

  _dragCallbackMove(e) {
    if (!this._initialDragCords) return;
    const currentX = e.clientX || e.touches[0].clientX,
          currentY = e.clientY || e.touches[0].clientY,
          xAxis = this._initialDragCords.x - currentX,
          yAxis = this._initialDragCords.y - currentY;
    if (Math.abs(xAxis) > Math.abs(yAxis)) {
      e.preventDefault();
      this._preventClick = true;
      const percentage = xAxis/200,
            duration = this._audio.meta.duration,
            currentTime = this._audio.currentTime;
      let skipTo = /* Math.round( */currentTime - duration * percentage/* ) */;
      if (skipTo > duration) skipTo = duration;
      if (skipTo < 0) skipTo = 0;
      this._skipTo = skipTo;
      requestAnimationFrame(() => {
        this._progressBar.style.transform = `scaleX(${this._skipTo / duration})`;
        this._progressTime.textContent = `${this._toMinutes(skipTo)} / ${this._durationFormatted}`;
      });
    }
  }

  _dragCallbackEnd(e) {
    if (typeof this._skipTo === 'number') {
      e.preventDefault();
      const duration = this._audio.meta.duration,
            skipTo = this._skipTo;
      this._audio.currentTime = skipTo;
      requestAnimationFrame(() => {
        this._progressBar.style.transform = `scaleX(${skipTo / duration}`;
        this._progressTime.textContent = `${this._toMinutes(skipTo)} / ${this._durationFormatted}`;
      });
    }
    this._skipTo = this._initialDragCords = window.appState.dragging = null;
    setTimeout(() => this._preventClick = false, 10);
  }

}

customElements.define('sp-player', SPPlayer);