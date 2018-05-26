(function() {
  importCSS('src/css/dragndrop.css');
  
  document.body.insertAdjacentHTML('beforeend', 
  `
    <div id="dragndrop" class="hidden faded-out">
      <img src="images/dragndrop-banner.svg">
      <h2>Drop your files to upload</h2>
    </div>
  `);
  const overlay = document.querySelector('#dragndrop');
  
  const showOverlay = () => {
    overlay.classList.remove('hidden');
    doubleRAF(() => overlay.classList.remove('faded-out'));
  }
  const hideOverlay = () => {
    if (!overlay) return;
    overlay.addEventListener('transitionend',
      () => overlay.classList.add('hidden'),
      { once: true });
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
            audioTester = new Audio(),
            validFiles = Array.from(files).filter(file => {
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
        document.querySelector('sp-shell').readFiles(validFiles);
        if (document.querySelector('#circle'))
          window.dispatchEvent(new CustomEvent('files-added-alt'));
      }
    };
  }
  overlay.addEventListener('drop', dropHandler);
})();
