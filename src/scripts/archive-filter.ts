import { matchesSearch, parseTypeFilter } from '../lib/posts';

const countLabel = (count: number) => (count === 1 ? '1 artículo' : `${count} artículos`);

export const initArchiveFilter = () => {
  const form = document.querySelector<HTMLFormElement>('[data-filters]');
  const input = form?.querySelector<HTMLInputElement>('input[type="search"]');
  if (!form || !input) return;

  const posts = [...document.querySelectorAll<HTMLElement>('[data-post]')];
  const years = [...document.querySelectorAll<HTMLElement>('[data-year]')];
  const buttons = [...form.querySelectorAll<HTMLButtonElement>('[data-type]')];
  const count = form.querySelector<HTMLElement>('[data-count]');
  const empty = document.querySelector<HTMLElement>('[data-empty]');

  const params = new URLSearchParams(location.search);
  let activeType = parseTypeFilter(params.get('tipo'));
  input.value = params.get('q') ?? '';

  const apply = () => {
    let visible = 0;
    for (const post of posts) {
      const show =
        (!activeType || post.dataset.type === activeType) && matchesSearch(post.dataset.title ?? '', input.value);
      post.hidden = !show;
      if (show) visible += 1;
    }
    for (const year of years) year.hidden = !year.querySelector('[data-post]:not([hidden])');
    for (const button of buttons) button.setAttribute('aria-pressed', String((button.dataset.type || undefined) === activeType));

    if (count) count.textContent = countLabel(visible);
    if (empty) empty.hidden = visible > 0 || posts.length === 0;

    // La URL refleja el filtro para poder compartirla, sin llenar el historial.
    const url = new URL(location.href);
    url.searchParams.delete('tipo');
    url.searchParams.delete('q');
    if (activeType) url.searchParams.set('tipo', activeType);
    if (input.value.trim()) url.searchParams.set('q', input.value.trim());
    history.replaceState(null, '', url);
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      activeType = parseTypeFilter(button.dataset.type ?? null);
      apply();
    });
  }
  input.addEventListener('input', apply);
  form.addEventListener('submit', (event) => event.preventDefault());

  form.hidden = false;
  apply();
  // Se anuncia solo lo que cambia tras una interacción, no el conteo inicial.
  count?.setAttribute('aria-live', 'polite');
};
