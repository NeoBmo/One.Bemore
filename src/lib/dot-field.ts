// Debe coincidir con --dot-period en tokens.css.
export const DOT_PERIOD = 28;

const SCROLL_SPEED = 0.12;
const FOLLOW_EASE = 0.12;
const SETTLE_DISTANCE = 0.5;

// La cuadrícula se repite cada periodo: al volver a 0 el salto no se percibe.
export const dotOffset = (scrollY: number): number => {
  const travel = Math.max(0, scrollY) * SCROLL_SPEED;
  const offset = -(travel % DOT_PERIOD);
  return offset === 0 ? 0 : offset;
};

// Cada cuadro recorre una parte de la distancia: da inercia sin librerías.
export const follow = (current: number, target: number): number => {
  const distance = target - current;
  return Math.abs(distance) < SETTLE_DISTANCE ? target : current + distance * FOLLOW_EASE;
};
