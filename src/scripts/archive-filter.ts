import { matchesSearch, parseTypeFilter } from '../lib/posts';

const countLabel = (count: number) => (count === 1 ? '1 artículo' : `${count} artículos`);

export const initArchiveFilter = () => {
  const form = document.querySelector<HTMLFormElement>('[data-filters]');
  const toggle = form?.querySelector<HTMLButtonElement>('[data-toggle]');
  const fields = form?.querySelector<HTMLElement>('[data-fields]');
  const input = form?.querySelector<HTMLInputElement>('input[type="search"]');
  const select = form?.querySelector<HTMLSelectElement>('select');
  if (!form || !toggle || !fields || !input || !select) return;

  const posts = [...document.querySelectorAll<HTMLElement>('[data-post]')];
  const years = [...document.querySelectorAll<HTMLElement>('[data-year]')];
  const count = form.querySelector<HTMLElement>('[data-count]');
  const empty = document.querySelector<HTMLElement>('[data-empty]');

  const params = new URLSearchParams(location.search);
  input.value = params.get('q') ?? '';
  select.value = parseTypeFilter(params.get('tipo')) ?? '';

  const apply = () => {
    const activeType = parseTypeFilter(select.value);
    let visible = 0;
    for (const post of posts) {
      const show =
        (!activeType || post.dataset.type === activeType) && matchesSearch(post.dataset.title ?? '', input.value);
      post.hidden = !show;
      if (show) visible += 1;
    }
    for (const year of years) year.hidden = !year.querySelector('[data-post]:not([hidden])');

    const filtering = Boolean(activeType || input.value.trim());
    if (count) count.textContent = filtering ? countLabel(visible) : '';
    if (empty) empty.hidden = visible > 0 || posts.length === 0;

    // La URL refleja el filtro para poder compartirla, sin llenar el historial.
    const url = new URL(location.href);
    url.searchParams.delete('tipo');
    url.searchParams.delete('q');
    if (activeType) url.searchParams.set('tipo', activeType);
    if (input.value.trim()) url.searchParams.set('q', input.value.trim());
    history.replaceState(null, '', url);
  };

  const setOpen = (open: boolean) => {
    fields.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar búsqueda' : 'Buscar artículos');
  };

  // Cerrar limpia el filtro: así la lupa cerrada siempre significa «ver todo».
  const close = () => {
    input.value = '';
    select.value = '';
    setOpen(false);
    apply();
    toggle.focus();
  };

  toggle.addEventListener('click', () => {
    if (fields.hidden) {
      setOpen(true);
      input.focus();
    } else {
      close();
    }
  });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !fields.hidden) close();
  });
  input.addEventListener('input', apply);
  select.addEventListener('change', apply);
  form.addEventListener('submit', (event) => event.preventDefault());

  // Si se llega con un filtro en la URL, la búsqueda ya aparece abierta.
  setOpen(Boolean(input.value || select.value));
  form.hidden = false;
  apply();
  // Se anuncia solo lo que cambia tras una interacción, no el estado inicial.
  count?.setAttribute('aria-live', 'polite');
};
