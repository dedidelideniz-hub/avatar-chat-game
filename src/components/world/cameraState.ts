/**
 * Shared camera state — updated by World.tsx's game loop,
 * read by StreetScene3D's useFrame to sync the 3D camera.
 */
export const cameraState = {
  x: 0,
  y: 0,
  vw: 1600,
  vh: 900,
};
