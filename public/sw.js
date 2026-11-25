/* Jobsmith service worker. Hand-written classic script: no build step, no imports.
 *
 * Testability: every decision lives in a small pure function (or a function that
 * takes its dependencies as arguments: a Cache Storage object and a fetch). The
 * file exposes them through `module.exports` when `module` exists, so unit tests
 * load it with require and exercise it with fakes. Listeners are registered only
 * when `self.addEventListener` exists, so loading it in Node does nothing.
 *
 * What it may cache, and nothing else: the shell (`/offline`), static assets
 * under /_next/static, and, in per-job caches, a saved job's player pages, the
 * prep manifest and its audio clips. It never caches the board, Home, other API
 * responses or auth routes. The client page code writes the per-job caches
 * (Save for offline); the worker only reads them and refreshes entries that
 * already exist.
 */
(function (root) {
  "use strict";

  var SHELL_PREFIX = "jobsmith-shell-";
  var PREP_PREFIX = "jobsmith-prep-";
  var OFFLINE_PATH = "/offline";

  function shellCacheName(buildId) {
    return SHELL_PREFIX + buildId;
  }

  function prepCacheName(userHash, slug) {
    return PREP_PREFIX + userHash + "-" + slug;
  }

  function isPrepCacheOf(name, userHash) {
    return typeof name === "string" && name.indexOf(PREP_PREFIX + userHash + "-") === 0;
  }

  function isShellCache(name) {
    return typeof name === "string" && name.indexOf(SHELL_PREFIX) === 0;
  }

  function isPrepCache(name) {
    return typeof name === "string" && name.indexOf(PREP_PREFIX) === 0;
  }

  function parseUrl(url) {
    if (typeof url === "string") return new URL(url, "http://localhost");
    return url;
  }

  var ASSET_RE = /^\/api\/assets\/[^/]+$/;
  var MANIFEST_RE = /^\/api\/prep\/[^/]+$/;
  var PLAYER_RE = /^\/jobs\/[^/]+\/(listen|drill|quick-fire)$/;

  // "asset" | "manifest" | "player-page" | "static" | "navigation" | "other"
  function classifyRequest(url, method, mode) {
    if (String(method).toUpperCase() !== "GET") return "other";
    var path = parseUrl(url).pathname;
    if (ASSET_RE.test(path)) return "asset";
    if (MANIFEST_RE.test(path)) return "manifest";
    // Only a document load is a player page. Next's client-side navigation
    // fetches the same path as a React Server Components payload (mode "cors");
    // storing that under the page's key would replace the saved HTML.
    if (PLAYER_RE.test(path)) return mode === "navigate" ? "player-page" : "other";
    if (path.indexOf("/_next/static/") === 0) return "static";
    if (mode === "navigate") return "navigation";
    return "other";
  }

  // Cache key of a player page: the path plus only ?doc. Query words such as q,
  // n and section never make a different page.
  function normalizePageKey(url) {
    var u = parseUrl(url);
    var doc = u.searchParams.get("doc");
    // Set through the URL setter, not searchParams.set, so a colon stays a colon
    // (doc=job:<key>), matching the exact URLs Save for offline stores.
    var key = new URL(u.pathname, "http://localhost");
    if (doc) key.search = "?doc=" + doc;
    return key.pathname + key.search;
  }

  function buildIdFromUrl(href) {
    var id = new URL(href, "http://localhost").searchParams.get("build");
    return id || "dev";
  }

  function cacheNames(cachesApi) {
    return cachesApi.keys();
  }

  function clearUserCaches(cachesApi, userHash) {
    return cacheNames(cachesApi).then(function (names) {
      var mine = names.filter(function (name) {
        return isPrepCacheOf(name, userHash);
      });
      return Promise.all(
        mine.map(function (name) {
          return cachesApi.delete(name);
        }),
      ).then(function () {
        return mine;
      });
    });
  }

  // First prep cache holding the request, with the cache it was found in.
  function findInPrepCaches(cachesApi, requestOrUrl) {
    return cacheNames(cachesApi).then(function (names) {
      var prep = names.filter(isPrepCache);
      var index = 0;
      function next() {
        if (index >= prep.length) return Promise.resolve(null);
        var name = prep[index++];
        return cachesApi.open(name).then(function (cache) {
          return cache.match(requestOrUrl).then(function (hit) {
            return hit ? { name: name, cache: cache, response: hit } : next();
          });
        });
      }
      return next();
    });
  }

  // Cache.match ignores the Range header and returns the whole body, but media
  // elements (Safari most of all) ask for ranges and need a 206 back.
  function parseRange(header, size) {
    var m = /^bytes=(\d*)-(\d*)$/.exec(header || "");
    if (!m || (m[1] === "" && m[2] === "")) return null;
    var start;
    var end;
    if (m[1] === "") {
      var suffix = Number(m[2]);
      start = Math.max(size - suffix, 0);
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start > end || start >= size) return { unsatisfiable: true };
    return { start: start, end: end };
  }

  function rangeResponse(response, rangeHeader) {
    if (!rangeHeader) return Promise.resolve(response);
    return response
      .clone()
      .arrayBuffer()
      .then(function (buf) {
        var size = buf.byteLength;
        var range = parseRange(rangeHeader, size);
        if (!range) return response;
        if (range.unsatisfiable) {
          return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
        }
        var headers = new Headers();
        var type = response.headers.get("Content-Type");
        if (type) headers.set("Content-Type", type);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Content-Range", "bytes " + range.start + "-" + range.end + "/" + size);
        headers.set("Content-Length", String(range.end - range.start + 1));
        return new Response(buf.slice(range.start, range.end + 1), { status: 206, headers: headers });
      });
  }

  function isCacheable(response) {
    return response && response.status === 200 && !response.redirected && response.type !== "opaque";
  }

  function offlineFallback(deps) {
    return deps.caches.open(shellCacheName(deps.buildId)).then(function (cache) {
      return cache.match(OFFLINE_PATH).then(function (hit) {
        return hit || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      });
    });
  }

  // Cache first across every prep cache, then the network. Never stored here:
  // clips are put in the job's cache by Save for offline.
  function handleAsset(request, deps) {
    return findInPrepCaches(deps.caches, request.url).then(function (hit) {
      if (hit) return rangeResponse(hit.response, request.headers.get("Range"));
      return deps.fetch(request);
    });
  }

  // Network first. A fresh 200 refreshes an entry only where one already
  // exists, so browsing never creates a saved copy; offline, the saved copy.
  function networkFirstSaved(request, deps, keyUrl, fallbackToOffline) {
    return deps.fetch(request).then(
      function (response) {
        if (!isCacheable(response)) return response;
        return findInPrepCaches(deps.caches, keyUrl).then(function (hit) {
          if (!hit) return response;
          return hit.cache.put(keyUrl, response.clone()).then(function () {
            return response;
          });
        });
      },
      function (error) {
        return findInPrepCaches(deps.caches, keyUrl).then(function (hit) {
          if (hit) return hit.response;
          if (fallbackToOffline) return offlineFallback(deps);
          throw error;
        });
      },
    );
  }

  function handleManifest(request, deps) {
    return networkFirstSaved(request, deps, new URL(new URL(request.url).pathname, request.url).href, false);
  }

  function handlePlayerPage(request, deps) {
    var key = normalizePageKey(request.url);
    return networkFirstSaved(request, deps, new URL(key, request.url).href, true);
  }

  function handleStatic(request, deps) {
    return deps.caches.open(shellCacheName(deps.buildId)).then(function (cache) {
      return cache.match(request.url).then(function (hit) {
        if (hit) return hit;
        return deps.fetch(request).then(function (response) {
          if (!isCacheable(response)) return response;
          return cache.put(request.url, response.clone()).then(function () {
            return response;
          });
        });
      });
    });
  }

  function handleNavigation(request, deps) {
    return deps.fetch(request).catch(function () {
      return offlineFallback(deps);
    });
  }

  // Returns a promise of a Response, or null when the worker does not handle
  // the request (the browser then goes to the network untouched).
  function route(request, deps) {
    var kind = classifyRequest(request.url, request.method, request.mode);
    switch (kind) {
      case "asset":
        return handleAsset(request, deps);
      case "manifest":
        return handleManifest(request, deps);
      case "player-page":
        return handlePlayerPage(request, deps);
      case "static":
        return handleStatic(request, deps);
      case "navigation":
        return handleNavigation(request, deps);
      default:
        return null;
    }
  }

  // Every /_next/static/... URL in a src or href attribute of a page.
  function extractStaticUrls(html) {
    var found = [];
    var re = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    var m;
    while ((m = re.exec(html))) {
      var value = (m[1] !== undefined ? m[1] : m[2] || "").replace(/&amp;/g, "&");
      if (value.indexOf("/_next/static/") === 0 && found.indexOf(value) === -1) found.push(value);
    }
    return found;
  }

  // Precaches /offline and, best effort, the script and style files that page
  // needs to start: it lists the saved jobs from Cache Storage, which takes
  // script, and no other page loads its own chunk before the network is gone.
  function onInstall(deps) {
    return deps.caches.open(shellCacheName(deps.buildId)).then(function (cache) {
      return cache
        .add(OFFLINE_PATH)
        .then(function () {
          return cache.match(OFFLINE_PATH);
        })
        .then(function (hit) {
          return hit ? hit.text() : "";
        })
        .then(function (html) {
          return Promise.all(
            extractStaticUrls(html).map(function (url) {
              return Promise.resolve()
                .then(function () {
                  return deps.fetch(url);
                })
                .then(function (response) {
                  return isCacheable(response) ? cache.put(url, response) : null;
                })
                .catch(function () {
                  return null;
                });
            }),
          );
        });
    });
  }

  function onActivate(deps) {
    var current = shellCacheName(deps.buildId);
    return deps.caches.keys().then(function (names) {
      return Promise.all(
        names
          .filter(function (name) {
            return isShellCache(name) && name !== current;
          })
          .map(function (name) {
            return deps.caches.delete(name);
          }),
      );
    });
  }

  var api = {
    classifyRequest: classifyRequest,
    normalizePageKey: normalizePageKey,
    shellCacheName: shellCacheName,
    prepCacheName: prepCacheName,
    isPrepCacheOf: isPrepCacheOf,
    clearUserCaches: clearUserCaches,
    buildIdFromUrl: buildIdFromUrl,
    parseRange: parseRange,
    rangeResponse: rangeResponse,
    route: route,
    onInstall: onInstall,
    extractStaticUrls: extractStaticUrls,
    onActivate: onActivate,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root && typeof root.addEventListener === "function") {
    var deps = {
      caches: root.caches,
      fetch: function (request) {
        return root.fetch(request);
      },
      buildId: buildIdFromUrl(root.location.href),
    };

    root.addEventListener("install", function (event) {
      event.waitUntil(
        onInstall(deps).then(function () {
          return root.skipWaiting();
        }),
      );
    });

    root.addEventListener("activate", function (event) {
      event.waitUntil(
        onActivate(deps).then(function () {
          return root.clients.claim();
        }),
      );
    });

    root.addEventListener("fetch", function (event) {
      var request = event.request;
      // Cross-origin requests are never handled.
      if (new URL(request.url).origin !== root.location.origin) return;
      var response = route(request, deps);
      if (response) event.respondWith(response);
    });

    root.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.type !== "clear-user" || typeof data.userHash !== "string") return;
      var port = event.ports && event.ports[0];
      event.waitUntil(
        clearUserCaches(root.caches, data.userHash).then(function (deleted) {
          if (port) port.postMessage({ ok: true, deleted: deleted });
        }),
      );
    });
  }
})(typeof self !== "undefined" ? self : undefined);
