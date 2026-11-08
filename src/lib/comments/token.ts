// El token es la «llave» anónima de cada lector: vive en su navegador.
// Lleva una firma del servidor, así que nadie puede fabricar uno válido sin el secreto.
// En la base de datos solo se guarda su hash, igual que con una contraseña.

const PART = '[A-Za-z0-9_-]{43}';
const TOKEN_PATTERN = new RegExp(`^${PART}\\.${PART}$`);
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const MIN_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const assertSecret = (secret: string, name: string) => {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`${name} necesita al menos ${MIN_SECRET_LENGTH} caracteres`);
};

const hmac = async (secret: string, message: string): Promise<ArrayBuffer> => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
};

// Compara sin cortar en la primera diferencia: el tiempo no revela cuánto acertó.
const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const sha256 = async (text: string): Promise<string> => toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));

export const isHash = (value: unknown): value is string => typeof value === 'string' && HASH_PATTERN.test(value);

// Emite un token nuevo: 32 bytes aleatorios y su firma con el secreto del servidor.
export const issueToken = async (secret: string): Promise<string> => {
  assertSecret(secret, 'El secreto de tokens');
  const random = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const signature = toBase64Url(new Uint8Array(await hmac(secret, `token:${random}`)));
  return `${random}.${signature}`;
};

// Un token vale solo si su firma coincide: el formato correcto no basta.
export const verifyToken = async (value: unknown, secret: string): Promise<boolean> => {
  if (typeof value !== 'string' || !TOKEN_PATTERN.test(value)) return false;
  assertSecret(secret, 'El secreto de tokens');
  const [random, signature] = value.split('.');
  const expected = toBase64Url(new Uint8Array(await hmac(secret, `token:${random}`)));
  return sameText(signature, expected);
};

export const hashToken = (token: string): Promise<string> => sha256(`token:${token}`);

// Alias automático: 6 caracteres derivados con el secreto, imposibles de elegir desde fuera.
export const aliasFromHash = async (tokenHash: string, secret: string): Promise<string> =>
  `Lector-${toHex(await hmac(secret, `alias:${tokenHash}`)).slice(0, 6).toUpperCase()}`;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

// Una conexión IPv6 doméstica controla millones de direcciones dentro de su /64,
// así que se agrupa por ese prefijo. Una IPv4 escrita como IPv6 vuelve a IPv4.
// Lo que no sea una IP válida es un error de configuración y se rechaza.
export const normalizeIp = (ip: string): string => {
  const value = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (IPV4.test(value)) return value;

  let host: string;
  try {
    host = new URL(`http://[${value}]`).hostname.slice(1, -1);
  } catch {
    throw new Error('IP no válida');
  }

  const mapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const [high, low] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }

  const [head, tail = ''] = host.split('::');
  const left = head ? head.split(':') : [];
  const right = host.includes('::') && tail ? tail.split(':') : [];
  const groups = host.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return `${groups.slice(0, 4).join(':')}::/64`;
};

// La sal secreta impide reconstruir la IP probando todas las posibles.
export const hashIp = (ip: string, salt: string): Promise<string> => {
  assertSecret(salt, 'La sal de IP');
  return sha256(`ip:${salt}:${normalizeIp(ip)}`);
};
