/**
 * Duall Master 3.0 - Analytics & Event Tracking
 * Pushes custom events to GTM dataLayer
 * Only runs after cookie consent is granted
 */
(function() {
  'use strict';
  
  // Check cookie consent before tracking
  if (localStorage.getItem('dm3-cookie-consent') !== 'accepted') return;

  window.dataLayer = window.dataLayer || [];

  // Track CTA clicks
  document.querySelectorAll('a[href*="demo"], .btn-primary, .cta-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dataLayer.push({ event: 'cta_click', cta_text: btn.textContent.trim(), page: location.pathname });
    });
  });

  // Track language switches
  document.querySelectorAll('.lang-switcher a, .lang-option').forEach(link => {
    link.addEventListener('click', () => {
      dataLayer.push({ event: 'language_switch', target_lang: link.href.match(/\/(en|ko|vi)\//)?.[1] });
    });
  });

  // Track scroll depth (25%, 50%, 75%, 100%)
  let scrollMarks = { 25: false, 50: false, 75: false, 100: false };
  window.addEventListener('scroll', () => {
    let pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
    [25, 50, 75, 100].forEach(mark => {
      if (pct >= mark && !scrollMarks[mark]) {
        scrollMarks[mark] = true;
        dataLayer.push({ event: 'scroll_depth', depth: mark, page: location.pathname });
      }
    });
  }, { passive: true });

  // Track form submissions
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', () => {
      dataLayer.push({ event: 'form_submit', form_id: form.id || 'unknown', page: location.pathname });
    });
  });

  // Track case study filter clicks
  document.querySelectorAll('.filter-btn, [data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      dataLayer.push({ event: 'case_study_filter', filter: btn.textContent.trim() });
    });
  });

  // Track time on page
  let startTime = Date.now();
  window.addEventListener('beforeunload', () => {
    let seconds = Math.round((Date.now() - startTime) / 1000);
    dataLayer.push({ event: 'page_exit', time_seconds: seconds, page: location.pathname });
  });
})();
