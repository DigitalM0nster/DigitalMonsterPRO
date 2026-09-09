// One cylindrical surface for video, frame, light scatter and CPU pointer hits.
const radius = .64;

export const filmSurfaceGLSL = `
vec3 filmSurface(vec3 p){
 float angle=p.x/${radius};
 return vec3(sin(angle)*${radius},p.y,(1.-cos(angle))*${radius}+p.z);
}`;

export function filmSurfacePoint(x, y, z = 0) {
  const angle = x / radius;
  return [Math.sin(angle) * radius, y, (1 - Math.cos(angle)) * radius + z];
}

export function filmSurfaceNormal(x) {
  return [-Math.sin(x / radius), 0, Math.cos(x / radius)];
}

/** Prepared once, including real curved triangles for raycasting. */
export function bendFilmGeometry(geometry) {
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, ...filmSurfacePoint(position.getX(i), position.getY(i), position.getZ(i)));
  }
  if (geometry.hasAttribute("normal")) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
