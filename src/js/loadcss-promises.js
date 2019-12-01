import { default as originalLoadCSS } from 'fg-loadcss/dist/loadCSS.min.mjs';
import { default as originalOnloadCSS } from 'fg-loadcss/dist/onloadCSS.min.mjs';

function onloadCSS(ss) {
  return new Promise((resolve, reject) => {
    try {
      if (ss?.sheet?.cssRules.length)
        // Checks if the sheet already exists
        return resolve();
      originalOnloadCSS(ss, resolve);
    } catch (err) {
      reject(err);
    }
  });
}

function loadCSS(href, options) {
  return onloadCSS(originalLoadCSS(href, options));
}

export default loadCSS;
export { loadCSS, onloadCSS };
