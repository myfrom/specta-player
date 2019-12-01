const SW_VERSION = '3.0.0';

importScripts('https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js');
importScripts('https://unpkg.com/localforage@1.7.3/dist/localforage.min.js');

workbox.core.setCacheNameDetails({
  prefix: 'specta-player',
  suffix: SW_VERSION
});

// Will be filled by SW builder
workbox.precaching.precacheAndRoute([], {
  cleanUrls: true
});

workbox.googleAnalytics.initialize();

// Those third party resources are unmutable
workbox.routing.registerRoute(
  /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
  new workbox.strategies.CacheFirst({
    cacheName: 'static-cache',
    plugins: [
      new workbox.cacheableResponse.Plugin({
        statuses: [0, 200]
      }),
      new workbox.expiration.Plugin({
        maxAgeSeconds: 60 * 60 * 24 * 60 // 2 Months
      })
    ]
  })
);
workbox.precaching.precache([
  'https://fonts.googleapis.com/css?family=Montserrat:600|Roboto:400,500&display=swap'
]);


workbox.core.clientsClaim();

// File handling logic
self.addEventListener('message', async e => {
  switch (e.data.type) {

    case 'REQUEST_UPDATE': {
      console.log('Service Worker: Received skip waiting call from client')
      self.skipWaiting();
    }

    case 'FILE_METADATA_REQUEST': {
      try {
        const name = e.data.payload,
              data = await localforage.getItem(`audioMeta/${name}`);
        if (!data) respondMsgWithError(e.ports[0], `NOT-FOUND`);
        e.ports[0].postMessage(data);
      } catch (err) {
        respondMsgWithError(e.ports[0], 'Failed retriving audio metadata', err);
      }
      break;
    }

    case 'FILE_CONTENT_REQUEST': {
      try {
        const name = e.data.payload,
              buffer = await localforage.getItem(`audio/${name}`);
        if (!buffer) respondMsgWithError(e.ports[0], `NOT-FOUND`);
        e.ports[0].postMessage(buffer, [buffer]);
      } catch (err) {
        respondMsgWithError(e.ports[0], 'Failed retriving audio file', err);
      }
      break;
    }

    case 'SAVE_FILE': {
      try {
        const { buffer, meta } = e.data.payload;
        await Promise.all([
          localforage.setItem(`audioMeta/${meta.name}`, { type: meta.type, duration: meta.duration }),
          localforage.setItem(`audio/${meta.name}`, buffer)
        ]);
        e.ports[0].postMessage(true);
      } catch (err) {
        respondMsgWithError(e.ports[0], 'Failed saving audio file', err);
      }
      break;
    }

    case 'DELETE_FILE': {
      const name = e.data.payload,
            awaiting = [];
      let rejectedDelete = false;
      (await self.clients.matchAll({ type: 'window' })).forEach(client => {
        awaiting.push(new Promise(resolve => {
          const timeout = setTimeout(() => {
            console.warn(`Client ${client.id} file-delete check timed out!`);
            resolve();
          }, 2000),
                messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = e => {
            clearTimeout(timeout);
            // Some clinets are sill using this file
            if (e.data) {
              rejectedDelete = true;
              console.log(`Client ${client.id} rejected deleting file ${name}`);
            }
            resolve();
          };
          client.postMessage({ type: 'CHECK_IF_FILE_USED', payload: name, port: messageChannel.port2 }, [ messageChannel.port2 ]);
        }));
      });
      await Promise.all(awaiting);
      if (rejectedDelete)
        return e.ports[0].postMessage(false);
      try {
        await Promise.all([
          localforage.removeItem(`audioMeta/${name}`),
          localforage.removeItem(`audio/${name}`)
        ]);
        e.ports[0].postMessage(true);
      } catch (err) {
        respondMsgWithError(e.ports[0], 'Failed deleting audio', err);
      }
      break;
    }

    case 'READ_CONFIG': {
      e.ports[0].postMessage(await localforage.getItem('config'));
      break;
    }
    
    case 'SAVE_CONFIG': {
      try {
        let config = e.data.payload;
        if (config instanceof Array && config.length)
          await localforage.setItem('config', config);
        else
          await localforage.removeItem('config');
        e.ports[0].postMessage(true);
      } catch (err) {
        respondMsgWithError(e.ports[0], 'Failed saving config', err);
      }
      break;
    }

  }
});

function respondMsgWithError(port, errorMsg, details) {
  port.postMessage({ type: 'ERROR', error: errorMsg, payload: details });
}