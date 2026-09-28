/*
 * Service worker de la aplicación.
 *
 * Envuelve el service worker de Angular (ngsw-worker.js) para que NO
 * intercepte peticiones a otros orígenes ni peticiones que no sean GET:
 * las llamadas a las APIs de los LLM (POST, streaming SSE, cancelación con
 * AbortController) van siempre directas a la red, sin pasar por el SW.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    event.stopImmediatePropagation();
  }
});

importScripts('./ngsw-worker.js');
