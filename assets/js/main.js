/* ============================================================
   NAVIGATION — scroll + mobile
   ============================================================ */
(function () {
  const nav = document.querySelector('.nav');
  const hamburger = document.querySelector('.nav__hamburger');
  const mobileMenu = document.querySelector('.nav__mobile-menu');
  const mobileClose = document.querySelector('.nav__mobile-close');

  // Scrolled state
  window.addEventListener('scroll', () => {
    nav && nav.classList.toggle('scrolled', window.scrollY > 30);
  }, { passive: true });

  // Mobile toggle
  hamburger && hamburger.addEventListener('click', () => {
    mobileMenu && mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
  });

  function closeMobile() {
    mobileMenu && mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
  }

  mobileClose && mobileClose.addEventListener('click', closeMobile);
  mobileMenu && mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobile));

  // Active link
  const path = window.location.pathname;
  document.querySelectorAll('.nav__links a, .nav__mobile-menu a').forEach(a => {
    if (a.getAttribute('href') === path || (a.getAttribute('href') !== '/' && path.startsWith(a.getAttribute('href')))) {
      a.classList.add('active');
    }
  });
})();

/* ============================================================
   FADE-UP OBSERVER
   ============================================================ */
(function () {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
})();

/* ============================================================
   SKILL BARS — animate on scroll
   ============================================================ */
(function () {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.querySelectorAll('.skill-fill').forEach(fill => fill.classList.add('animated'));
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll('.skills-grid').forEach(el => observer.observe(el));
})();

/* ============================================================
   CHART BARS — animate on scroll
   ============================================================ */
(function () {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.querySelectorAll('.chart-fill').forEach((fill, i) => {
          fill.style.animationDelay = (i * 0.15) + 's';
          fill.style.animationPlayState = 'running';
        });
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.hero__chart').forEach(el => observer.observe(el));
})();

/* ============================================================
   FILTER TABS
   ============================================================ */
(function () {
  document.querySelectorAll('.filter-tabs').forEach(tabGroup => {
    tabGroup.addEventListener('click', e => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;

      tabGroup.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.dataset.filter;
      const container = document.querySelector(tabGroup.dataset.target);
      if (!container) return;

      container.querySelectorAll('[data-category]').forEach(item => {
        const match = filter === 'all' || item.dataset.category === filter;
        item.style.display = match ? '' : 'none';
      });
    });
  });
})();

/* ============================================================
   COUNTER ANIMATION
   ============================================================ */
(function () {
  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1400;
    const start = performance.now();

    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target) + (el.dataset.suffix || '');
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(e.target);
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-target]').forEach(el => observer.observe(el));
})();

/* ============================================================
   TYPED EFFECT (hero subtitle)
   ============================================================ */
(function () {
  const el = document.querySelector('.hero__typed');
  if (!el) return;

  const words = el.dataset.words ? JSON.parse(el.dataset.words) : [];
  if (!words.length) return;

  let wi = 0, ci = 0, deleting = false;
  const SPEED_TYPE = 80, SPEED_DELETE = 40, PAUSE = 2000;

  function tick() {
    const word = words[wi];
    if (!deleting) {
      el.textContent = word.slice(0, ++ci);
      if (ci === word.length) {
        deleting = true;
        setTimeout(tick, PAUSE);
        return;
      }
    } else {
      el.textContent = word.slice(0, --ci);
      if (ci === 0) {
        deleting = false;
        wi = (wi + 1) % words.length;
      }
    }
    setTimeout(tick, deleting ? SPEED_DELETE : SPEED_TYPE);
  }
  tick();
})();
