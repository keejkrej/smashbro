/** Column-major TRS: translate * rotateY * scale. */
export function compose(
  x: number,
  y: number,
  z: number,
  rotY: number,
  sx: number,
  sy: number,
  sz: number,
): Float32Array {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return new Float32Array([
    c * sx,
    0,
    -s * sx,
    0,
    0,
    sy,
    0,
    0,
    s * sz,
    0,
    c * sz,
    0,
    x,
    y,
    z,
    1,
  ]);
}
