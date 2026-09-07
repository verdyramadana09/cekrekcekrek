const CACHE_NAME = "cekrekcekrek-v1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
    );

    self.skipWaiting();
});


self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );

    self.clients.claim();
});


self.addEventListener("fetch", event => {

    const request = event.request;

    // Hanya cache request GET
    if (request.method !== "GET") {
        return;
    }

    /*
     * API/server jangan di-cache.
     * Photobooth tetap mengambil data terbaru dari server.
     */
    const url = new URL(request.url);

    if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/upload-") ||
        url.pathname.startsWith("/get-")
    ) {
        return;
    }

    /*
     * Untuk file aplikasi:
     * coba cache dulu, kemudian network.
     */
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {

                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request)
                    .then(response => {

                        if (
                            !response ||
                            response.status !== 200 ||
                            response.type === "opaque"
                        ) {
                            return response;
                        }

                        const responseClone = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(request, responseClone);
                            });

                        return response;
                    });
            })
    );
});
