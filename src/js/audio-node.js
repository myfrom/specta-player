import { serviceWorker, waitMs } from './index';

const CROSSFADE_DURATION = 2;

/** @type {AudioContext} */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

/** 
 * Responsible for getting and controlling the playback of a song
 * from local database
 * @class
 * @extends EventTarget
 */
export default class SPAudioNode extends EventTarget {

  constructor(filename) {
    super();
    // Clear start any values
    this.meta = null;
    this._sourceNode = null;
    this._gainNode = null;
    this._playing = false;
    this._loop = false;
    this._crossfade = false;
    this._unusable = false;
    this._startTimestamp = null;
    this._pauseTime = 0;
    this._audioBuffer = null;

    this.ready = new Promise(async (resolve, reject) => {
      try {
        // Get metadata from service worker
        /* const sw = await serviceWorker; */
        this.meta = await /* sw */serviceWorker.messageSW({ type: 'FILE_METADATA_REQUEST', payload: filename })
        if (this.meta.error) {
          const err = this.meta.error === 'NOT-FOUND' ?
            new Error(`Tried to init SPAudioNode with undefined song ${filename}`) :
            this.meta.error;
          throw err;
        }
        this.meta.filename = filename;

        // Prepare audio buffer
        this._getAudioBuffer(filename);
        // Create Gain node for volume
        this._gainNode = audioCtx.createGain();
        this._gainNode.connect(audioCtx.destination);
        resolve();
      } catch (err) {
        console.error(err);
        reject(err);
        this.meta = null;
        this._unusable = true;
      }
    });
  }

  async play(startTime = this._pauseTime) {
    await this.ready;
    if (this._unusable) return false;
    if (this._playing) return;
    this._hitPause = false;
    this._sourceNode = audioCtx.createBufferSource();
    this._sourceNode.buffer = await this._getAudioBuffer();
    // Set attributes if needed
    this._sourceNode.loop = this.loop;
    // React to song end
    this._sourceNode.addEventListener('ended', () => {
      if (this._plannedReset) {
        this._plannedReset = false;
        return;
      }
      if (this._loop) return;
      // If song ended, not was paused, set pauseTime to max duration
      if (!this._hitPause) this._pauseTime = this.meta.duration;
      this._playing = false;
      this.dispatchEvent(new CustomEvent('audio-paused'));
      this._sourceNode.disconnect();
    });
    // Connect to output
    this._sourceNode.connect(this._gainNode);
    // Hit play
    if (this._crossfade) {
      this._gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      this._gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + CROSSFADE_DURATION);
    } else {
      this._gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    }
    // Play with offset (start time) set or if out-of-bounds, start from beginning
    const computedOffset = startTime < this.meta.duration ? startTime : 0;
    this._pauseTime = computedOffset;
    this._sourceNode.start(0, computedOffset);
    this._startTimestamp = audioCtx.currentTime;
    this._playing = true;
    if (this._crossfade)
      await waitMs(CROSSFADE_DURATION * 1000);
  }

  async pause() {
    await this.ready;
    if (this._unusable) return false;
    if (!this._playing) return;
    this._hitPause = true;
    if (this._crossfade) {
      this._gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
      this._gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + CROSSFADE_DURATION);
    } else {
      this._gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    }
    if (this._crossfade)
      await waitMs(CROSSFADE_DURATION * 1000);
    this._sourceNode.stop(0);
    this._pauseTime =
      audioCtx.currentTime - this._startTimestamp + this._pauseTime;
    this._playing = false;
    this.dispatchEvent(new CustomEvent('audio-paused'));
    this._sourceNode.disconnect();
  }

  set loop(val) {
    this._loop = Boolean(val);
    this.ready.then(() => {
      if (this._sourceNode) this._sourceNode.loop = val;
    });
  }
  get loop() {
    if (this._unusable) return false;
    return this._loop;
  }

  set crossfade(val) {
    this._crossfade = val;
  }
  get crossfade() {
    if (this._unusable) return false;
    return this._crossfade;
  }

  get currentTime() {
    if (this._unusable) return 0;
    const playingTimestamp = audioCtx.currentTime - this._startTimestamp + this._pauseTime;
    if (this._playing && this.meta && playingTimestamp > this.meta.duration)
      this._startTimestamp += this.meta.duration;
    if (this._startTimestamp === null)
      return 0;
    else if (!this._playing)
      return this._pauseTime;
    else
      return playingTimestamp;
  }
  set currentTime(value) {
    value = Number(value);
    if (value < 0) value = 0;
    if (this.meta && value > this.meta.duration) value = this.meta.duration;
    if (this._unusable || isNaN(value)) return;
    if (this._playing) {
      const crossfadeState = this.crossfade;
      this.crossfade = false;
      this._plannedReset = true;
      this._sourceNode.stop(0);
      this._sourceNode.disconnect();
      this._playing = false;
      this.play(value).then(() => this.crossfade = crossfadeState);
      this._pauseTime = value;
    } else {
      this._pauseTime = value;
    }
  }

  async _getAudioBuffer(filename = this.meta.filename) {
    if (!this._audioBuffer) {
      if (window?.appState?.audioBuffers?.[filename]) {
        this._audioBuffer = window.appState.audioBuffers[filename];
      } else {
        const rawBuffer = await /* sw */serviceWorker.messageSW({ type: 'FILE_CONTENT_REQUEST', payload: filename });
        if (rawBuffer.error)
          throw rawBuffer.error;
        const processedBuffer = await audioCtx.decodeAudioData(rawBuffer);
        if (window?.appState?.audioBuffers)
          window.appState.audioBuffers[filename] = processedBuffer;
        this._audioBuffer = processedBuffer;
      }
    }
    return this._audioBuffer;
  }
}