import { CommentsUnavailableError } from './types.ts';

// Turnstile funciona en dos mitades: el navegador resuelve el desafío con la clave pública
// y recibe un código de un solo uso; el servidor lo confirma con Cloudflare usando la secreta.
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;
// Cloudflare documenta códigos de hasta 2048 caracteres.
const MAX_RESPONSE_LENGTH = 2048;

// Claves secretas de prueba que publica Cloudflare: 1x aprueba todo, 2x rechaza todo y
// 3x responde «código ya usado». Sirven en local; en producción abrirían la puerta a los bots.
export const isTurnstileTestSecret = (secret: string): boolean => /^[123]x0+AA$/.test(secret.trim());

export type ChallengeVerifier = (response: unknown, remoteIp: string) => Promise<boolean>;

export const createTurnstileVerifier =
  (secret: string, fetchFn: typeof fetch = fetch): ChallengeVerifier =>
  async (response, remoteIp) => {
    if (typeof response !== 'string' || response === '' || response.length > MAX_RESPONSE_LENGTH) return false;

    const form = new FormData();
    form.append('secret', secret);
    form.append('response', response);
    form.append('remoteip', remoteIp);

    let result: Response;
    try {
      result = await fetchFn(SITEVERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new CommentsUnavailableError('sin respuesta de Turnstile');
    }
    // Si Cloudflare no puede verificar, el problema es del servicio, no del lector.
    if (!result.ok) {
      await result.body?.cancel();
      throw new CommentsUnavailableError(`Turnstile respondió ${result.status}`);
    }
    const outcome = (await result.json().catch(() => null)) as { success?: unknown } | null;
    // Solo un sí explícito vale: un código vencido, repetido o falso da false.
    return outcome?.success === true;
  };
