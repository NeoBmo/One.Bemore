-- Cierre final tras la segunda revisión independiente.
--  1. Ejecutar funciones nuevas deja de ser un permiso global de PUBLIC: el revoke por
--     esquema de la migración anterior no alcanzaba a ese valor por defecto.
--  2. Los hashes se validan antes de los candados: nunca llega NULL ni un error con la fila.
--  3. Los eventos de voto viejos se limpian para todas las IPs, no solo la que vota.
--  4. Cada candado usa su propio espacio de claves, así no pueden chocar entre sí.

-- ---------------------------------------------------------------- 1. Permiso global

alter default privileges for role postgres revoke execute on functions from public;

-- ---------------------------------------------------------------- 3. Índice para limpiar

create index comment_vote_events_created_idx on public.comment_vote_events (created_at);

-- ---------------------------------------------------------------- 2 y 4. post_comment

create or replace function public.post_comment(
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

  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_author_token_hash is null or p_author_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid-input');
  end if;

  -- Espacio 1: comentarios por IP.
  perform pg_advisory_xact_lock(1, hashtext(p_ip_hash));

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
    when foreign_key_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid-parent');
    when check_violation or not_null_violation then
      return jsonb_build_object('ok', false, 'error', 'invalid-input');
  end;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------- 2, 3 y 4. toggle_vote

create or replace function public.toggle_vote(
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
  v_rate_max constant integer := 60;
  v_rate_window constant interval := interval '10 minutes';
  v_comment public.comments%rowtype;
  v_recent integer;
begin
  if p_value is null or p_value not in (-1, 1)
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_voter_hash is null or p_voter_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid-vote';
  end if;

  -- Espacio 2: votos por IP. El límite va antes de leer nada: cada intento cuenta.
  perform pg_advisory_xact_lock(2, hashtext(p_ip_hash));

  select count(*) into v_recent
  from public.comment_vote_events
  where ip_hash = p_ip_hash and created_at > now() - v_rate_window;
  if v_recent >= v_rate_max then
    return 'rate-limited';
  end if;

  insert into public.comment_vote_events (ip_hash) values (p_ip_hash);
  -- Limpieza global: ninguna IP deja rastro más allá de la ventana del límite.
  delete from public.comment_vote_events where created_at < now() - v_rate_window;

  select * into v_comment from public.comments where id = p_comment_id;
  if not found or public.comment_open_depth(p_comment_id) is null then
    return 'not-found';
  end if;

  if v_comment.author_token_hash = p_voter_hash or v_comment.ip_hash = p_ip_hash then
    return 'own-comment';
  end if;

  -- Espacio 3: un mismo lector sobre un mismo comentario.
  perform pg_advisory_xact_lock(3, hashtext(p_comment_id::text || p_voter_hash));

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

-- create or replace conserva los permisos, pero se reafirman para que este archivo sea explícito.
revoke execute on function
  public.post_comment(text, uuid, text, text, text, text, text),
  public.toggle_vote(uuid, text, text, smallint)
from public, anon, authenticated;

grant execute on function
  public.post_comment(text, uuid, text, text, text, text, text),
  public.toggle_vote(uuid, text, text, smallint)
to service_role;
