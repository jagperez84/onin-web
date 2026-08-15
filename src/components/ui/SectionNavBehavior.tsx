import { useEffect } from 'react';

const PRODUCT_TARGETS = [
  ['producto-datos-generales', 'Datos generales'],
  ['producto-comercial', 'Comercial'],
  ['producto-stock', 'Stock'],
  ['producto-caracteristicas', 'Características'],
  ['producto-precios', 'Proveedores y precios'],
] as const;

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function setupProductTargets() {
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.product-detail-grid > .panel, .product-profile-section-wrap > .panel'));
  const byHeading = new Map<string, HTMLElement>();
  panels.forEach((panel) => {
    const heading = panel.querySelector('h2');
    if (heading) byHeading.set(normalize(heading.textContent ?? ''), panel);
  });

  const headingMap: Array<[string, string]> = [
    ['datos generales', 'producto-datos-generales'],
    ['información comercial', 'producto-comercial'],
    ['gestión de stock', 'producto-stock'],
    ['características / colores', 'producto-caracteristicas'],
    ['precios y condiciones comerciales', 'producto-precios'],
  ];

  headingMap.forEach(([heading, id]) => {
    const panel = byHeading.get(heading);
    if (!panel) return;
    panel.id = id;
    panel.classList.add('product-profile-anchor');
  });
}

function updateActive(nav: HTMLElement) {
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[data-section-target]'));
  if (!links.length) return;

  const scrollY = window.scrollY + nav.getBoundingClientRect().height + 90;
  let activeId = links[0].dataset.sectionTarget ?? '';

  for (const link of links) {
    const id = link.dataset.sectionTarget;
    if (!id) continue;
    const target = document.getElementById(id);
    if (!target) continue;
    if (target.getBoundingClientRect().top + window.scrollY <= scrollY) activeId = id;
  }

  links.forEach((link) => {
    link.classList.toggle('active', link.dataset.sectionTarget === activeId);
  });
}

function setupNav(nav: HTMLElement) {
  if (nav.dataset.bound === '1') return;
  nav.dataset.bound = '1';

  if (nav.classList.contains('product-profile-section-nav')) {
    setupProductTargets();
    PRODUCT_TARGETS.forEach(([id, label]) => {
      const link = nav.querySelector<HTMLAnchorElement>(`a[data-section-label="${label}"]`);
      if (link) {
        link.dataset.sectionTarget = id;
        link.href = `#${id}`;
      }
    });
  }

  const onScroll = () => updateActive(nav);
  const onResize = () => updateActive(nav);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  nav.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest<HTMLAnchorElement>('a[data-section-target]');
    if (!link) return;
    const id = link.dataset.sectionTarget;
    if (!id) return;
    const section = document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
    requestAnimationFrame(() => updateActive(nav));
  });

  updateActive(nav);
}

export function SectionNavBehavior() {
  useEffect(() => {
    const scan = () => {
      document.querySelectorAll<HTMLElement>('.customer-section-nav, .product-profile-section-nav').forEach(setupNav);
      document.querySelectorAll<HTMLElement>('.product-profile-section-nav').forEach((nav) => {
        setupProductTargets();
        updateActive(nav);
      });
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
