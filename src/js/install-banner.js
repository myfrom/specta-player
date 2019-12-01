import { waitForTransition, NO_MOTION_MEDIA_QUERY, doubleRAF } from './index';

// For editor syntax highlighting
const html = String.raw;

class InstallBanner extends HTMLElement {

  get template() {
    return html`
      <style>
        :host([opened]) {
          display: flex;
        }
        :host {
          display: none;
          background-color: white;
          padding: 12px 16px 14px 8px;
          box-shadow: 
            0 12px 17px 2px rgba(0,0,0,0.042),
            0 5px 22px 4px rgba(0,0,0,0.036),
            0 7px 8px 0 rgba(0,0,0,0.06);
            border-radius: 2px;
          background: url(../images/a2hs-banner-background.jpg);
          background-position: center;
          background-size: cover;
          flex-direction: row;
          align-items: center;
          justify-content: stretch;
          font-size: 14px;
          height: 68px;
          transition: all 160ms ease-in-out;
        }
        #close-btn {
          --icon-size: 22px;
          color: var(--main-text-color);
          width: 42px;
          height: 42px;
          margin-right: 12px;
          opacity: var(--secondary-opacity);
          border-radius: 50%;
          border: 2px solid var(--secondary-text-color);
        }
        span {
          flex-grow: 1;
          flex-shrink: 1;
          width: 0px;
          font-size: 15px;
          color: var(--main-text-color);
        }
        #install-btn {
          margin: 0 0 0 12px;
          color: white;
          font-weight: 500 !important;
          background: none;
          color: var(--accent-color);
          border: 2px solid var(--accent-color);
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          font-family: Roboto, sans-serif;
          font-weight: 500;
          font-size: 14px;
          height: 36px;
          padding: 0 8px;
          text-transform: uppercase;
          outline: none;
          overflow: hidden;
          position: relative;
          min-width: 72px;
        }
        i.icon::before {
          font-family: "sp-icons";
          font-style: normal;
          font-weight: normal;
          display: inline-block;
          text-decoration: inherit;
          font-variant: normal;
          text-transform: none;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          width: var(--icon-size, 24px);
          height: var(--icon-size, 24px);
          font-size: var(--icon-size, 24px);
          line-height: var(--icon-size, 24px);
        }
        .i-clear:before { content: '\e803'; }
        button.icon-button {
          width: 40px;
          height: 40px;
          padding: 8px;
          font-weight: normal;
          border-radius: 50%;
          position: relative;
          background: none;
          border: none;
          outline: none !important;
        }
        button.icon-button::before,
        button.material-button::before {
          content: "";
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
        button.material-button::before {
          border-radius: 2px;
        }
        button.icon-button:focus::before,
        button.icon-button:hover::before,
        button.material-button:focus::before,
        button.material-button:hover::before {
          opacity: 0.75;
          transition-timing-function: ease-out;
        }
        button.icon-button:active::before,
        button.material-button:active::before {
          opacity: 1;
        }
        button.icon-button i {
          width: 100%;
          height: 100%;
        }
      </style>
      <button id="close-btn" class="icon-button"><i class="icon i-clear"></i></button>
      <span>Add Specta Player to your apps, without downloading anything</span>
      <button id="install-btn" class="material-button">Add</button>
    `;
  }

  get opened() {
    return this.getAttribute('opened') !== null;
  }
  set opened(value) {
    if (value)
      this.setAttribute('opened', true);
    else
      this.removeAttribute('opened');
  }

  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = this.template;

    // Bind event handlers
    this._closeBtnHandler = this._closeBtnHandler.bind(this);
    this._promptInstall = this._promptInstall.bind(this);
    this._remove = this._remove.bind(this);
  }
  
  connectedCallback() {
    this.shadowRoot.querySelector('#close-btn')
      .addEventListener('click', this._closeBtnHandler);

    this.shadowRoot.querySelector('#install-btn')
      .addEventListener('click', this._promptInstall);

    window.addEventListener('delete-a2hs-ui', this._remove);
  }

  disconnectedCallback() {
    this.shadowRoot.querySelector('#close-btn')
      .removeEventListener('click', this._closeBtnHandler);

    this.shadowRoot.querySelector('#install-btn')
      .removeEventListener('click', this._promptInstall);

    window.removeEventListener('delete-a2hs-ui', this._remove);
  }

  async open() {
    console.log('Opening')
    if (!this.installPromptEvent) return;
    if (!NO_MOTION_MEDIA_QUERY()) {
      await new Promise(r => requestAnimationFrame(async () => {
        this.style.transitionTimingFunction = 'cubic-bezier(0.215, 0.61, 0.355, 1)';
        this.style.transform = 'translateY(100%)';
        this.style.opacity = 0;
        this.opened = true;
        doubleRAF(() => {
          this.style.transform = '';
          this.style.opacity = 1;
        });
        await waitForTransition(this);
        this.style.transitionTimingFunction = '';
      }));
    } else {
      this.opened = true;
    }
    this.dispatchEvent(new CustomEvent('banner-opened'), { bubbles: true, composed: true });
  }

  async close() {
    if (!this.opened) return;
    if (!NO_MOTION_MEDIA_QUERY()) {
      await new Promise(r => requestAnimationFrame(async () => {
        this.style.transitionTimingFunction = 'cubic-bezier(0.55, 0.055, 0.675, 0.19)';
        this.style.transform = '';
        this.style.opacity = 1;
        doubleRAF(() => {
          this.style.transform = 'translateY(100%)';
          this.style.opacity = 0;
        });
        await waitForTransition(this);
        this.style.transitionTimingFunction = '';
      }));
    }
    this.opened = false;
    this.dispatchEvent(new CustomEvent('banner-closed'), { bubbles: true, composed: true });
  }

  _closeBtnHandler() {
    window.sessionStorage.installBannerDismissed = 
      (Number(window.sessionStorage.installBannerDismissed) || 0) + 1;
    window.localStorage.installBannerDismissed = 
      (Number(window.localStorage.installBannerDismissed) || 0) + 1;
    return this.close();
  }

  _promptInstall() {
    if (!this.installPromptEvent) this.close();
    this.installPromptEvent.userChoice.then(choice => {
      if (choice.outcome === 'accepted') {
        gtag('event', 'installed-pwa', {
          'event_category': 'add-to-homescreen',
          'event_label': 'User has added PWA to their home screen'
        });
      } else {
        gtag('event', 'install-rejected', {
          'event_category': 'add-to-homescreen',
          'event_label': 'User has rejected add to homescreen prompt'
        });
      }
      window.dispatchEvent(new CustomEvent('delete-a2hs-ui'), { bubbles: true, composed: true });
    });

    this.installPromptEvent.prompt();
  }
  
  async _remove() {
    await this.close();
    this.remove();
  }

}

customElements.define('sp-install-banner', InstallBanner);
