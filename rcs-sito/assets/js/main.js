// ===================================================================
// RCS S.r.l. — shared interactivity
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initScrollReveal();
  initHeroSlideshow();
  initNavShadow();
  initRegistrationForm();
});

/* ---------- Mobile menu ---------- */
function initMobileMenu() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.mobile-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggle.textContent = isOpen ? '✕' : '☰';
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      toggle.textContent = '☰';
      document.body.style.overflow = '';
    });
  });
}

/* ---------- Scroll reveal ---------- */
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('in-view'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
  );

  items.forEach((el) => observer.observe(el));
}

/* ---------- Hero background slideshow ---------- */
function initHeroSlideshow() {
  const container = document.querySelector('[data-hero-slides]');
  if (!container) return;

  const slides = Array.from(container.querySelectorAll('.hero-slide'));
  const dotsWrap = document.querySelector('[data-hero-dots]');
  const heroContent = document.querySelector('.hero-content');

  function applyTextTheme(slide) {
    heroContent && heroContent.classList.toggle('on-light', slide.dataset.textTheme === 'light');
  }

  if (slides.length <= 1) {
    slides[0] && applyTextTheme(slides[0]);
    return;
  }

  let current = 0;
  let timer;

  const dots = slides.map((_, i) => {
    if (!dotsWrap) return null;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `Vai alla slide ${i + 1}`);
    if (i === 0) b.classList.add('active');
    b.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(b);
    return b;
  });

  function goTo(index) {
    slides[current].classList.remove('active');
    dots[current] && dots[current].classList.remove('active');
    current = index;
    slides[current].classList.add('active');
    dots[current] && dots[current].classList.add('active');
    applyTextTheme(slides[current]);
    restart();
  }

  function next() { goTo((current + 1) % slides.length); }

  function restart() {
    clearInterval(timer);
    timer = setInterval(next, 5500);
  }

  slides[0].classList.add('active');
  applyTextTheme(slides[0]);
  restart();
}

/* ---------- Sticky nav shadow on scroll ---------- */
function initNavShadow() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const onScroll = () => {
    if (window.scrollY > 12) {
      nav.style.boxShadow = '0 10px 30px -18px rgba(0,0,0,.7)';
    } else {
      nav.style.boxShadow = 'none';
    }
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------- Accordion: only one open at a time within a group ---------- */
document.addEventListener('toggle', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLDetailsElement)) return;
  if (!target.hasAttribute('data-accordion-group')) return;
  if (!target.open) return;
  const group = target.getAttribute('data-accordion-group');
  document.querySelectorAll(`details[data-accordion-group="${group}"]`).forEach((el) => {
    if (el !== target) el.open = false;
  });
}, true);

/* ---------- Registration / contact form ---------- */
function initRegistrationForm() {
  const form = document.querySelector('#registration-form');
  if (!form) return;

  const success = document.querySelector('#form-success');
  const submitBtn = document.querySelector('#form-submit-btn');
  const submitError = document.querySelector('#form-submit-error');

  function showSubmitError(message) {
    if (!submitError) return;
    submitError.textContent = message;
    submitError.classList.add('show');
    submitError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideSubmitError() {
    submitError && submitError.classList.remove('show');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideSubmitError();
    let valid = true;

    form.querySelectorAll('[data-required]').forEach((field) => {
      const row = field.closest('.form-row');
      const value = field.value.trim();
      let fieldValid = value.length > 0;

      if (fieldValid && field.type === 'email') {
        fieldValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      }
      if (fieldValid && field.hasAttribute('data-min-length')) {
        fieldValid = value.length >= Number(field.getAttribute('data-min-length'));
      }

      row.classList.toggle('invalid', !fieldValid);
      if (!fieldValid) valid = false;
    });

    const consent = form.querySelector('#consent-privacy');
    if (consent && !consent.checked) {
      valid = false;
      consent.closest('.form-row')?.classList.add('invalid');
    }

    if (!valid) {
      const firstInvalid = form.querySelector('.invalid');
      firstInvalid && firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.consent_privacy = !!consent?.checked;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Invio in corso…';
    }

    try {
      const response = await fetch('/api/contatto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Invio non riuscito. Riprova più tardi.');
      }

      form.style.display = 'none';
      success && success.classList.add('show');
      success && success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      showSubmitError(
        err.message || 'Invio non riuscito. Riprova più tardi o scrivi a info@rcsworld.eu.'
      );
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Invia richiesta';
      }
    }
  });

  form.querySelectorAll('[data-required]').forEach((field) => {
    field.addEventListener('input', () => {
      field.closest('.form-row')?.classList.remove('invalid');
    });
  });
}
