(() => {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const script = document.currentScript;
  if (!script) return;

  const publishableKey = script.getAttribute("data-key");
  if (!publishableKey) return;

  const endpointAttr = script.getAttribute("data-endpoint");
  const endpoint =
    endpointAttr && endpointAttr.trim()
      ? endpointAttr.trim()
      : `${new URL(script.src).origin}/api/public/web-attribution/event`;

  const STORAGE_VISITOR = "hsa_visitor_id";
  const STORAGE_SOURCE = "hsa_source_token";
  const STORAGE_UTM_SOURCE = "hsa_utm_source";
  const STORAGE_UTM_MEDIUM = "hsa_utm_medium";
  const COOKIE_SOURCE = "hsa_source_token";
  const COOKIE_VISITOR = "hsa_visitor_id";
  const COOKIE_UTM_SOURCE = "hsa_utm_source";
  const COOKIE_UTM_MEDIUM = "hsa_utm_medium";

  function randomId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  }

  function getCookie(name) {
    const prefix = `${name}=`;
    const cookie = document.cookie.split(";").map((v) => v.trim()).find((v) => v.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
  }

  function setLocal(name, value) {
    try {
      localStorage.setItem(name, value);
    } catch {}
  }

  function getLocal(name) {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  }

  function getVisitorId() {
    const existing = getLocal(STORAGE_VISITOR) || getCookie(COOKIE_VISITOR);
    if (existing) return existing;
    const next = randomId();
    setLocal(STORAGE_VISITOR, next);
    setCookie(COOKIE_VISITOR, next, 365);
    return next;
  }

  function persistSource(sourceToken) {
    if (!sourceToken) return;
    setLocal(STORAGE_SOURCE, sourceToken);
    setCookie(COOKIE_SOURCE, sourceToken, 90);
  }

  function getSource() {
    return getLocal(STORAGE_SOURCE) || getCookie(COOKIE_SOURCE) || null;
  }

  function persistUtm(utmSource, utmMedium) {
    if (utmSource) {
      setLocal(STORAGE_UTM_SOURCE, utmSource);
      setCookie(COOKIE_UTM_SOURCE, utmSource, 90);
    }
    if (utmMedium) {
      setLocal(STORAGE_UTM_MEDIUM, utmMedium);
      setCookie(COOKIE_UTM_MEDIUM, utmMedium, 90);
    }
  }

  function getUtmSource() {
    return getLocal(STORAGE_UTM_SOURCE) || getCookie(COOKIE_UTM_SOURCE) || null;
  }

  function getUtmMedium() {
    return getLocal(STORAGE_UTM_MEDIUM) || getCookie(COOKIE_UTM_MEDIUM) || null;
  }

  /** Prefer stored session UTMs; fall back to current page query (first load with UTMs before storage writes). */
  function getUtmSourceForEvent() {
    const stored = getUtmSource();
    if (stored) return stored;
    try {
      const p = new URLSearchParams(window.location.search);
      return (p.get("utm_source") || "").trim() || null;
    } catch {
      return null;
    }
  }

  function getUtmMediumForEvent() {
    const stored = getUtmMedium();
    if (stored) return stored;
    try {
      const p = new URLSearchParams(window.location.search);
      return (p.get("utm_medium") || "").trim() || null;
    } catch {
      return null;
    }
  }

  const queue = [];
  let timer = null;
  let inflight = false;

  function flush() {
    if (inflight || queue.length === 0) return;
    inflight = true;
    const batch = queue.splice(0, 20);
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publishableKey,
        events: batch,
      }),
      keepalive: true,
    })
      .catch(() => {})
      .finally(() => {
        inflight = false;
        if (queue.length > 0) {
          timer = window.setTimeout(flush, 500);
        }
      });
  }

  function enqueue(eventType, metadata) {
    const event = {
      eventType,
      visitorId: getVisitorId(),
      sourceToken: getSource(),
      utmSource: getUtmSourceForEvent(),
      utmMedium: getUtmMediumForEvent(),
      pageUrl: window.location.href,
      referrer: document.referrer || null,
      occurredAt: new Date().toISOString(),
      metadata: metadata || {},
    };
    queue.push(event);
    if (!timer) {
      timer = window.setTimeout(() => {
        timer = null;
        flush();
      }, 400);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const sourceFromUrl = params.get("hsa_c");
  const utmSource = params.get("utm_source");
  const utmMedium = params.get("utm_medium");
  if (utmSource || utmMedium) {
    persistUtm((utmSource || "").trim(), (utmMedium || "").trim());
  }
  if (sourceFromUrl) {
    persistSource(sourceFromUrl.trim());
    enqueue("landing", {
      sourceFromQuery: sourceFromUrl.trim(),
      utm_source: (utmSource || "").trim() || null,
      utm_medium: (utmMedium || "").trim() || null,
    });
  } else if (utmSource) {
    enqueue("landing", {
      utm_source: utmSource.trim(),
      utm_medium: (utmMedium || "").trim() || null,
    });
  } else {
    enqueue("page_view");
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("tel:")) {
      enqueue("tel_click", { href });
    }
  });

  document.addEventListener("submit", () => {
    enqueue("form_submit");
  });

  window.addEventListener("beforeunload", flush);

  window.hcpAttribution = {
    trackBooking: function (meta) {
      enqueue("booking", meta && typeof meta === "object" && meta !== null ? meta : {});
    },
    flush: flush,
  };
})();

