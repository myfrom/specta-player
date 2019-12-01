import loadCSS from 'fg-loadcss/dist/loadCSS.min.mjs';
import { doubleRAF, waitForTransition, validateFilesUploaded } from './index';

loadCSS('css/dragndrop.css');

document.body.insertAdjacentHTML('beforeend', 
`
  <div id="dragndrop" hidden class="faded-out">
    <img src="images/dragndrop-banner.svg">
    <h2>Drop your files to upload</h2>
  </div>
`);
const overlay = document.querySelector('#dragndrop');

const showOverlay = () => {
  overlay.removeAttribute('hidden');
  doubleRAF(() => overlay.classList.remove('faded-out'));
}
const hideOverlay = () => {
  if (!overlay) return;
  waitForTransition(overlay).then(() => 
    overlay.setAttribute('hidden', true));
  overlay.classList.add('faded-out');
}

const dragEnterHandler = e => {
  if (window.appState.dragging) return;
  e.preventDefault();
  e.stopPropagation();
  window.appState.dragging = 'files';
  showOverlay();
};
window.addEventListener('dragenter', dragEnterHandler);

const dragOverHandler = e => e.preventDefault();
window.addEventListener('dragover', dragOverHandler);

const dragLeaveHandler = e => {
  if(window.appState.dragging !== 'files') return;
  e.preventDefault();
  e.stopPropagation();
  window.appState.dragging = false;
  hideOverlay();
}
overlay.addEventListener('dragleave', dragLeaveHandler);

const dropHandler = e => {
  dragLeaveHandler(e);
  if (e.dataTransfer.files.length) {
    const files = e.dataTransfer.files,
          validFiles = validateFilesUploaded(files);
    if (validFiles.length) {
      if (document.querySelector('#circle'))
        window.dispatchEvent(new CustomEvent('files-added-alt'));
      window.dispatchEvent(new CustomEvent('files-added', {
        detail: { files: validFiles }
      }));
    }
  };
}
overlay.addEventListener('drop', dropHandler);