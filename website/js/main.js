// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  
  if (toggle) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
      const isOpen = links.classList.contains('open');
      toggle.innerHTML = isOpen
        ? '<i data-lucide="x" style="width:24px;height:24px"></i>'
        : '<i data-lucide="menu" style="width:24px;height:24px"></i>';
      if (window.lucide) lucide.createIcons({ nodes: [toggle] });
    });
  }

  // Mobile dropdown toggle
  document.querySelectorAll('.nav-dropdown > a').forEach(a => {
    a.addEventListener('click', (e) => {
      if (window.innerWidth < 1024) {
        e.preventDefault();
        a.parentElement.classList.toggle('open');
      }
    });
  });

  // Scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.fade-up, .reveal').forEach(el => observer.observe(el));

  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Nav scroll effect
  const nav = document.querySelector('.nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }
});
