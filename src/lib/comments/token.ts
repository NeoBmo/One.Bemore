// El token es la «llave» anónima de cada lector: vive en su navegador.
// En la base de datos solo se guarda su hash, igual que con una contraseña.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// 32 bytes aleatorios: imposible de adivinar por fuerza bruta.
export const generateToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export const isToken = (value: unknown): value is string => typeof value === 'string' && TOKEN_PATTERN.test(value);

// SHA-256 en hexadecimal. Funciona igual en Node y en Cloudflare Workers.
export const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const hashToken = (token: string): Promise<string> => sha256(`token:${token}`);

// La sal secreta impide reconstruir la IP probando todas las posibles.
export const hashIp = (ip: string, salt: string): Promise<string> => sha256(`ip:${salt}:${ip}`);

// Alias estable para quien no escribe uno: el mismo lector siempre es el mismo.
export const aliasFromHash = (hash: string): string => `Lector-${hash.slice(0, 4).toUpperCase()}`;
