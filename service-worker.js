const SW_VERSION = '3.0.0';

importScripts('https://storage.googleapis.com/workbox-cdn/releases/4.3.1/workbox-sw.js');
importScripts('https://unpkg.com/localforage@1.7.3/dist/localforage.min.js');

workbox.core.setCacheNameDetails({
  prefix: 'specta-player',
  suffix: SW_VERSION
});

// Will be filled by SW builder
workbox.precaching.precacheAndRoute([
  {
    "url": "css/circle.css",
    "revision": "0a86975f8323bd84000ed081968de360"
  },
  {
    "url": "css/console.css",
    "revision": "23ed617a0de16156fa1bb672561cbdce"
  },
  {
    "url": "css/dragndrop.css",
    "revision": "b99853523a3d2177d36aab301ee3b174"
  },
  {
    "url": "css/editor.css",
    "revision": "fee9f3d43bf9f2c4aab20aba4c64abf3"
  },
  {
    "url": "css/icons.css",
    "revision": "a8a8fd3141d1b3bf2598f6cb1f3f08ff"
  },
  {
    "url": "css/index.css",
    "revision": "8ee896ab91438db2ca260ed2363383ba"
  },
  {
    "url": "css/noscript.css",
    "revision": "a8c1c8f55326c6108d205b5d655c943d"
  },
  {
    "url": "favicon.ico",
    "revision": "bd82847749fe6336fcda1889620b7529"
  },
  {
    "url": "fonts/sp-icons.eot",
    "revision": "1c8fd642d5d7b6e1ac1b5b0788dfca88"
  },
  {
    "url": "fonts/sp-icons.svg",
    "revision": "eaf0c6649a271e9eb9b509cd7a3e0481"
  },
  {
    "url": "fonts/sp-icons.ttf",
    "revision": "abd5d01b3a7e405a1924db672632f207"
  },
  {
    "url": "fonts/sp-icons.woff",
    "revision": "baee4438b91ad53bc07dc5c56c7271d8"
  },
  {
    "url": "fonts/sp-icons.woff2",
    "revision": "c5c5f8fcef667cf3b841db143e8d8f15"
  },
  {
    "url": "images/a2hs-banner-background-dark.jpg",
    "revision": "da5738099586f82c1552f97dbf9c5cd6"
  },
  {
    "url": "images/a2hs-banner-background.jpg",
    "revision": "179c9688e7c745c1b5d288880943edff"
  },
  {
    "url": "images/banner.png",
    "revision": "dbbc27acc474ad50a4e2aeac56a33cf3"
  },
  {
    "url": "images/dragndrop-banner.svg",
    "revision": "4d25008c66d7a903ec2ec44ae55f3799"
  },
  {
    "url": "images/icons/144.png",
    "revision": "991adc2115ce920603702bc9e0f4bc5f"
  },
  {
    "url": "images/icons/192.png",
    "revision": "991adc2115ce920603702bc9e0f4bc5f"
  },
  {
    "url": "images/icons/432.png",
    "revision": "991adc2115ce920603702bc9e0f4bc5f"
  },
  {
    "url": "images/icons/48.png",
    "revision": "991adc2115ce920603702bc9e0f4bc5f"
  },
  {
    "url": "images/icons/svg.svg",
    "revision": "984800eecbaf1078b96f03b01c69bbcd"
  },
  {
    "url": "index.html",
    "revision": "c0496ecabb32da460d5bfa5c2078086a"
  },
  {
    "url": "js/index.js",
    "revision": "6edc01109b6408fdfa5124b02277d024"
  },
  {
    "url": "manifest.json",
    "revision": "0eb72734bd8d4fa1a204c457a17cdf59"
  }
], {
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