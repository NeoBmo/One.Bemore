-- Comentarios de One.Bemore.
-- Las reglas que deben resistir peticiones simultáneas viven aquí, no en JavaScript:
-- límites por IP con un candado por transacción, votos únicos por clave primaria y
-- borrado del autor en una sola sentencia. Solo el servidor (clave secreta) accede.

-- ---------------------------------------------------------------- Tablas

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null check (char_length(post_slug) between 1 and 200),
  parent_id uuid,
  alias text not null check (char_length(alias) between 1 and 40),
  -- char_length cuenta puntos de código, igual que el dominio en TypeScript.
  body text not null check (char_length(body) between 2 and 2000),
  -- Estado de moderación: lo decide Luis desde el Table Editor.
  status text not null default 'visible'
    check (status in ('visible', 'quarantined', 'hidden', 'deleted')),
  -- Marca del autor, aparte del estado: lo borrado nunca se publica aunque se apruebe.
  author_deleted boolean not null default false,
  author_token_hash text not null check (author_token_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  -- Permite la clave foránea compuesta: el padre debe ser del mismo artículo.
  unique (id, post_slug),
  foreign key (parent_id, post_slug) references public.comments (id, post_slug) on delete cascade
);

create index comments_post_created_idx on public.comments (post_slug, created_at);
create index comments_ip_created_idx on public.comments (ip_hash, created_at);
create index comments_parent_idx on public.comments (parent_id);

create table public.comment_votes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  voter_hash text not null check (voter_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  -- Un voto por lector y comentario, garantizado por la base de datos.
  primary key (comment_id, voter_hash)
);

create index comment_votes_ip_created_idx on public.comment_votes (ip_hash, created_at);

-- ---------------------------------------------------------------- Acceso

-- RLS activo y sin políticas: nadie con la clave pública puede leer ni escribir.
-- La clave secreta del servidor (service_role) sí puede, porque se salta RLS.
alter table public.comments enable row level security;
alter table public.comment_votes enable row level security;

revoke all on public.comments, public.comment_votes from anon, authenticated;

-- Puntuación por comentario: el servidor recibe la suma, nunca quién votó qué.
create view public.comment_scores
with (security_invoker = true) as
  select comment_id, sum(value)::integer as score
  from public.comment_votes
  group by comment_id;

revoke all on public.comment_scores from anon, authenticated;

-- ---------------------------------------------------------------- Funciones

-- Profundidad de un comentario si toda su rama está abierta (visible y no borrada
-- por su autor); null si algún ancestro está cerrado. Tope de 50 para no recorrer sin fin.
create function public.comment_open_depth(p_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  with recursive chain as (
    select c.id, c.parent_id, c.status, c.author_deleted, 0 as depth
    from public.comments c
    where c.id = p_id
    union all
    select c.id, c.parent_id, c.status, c.author_deleted, chain.depth + 1
    from public.comments c
    join chain on c.id = chain.parent_id
    where chain.depth < 50
  )
  select case
    when count(*) > 0
      and bool_and(status = 'visible' and not author_deleted)
      and count(*) filter (where parent_id is null) = 1
    then max(depth)
  end
  from chain;
$$;

-- Publica un comentario de forma atómica. El candado por IP hace que dos envíos
-- simultáneos se atiendan en fila, así el límite no se puede saltar.
create function public.post_comment(
  p_post_slug text,
  p_parent_id uuid,
  p_alias text,
  p_body text,
  p_status text,
  p_author_token_hash text,
  p_ip_hash text,
  p_rate_max integer,
  p_rate_window interval,
  p_max_depth integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_depth integer;
  v_recent integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('comment-ip:' || p_ip_hash));

  select count(*) into v_recent
  from public.comments
  where ip_hash = p_ip_hash and created_at > now() - p_rate_window;
  if v_recent >= p_rate_max then
    return jsonb_build_object('ok', false, 'error', 'rate-limited');
  end if;

  if p_parent_id is not null then
    if not exists (select 1 from public.comments where id = p_parent_id and post_slug = p_post_slug) then
      return jsonb_build_object('ok', false, 'error', 'invalid-parent');
    end if;
    v_depth := public.comment_open_depth(p_parent_id);
    if v_depth is null then
      return jsonb_build_object('ok', false, 'error', 'invalid-parent');
    end if;
    if v_depth + 1 > p_max_depth then
      return jsonb_build_object('ok', false, 'error', 'too-deep');
    end if;
  end if;

  insert into public.comments (post_slug, parent_id, alias, body, status, author_token_hash, ip_hash)
  values (p_post_slug, p_parent_id, p_alias, p_body, p_status, p_author_token_hash, p_ip_hash)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Vota de forma atómica: repetir el mismo voto lo retira y cambiarlo lo reemplaza.
create function public.toggle_vote(
  p_comment_id uuid,
  p_voter_hash text,
  p_ip_hash text,
  p_value smallint,
  p_rate_max integer,
  p_rate_window interval
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_comment public.comments%rowtype;
  v_recent integer;
begin
  if p_value not in (-1, 1) then
    return 'invalid-vote';
  end if;

  select * into v_comment from public.comments where id = p_comment_id;
  if not found or public.comment_open_depth(p_comment_id) is null then
    return 'not-found';
  end if;

  -- Sin autovoto: ni con el token del autor ni desde su misma conexión.
  if v_comment.author_token_hash = p_voter_hash or v_comment.ip_hash = p_ip_hash then
    return 'own-comment';
  end if;

  perform pg_advisory_xact_lock(hashtext('vote-ip:' || p_ip_hash));

  select count(*) into v_recent
  from public.comment_votes
  where ip_hash = p_ip_hash and created_at > now() - p_rate_window;
  if v_recent >= p_rate_max then
    return 'rate-limited';
  end if;

  delete from public.comment_votes
  where comment_id = p_comment_id and voter_hash = p_voter_hash and value = p_value;
  if found then
    return 'ok';
  end if;

  insert into public.comment_votes (comment_id, voter_hash, ip_hash, value)
  values (p_comment_id, p_voter_hash, p_ip_hash, p_value)
  on conflict (comment_id, voter_hash)
  do update set value = excluded.value, ip_hash = excluded.ip_hash, created_at = now();

  return 'ok';
end;
$$;

-- Borrado por el autor en una sola sentencia: solo si el hash coincide.
create function public.mark_author_deleted(p_id uuid, p_author_token_hash text)
returns boolean
language sql
set search_path = ''
as $$
  with updated as (
    update public.comments
    set author_deleted = true
    where id = p_id and author_token_hash = p_author_token_hash and not author_deleted
    returning 1
  )
  select exists (select 1 from updated);
$$;

-- Solo el servidor ejecuta estas funciones.
revoke execute on function
  public.comment_open_depth(uuid),
  public.post_comment(text, uuid, text, text, text, text, text, integer, interval, integer),
  public.toggle_vote(uuid, text, text, smallint, integer, interval),
  public.mark_author_deleted(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.comment_open_depth(uuid),
  public.post_comment(text, uuid, text, text, text, text, text, integer, interval, integer),
  public.toggle_vote(uuid, text, text, smallint, integer, interval),
  public.mark_author_deleted(uuid, text)
to service_role;
