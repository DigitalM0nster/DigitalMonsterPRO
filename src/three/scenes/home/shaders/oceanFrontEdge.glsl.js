/** Fixed foreground shelf; the open water regains its full motion farther back. */
export const oceanFrontEdgeGlsl = /* glsl */ `
float oceanMotionWeight(float localZ) {
 return smoothstep(8.0, 20.0, 22.0 - localZ);
}

float oceanFrontHeight(float worldX) {
 // Broad, stationary shoulder traced from the reference: level left, lower right.
 return 0.45 + 0.35 * smoothstep(-13.5, -9.0, worldX)
             - 0.48 * smoothstep(-9.0, -1.4, worldX);
}
`;
