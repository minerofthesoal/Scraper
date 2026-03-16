/* -- Cookie Consent Auto-Dismiss v0.6.6 -- */

(function() {
  "use strict";

  var CONSENT_SELECTORS = [
    "#cookie-consent",
    "#cookie-banner",
    "#cookie-notice",
    "#cookieNotice",
    "#gdpr-banner",
    "#gdpr-consent",
    "#cc-banner",
    "#consent-banner",
    "#cookie-law",
    "#cookie-popup",
    "#cookie-bar",
    "#cookie-policy",
    ".cookie-consent",
    ".cookie-banner",
    ".cookie-notice",
    ".cookieNotice",
    ".gdpr-banner",
    ".gdpr-consent",
    ".cc-banner",
    ".consent-banner",
    ".cookie-law",
    ".cookie-popup",
    ".cookie-bar",
    ".cookie-policy",
    "[class*='cookie-consent']",
    "[class*='cookie-banner']",
    "[class*='cookieConsent']",
    "[class*='cookieBanner']",
    "[id*='cookie-consent']",
    "[id*='cookie-banner']",
    "[id*='cookieConsent']",
    "[id*='cookieBanner']",
    "[class*='gdpr']",
    "[class*='consent']",
    "[aria-label*='cookie']",
    "[aria-label*='consent']"
  ];

  // Selectors for popular consent management frameworks
  var FRAMEWORK_SELECTORS = [
    // CookieBot
    "#CybotCookiebotDialog",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept",
    // OneTrust
    "#onetrust-banner-sdk",
    "#onetrust-accept-btn-handler",
    ".onetrust-close-btn-handler",
    // TrustArc
    "#truste-consent-track",
    "#truste-consent-button",
    ".trustarc-agree-btn",
    // Quantcast
    ".qc-cmp-showing",
    ".qc-cmp-button",
    "[class*='qc-cmp']",
    // Didomi
    "#didomi-popup",
    "#didomi-notice",
    "#didomi-notice-agree-button",
    ".didomi-popup-notice",
    // Complianz
    "#cmplz-cookiebanner-container",
    ".cmplz-accept",
    // Cookie Script
    "#cookiescript_injected",
    "#cookiescript_accept"
  ];

  var ACCEPT_BUTTON_TEXT = [
    "accept all",
    "accept cookies",
    "accept",
    "allow all",
    "allow cookies",
    "allow",
    "i agree",
    "agree",
    "got it",
    "ok",
    "okay",
    "consent",
    "continue",
    "dismiss",
    "close",
    "yes"
  ];

  var ACCEPT_BUTTON_SELECTORS = [
    "[class*='accept']",
    "[class*='agree']",
    "[class*='allow']",
    "[class*='consent']",
    "[class*='dismiss']",
    "[id*='accept']",
    "[id*='agree']",
    "[id*='allow']",
    "[data-action='accept']",
    "[data-consent='accept']"
  ];

  var WATCH_TIMEOUT = 10000;
  var observer = null;
  var stopped = false;

  function findConsentBanner() {
    var allSelectors = CONSENT_SELECTORS.concat(FRAMEWORK_SELECTORS);

    for (var i = 0; i < allSelectors.length; i++) {
      try {
        var el = document.querySelector(allSelectors[i]);
        if (el && isVisible(el)) {
          return el;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    var style = window.getComputedStyle(el);
    return style.display !== "none" &&
           style.visibility !== "hidden" &&
           style.opacity !== "0" &&
           el.offsetWidth > 0 &&
           el.offsetHeight > 0;
  }

  function findAcceptButton(banner) {
    // First try framework-specific accept buttons
    var frameworkButtons = [
      "#CybotCookiebotDialogBodyLevelOptinAllowAll",
      "#CybotCookiebotDialogBodyButtonAccept",
      "#onetrust-accept-btn-handler",
      "#truste-consent-button",
      ".trustarc-agree-btn",
      "#didomi-notice-agree-button",
      ".cmplz-accept",
      "#cookiescript_accept"
    ];

    for (var i = 0; i < frameworkButtons.length; i++) {
      try {
        var btn = document.querySelector(frameworkButtons[i]);
        if (btn && isVisible(btn)) {
          return btn;
        }
      } catch (e) {
        // Skip
      }
    }

    // Search within the banner for accept-like buttons
    var candidates = banner.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']");

    // Score and pick the best match
    var bestButton = null;
    var bestScore = 0;

    for (var j = 0; j < candidates.length; j++) {
      var candidate = candidates[j];
      if (!isVisible(candidate)) continue;

      var score = scoreButton(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestButton = candidate;
      }
    }

    // Also try buttons matching accept-related selectors within the banner
    if (!bestButton) {
      for (var k = 0; k < ACCEPT_BUTTON_SELECTORS.length; k++) {
        try {
          var found = banner.querySelector(ACCEPT_BUTTON_SELECTORS[k]);
          if (found && isVisible(found)) {
            return found;
          }
        } catch (e) {
          // Skip
        }
      }
    }

    return bestButton;
  }

  function scoreButton(el) {
    var text = (el.textContent || el.value || "").trim().toLowerCase();
    var score = 0;

    for (var i = 0; i < ACCEPT_BUTTON_TEXT.length; i++) {
      if (text === ACCEPT_BUTTON_TEXT[i]) {
        // Exact match — prefer "accept all" and "accept" over generic "ok"
        score += (i < 6) ? 10 : 5;
        break;
      }
      if (text.indexOf(ACCEPT_BUTTON_TEXT[i]) !== -1) {
        score += (i < 6) ? 7 : 3;
      }
    }

    // Boost if the element has accept/agree related attributes
    var cls = (el.className || "").toLowerCase();
    var id = (el.id || "").toLowerCase();

    if (/accept|agree|allow|consent/.test(cls) || /accept|agree|allow|consent/.test(id)) {
      score += 4;
    }

    // Slight penalty for "reject" or "decline" or "settings" or "manage"
    if (/reject|decline|settings|manage|preferences|customize|more info/i.test(text)) {
      score = 0;
    }

    return score;
  }

  function dismissBanner() {
    var banner = findConsentBanner();
    if (!banner) {
      return { dismissed: false, reason: "no_banner_found" };
    }

    var button = findAcceptButton(banner);
    if (button) {
      button.click();
      return { dismissed: true, method: "button_click", buttonText: (button.textContent || "").trim() };
    }

    // Fallback: try to hide the banner directly
    banner.style.display = "none";
    // Also remove any overlay/backdrop
    var overlays = document.querySelectorAll("[class*='overlay'], [class*='backdrop'], [class*='mask']");
    for (var i = 0; i < overlays.length; i++) {
      var ov = overlays[i];
      var style = window.getComputedStyle(ov);
      if (style.position === "fixed" || style.position === "absolute") {
        ov.style.display = "none";
      }
    }
    // Restore body scroll
    document.body.style.overflow = "";

    return { dismissed: true, method: "hide_banner" };
  }

  function startObserver() {
    if (observer || stopped) return;

    observer = new MutationObserver(function(mutations) {
      if (stopped) return;

      var dominated = false;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
          dominated = true;
          break;
        }
      }

      if (dominated) {
        var banner = findConsentBanner();
        if (banner) {
          var result = dismissBanner();
          reportResult(result);
          stopObserver();
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    // Auto-stop after timeout
    setTimeout(function() {
      stopObserver();
    }, WATCH_TIMEOUT);
  }

  function stopObserver() {
    stopped = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function reportResult(result) {
    try {
      browser.runtime.sendMessage({
        type: "COOKIE_DISMISS_RESULT",
        url: window.location.href,
        result: result
      });
    } catch (e) {
      // Extension context may be invalidated
    }
  }

  function run() {
    // Try immediately in case the banner is already in the DOM
    var result = dismissBanner();
    if (result.dismissed) {
      reportResult(result);
      return;
    }

    // Wait for DOM ready if not yet loaded, then try again
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function() {
        var retryResult = dismissBanner();
        if (retryResult.dismissed) {
          reportResult(retryResult);
        } else {
          startObserver();
        }
      });
    } else {
      // DOM is loaded but no banner found yet — watch for dynamic insertion
      startObserver();
    }
  }

  function init() {
    // Check if the feature is enabled in storage
    browser.storage.local.get("cookieDismissEnabled").then(function(data) {
      if (data.cookieDismissEnabled) {
        run();
      }
    }).catch(function() {
      // Storage access failed — feature stays disabled
    });

    // Listen for on-demand dismiss message from background
    browser.runtime.onMessage.addListener(function(message) {
      if (message && message.type === "DISMISS_COOKIES") {
        stopped = false;
        var result = dismissBanner();
        if (result.dismissed) {
          reportResult(result);
        } else {
          // Start watching briefly for a dynamic banner
          startObserver();
        }
      }
    });
  }

  init();

})();
