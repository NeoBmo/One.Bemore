import { matchesSearch, parseTypeFilter } from '../lib/posts';

// Artículos por tanda: la lista crece con «Ver más» en lugar de mostrarse entera.
const PAGE_SIZE = 10;

const countLabel = (count: number) => (count === 1 ? '1 artículo' : `${count} artículos`);

export const initArchiveFilter = () => {
  const form = document.querySelector<HTMLFormElement>('[data-filters]');
  const bar = form?.querySelector<HTMLElement>('[data-bar]');
  const toggle = form?.querySelector<HTMLButtonElement>('[data-toggle]');
  const fields = form?.querySelector<HTMLElement>('[data-fields]');
  const input = form?.querySelector<HTMLInputElement>('input[type="search"]');
  const select = form?.querySelector<HTMLSelectElement>('select');
  if (!form || !bar || !toggle || !fields || !input || !select) return;

  const posts = [...document.querySelectorAll<HTMLElement>('[data-post]')];
  const count = form.querySelector<HTMLElement>('[data-count]');
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  const more = document.querySelector<HTMLButtonElement>('[data-more]');

  const params = new URLSearchParams(location.search);
  input.value = params.get('q') ?? '';
  select.value = parseTypeFilter(params.get('tipo')) ?? '';
  // Las tandas abiertas viven en el historial: al volver de un artículo la lista sigue igual.
  let pages = Number(history.state?.archivePages) || 1;

  const apply = () => {
    const activeType = parseTypeFilter(select.value);
    const matches = posts.filter(
      (post) => (!activeType || post.dataset.type === activeType) && matchesSearch(post.dataset.title ?? '', input.value),
    );
    const limit = pages * PAGE_SIZE;
    for (const post of posts) post.hidden = true;
    matches.slice(0, limit).forEach((post) => (post.hidden = false));

    const filtering = Boolean(activeType || input.value.trim());
    if (count) count.textContent = filtering ? countLabel(matches.length) : '';
    if (empty) empty.hidden = matches.length > 0 || posts.length === 0;
    if (more) more.hidden = matches.length <= limit;

    // La URL refleja la búsqueda para poder compartirla, sin llenar el historial.
    const url = new URL(location.href);
    url.searchParams.delete('tipo');
    url.searchParams.delete('q');
    if (activeType) url.searchParams.set('tipo', activeType);
    if (input.value.trim()) url.searchParams.set('q', input.value.trim());
    history.replaceState({ ...history.state, archivePages: pages }, '', url);
  };

  const setOpen = (open: boolean) => {
    fields.hidden = !open;
    bar.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    // El borde arranca del ancho de la lupa y se estira hasta ocupar la fila.
    if (open) bar.style.setProperty('--from', String(toggle.offsetWidth / Math.max(bar.offsetWidth, 1)));
  };

  // Cerrar limpia la búsqueda: la lupa cerrada siempre significa «ver todo».
  const close = () => {
    input.value = '';
    select.value = '';
    pages = 1;
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
  const restart = () => {
    pages = 1;
    apply();
  };
  input.addEventListener('input', restart);
  select.addEventListener('change', restart);
  form.addEventListener('submit', (event) => event.preventDefault());

  more?.addEventListener('click', () => {
    const firstNew = posts.filter((post) => !post.hidden).length;
    pages += 1;
    apply();
    // El foco pasa al primer artículo nuevo, para seguir leyendo desde ahí con el teclado.
    posts.filter((post) => !post.hidden)[firstNew]?.querySelector('a')?.focus();
  });

  form.hidden = false;
  setOpen(Boolean(input.value || select.value));
  apply();
  // Se anuncia solo lo que cambia tras una interacción, no el estado inicial.
  count?.setAttribute('aria-live', 'polite');
};
