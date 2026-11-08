// El token es la «llave» anónima de cada lector: vive en su navegador.
// En la base de datos solo se guarda su hash, igual que con una contraseña.

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MIN_SALT_LENGTH = 32;

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// 32 bytes aleatorios: imposible de adivinar por fuerza bruta.
export const generateToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export const isToken = (value: unknown): value is string => typeof value === 'string' && TOKEN_PATTERN.test(value);

export const isHash = (value: unknown): value is string => typeof value === 'string' && HASH_PATTERN.test(value);

// SHA-256 en hexadecimal. Funciona igual en Node y en Cloudflare Workers.
export const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const hashToken = (token: string): Promise<string> => sha256(`token:${token}`);

// Una conexión IPv6 doméstica controla millones de direcciones dentro de su /64,
// así que se agrupa por ese prefijo. Una IPv4 escrita como IPv6 vuelve a IPv4.
export const normalizeIp = (ip: string): string => {
  const value = ip.trim().toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return mapped[1];
  if (!value.includes(':')) return value;

  const [head, tail = ''] = value.split('::');
  const left = head ? head.split(':') : [];
  const right = value.includes('::') && tail ? tail.split(':') : [];
  const missing = Math.max(0, 8 - left.length - right.length);
  const groups = value.includes('::') ? [...left, ...Array(missing).fill('0'), ...right] : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
};

// La sal secreta impide reconstruir la IP probando todas las posibles.
export const hashIp = (ip: string, salt: string): Promise<string> => {
  if (salt.length < MIN_SALT_LENGTH) throw new Error(`La sal de IP necesita al menos ${MIN_SALT_LENGTH} caracteres`);
  return sha256(`ip:${salt}:${normalizeIp(ip)}`);
};

// Alias estable para quien no escribe uno: el mismo lector siempre es el mismo.
export const aliasFromHash = (hash: string): string => `Lector-${hash.slice(0, 4).toUpperCase()}`;
