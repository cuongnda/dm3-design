/**
 * Duall Master 3.0 - Cookie Consent & Analytics Loader
 * GDPR-compliant consent banner
 */
(function() {
  'use strict';
  
  var consent = localStorage.getItem('dm3-cookie-consent');
  
  // Load analytics if already consented
  if (consent === 'accepted') {
    loadAnalytics();
    return;
  }
  
  // Don't show banner if already declined
  if (consent === 'declined') return;
  
  // Create banner
  var banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.innerHTML = 
    '<div style="max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">' +
      '<p style="margin:0;flex:1;min-width:200px;">We use cookies and analytics to improve your experience. ' +
      '<a href="/en/contact/" style="color:#3B82F6;text-decoration:underline;">Learn more</a></p>' +
      '<div style="display:flex;gap:0.5rem;">' +
        '<button id="cookie-decline" style="padding:0.5rem 1.25rem;border:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;">Decline</button>' +
        '<button id="cookie-accept" style="padding:0.5rem 1.25rem;border:none;background:#3B82F6;color:#fff;border-radius:6px;cursor:pointer;font-size:0.875rem;font-weight:500;">Accept</button>' +
      '</div>' +
    '</div>';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:rgba(15,23,42,0.95);backdrop-filter:blur(10px);color:#e2e8f0;padding:1rem 1.5rem;z-index:10000;font-size:0.875rem;border-top:1px solid rgba(255,255,255,0.1);';
  
  document.body.appendChild(banner);
  
  document.getElementById('cookie-accept').addEventListener('click', function() {
    localStorage.setItem('dm3-cookie-consent', 'accepted');
    banner.remove();
    loadAnalytics();
  });
  
  document.getElementById('cookie-decline').addEventListener('click', function() {
    localStorage.setItem('dm3-cookie-consent', 'declined');
    banner.remove();
  });
  
  function loadAnalytics() {
    // Load GTM
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
    var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
    j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
    f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-XXXXXXX');
    
    // Load Clarity
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "CLARITY_PROJECT_ID");
  }
})();
