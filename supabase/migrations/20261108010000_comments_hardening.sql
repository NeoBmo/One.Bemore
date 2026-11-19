-- Endurecimiento tras la revisión independiente de la migración de comentarios.
--  1. El límite de votos cuenta acciones (tabla de eventos), no votos vivos.
--  2. Los límites son constantes en SQL: un parámetro vacío no puede desactivarlos.
--  3. Borrar un padre ya no arrastra las respuestas de otros: se modera por estado.
--  4. Candado por lector y comentario al votar.
--  5. Las violaciones de restricciones se traducen; nunca salen con datos de la fila.
--  6. Un comentario solo nace visible o en cuarentena.
--  7. Nada nuevo en public queda abierto a anon por defecto.

-- ---------------------------------------------------------------- 7. Permisos por defecto

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------- 3. Sin cascada

alter table public.comments drop constraint comments_parent_id_post_slug_fkey;
alter table public.comments add constraint comments_parent_id_post_slug_fkey
  foreign key (parent_id, post_slug) references public.comments (id, post_slug) on delete restrict;

-- ---------------------------------------------------------------- 1. Eventos de voto

create table public.comment_vote_events (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index comment_vote_events_ip_created_idx on public.comment_vote_events (ip_hash, created_at);

alter table public.comment_vote_events enable row level security;
revoke all on public.comment_vote_events from anon, authenticated;

-- ---------------------------------------------------------------- 2, 5 y 6. post_comment

drop function public.post_comment(text, uuid, text, text, text, text, text, integer, interval, integer);

create function public.post_comment(
  p_post_slug text,
  p_parent_id uuid,
  p_alias text,
  p_body text,
  p_status text,
  p_author_token_hash text,
  p_ip_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  -- Deben coincidir con LIMITS en src/lib/comments/types.ts.
  v_rate_max constant integer := 5;
  v_rate_window constant interval := interval '10 minutes';
  v_max_depth constant integer := 30;
  v_depth integer;
  v_recent integer;
  v_id uuid;
begin
  if p_status is null or p_status not in ('visible', 'quarantined') then
    raise exception 'post_comment: estado inicial no válido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('comment-ip:' || p_ip_hash));

  select count(*) into v_recent
  from public.comments
  where ip_hash = p_ip_hash and created_at > now() - v_rate_window;
  if v_recent >= v_rate_max then
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
    if v_depth + 1 > v_max_depth then
      return jsonb_build_object('ok', false, 'error', 'too-deep');
    end if;
  end if;

  begin
    insert into public.comments (post_slug, parent_id, alias, body, status, author_token_hash, ip_hash)
    values (p_post_slug, p_parent_id, p_alias, p_body, p_status, p_author_token_hash, p_ip_hash)
    returning id into v_id;
  exception
    -- El padre desapareció entre la comprobación y el insert.
    when foreign_key_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid-parent');
    -- Datos que el dominio debió rechazar antes: se informa sin copiar la fila.
    when check_violation or not_null_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid-input');
  end;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------- 1, 2, 4 y 5. toggle_vote

drop function public.toggle_vote(uuid, text, text, smallint, integer, interval);

create function public.toggle_vote(
  p_comment_id uuid,
  p_voter_hash text,
  p_ip_hash text,
  p_value smallint
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  -- Debe coincidir con el límite de votos documentado en el plan.
  v_rate_max constant integer := 60;
  v_rate_window constant interval := interval '10 minutes';
  v_comment public.comments%rowtype;
  v_recent integer;
begin
  if p_value is null or p_value not in (-1, 1) then
    return 'invalid-vote';
  end if;

  -- El límite va antes de leer nada: cada intento cuenta, salga como salga.
  perform pg_advisory_xact_lock(hashtext('vote-ip:' || p_ip_hash));

  select count(*) into v_recent
  from public.comment_vote_events
  where ip_hash = p_ip_hash and created_at > now() - v_rate_window;
  if v_recent >= v_rate_max then
    return 'rate-limited';
  end if;

  insert into public.comment_vote_events (ip_hash) values (p_ip_hash);
  delete from public.comment_vote_events where ip_hash = p_ip_hash and created_at < now() - v_rate_window;

  select * into v_comment from public.comments where id = p_comment_id;
  if not found or public.comment_open_depth(p_comment_id) is null then
    return 'not-found';
  end if;

  if v_comment.author_token_hash = p_voter_hash or v_comment.ip_hash = p_ip_hash then
    return 'own-comment';
  end if;

  -- Un mismo lector desde dos conexiones a la vez se atiende en fila.
  perform pg_advisory_xact_lock(hashtext('vote:' || p_comment_id::text || ':' || p_voter_hash));

  delete from public.comment_votes
  where comment_id = p_comment_id and voter_hash = p_voter_hash and value = p_value;
  if found then
    return 'ok';
  end if;

  begin
    insert into public.comment_votes (comment_id, voter_hash, ip_hash, value)
    values (p_comment_id, p_voter_hash, p_ip_hash, p_value)
    on conflict (comment_id, voter_hash)
    do update set value = excluded.value, ip_hash = excluded.ip_hash, created_at = now();
  exception
    when foreign_key_violation then
      return 'not-found';
    when check_violation or not_null_violation then
      return 'invalid-vote';
  end;

  return 'ok';
end;
$$;

-- Solo el servidor ejecuta las funciones nuevas.
revoke execute on function
  public.post_comment(text, uuid, text, text, text, text, text),
  public.toggle_vote(uuid, text, text, smallint)
from public, anon, authenticated;

grant execute on function
  public.post_comment(text, uuid, text, text, text, text, text),
  public.toggle_vote(uuid, text, text, smallint)
to service_role;
