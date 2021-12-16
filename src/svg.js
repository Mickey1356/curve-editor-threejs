import * as THREE from '../three/build/three.module.js'

const MAX_BOUNDS = 200;

function cvtPolygon(polygon) {
  let pos = [], avg_x = 0, avg_y = 0;
  for (let xy_str of polygon.split(', ')) {
    const xy = xy_str.split(' ');
    const x = +xy[0], y = +xy[1];
    pos.push({ x, y });
    avg_x += x;
    avg_y += y;
  }
  // scale everything such that it fits within a MAX_BOUNDS square
  let minX = pos[0].x, maxX = pos[0].x, minY = pos[0].y, maxY = pos[0].y;
  for (let i = 1; i < pos.length; i++) {
    minX = Math.min(minX, pos[i].x);
    maxX = Math.max(maxX, pos[i].x);
    minY = Math.min(minY, pos[i].y);
    maxY = Math.max(maxY, pos[i].y);
  }
  const width = maxX - minX, height = maxY - minY;
  let scale_ratio = MAX_BOUNDS / Math.max(width, height);

  // center polygon at 0, 0
  avg_x /= pos.length;
  avg_y /= pos.length;
  for (let i = 0; i < pos.length; i++) {
    pos[i].x -= avg_x;
    pos[i].y -= avg_y;

    pos[i].x *= scale_ratio;
    pos[i].y *= scale_ratio;
  }

  return pos;
}

function cvtShapeToObj(shape, sceneX, sceneY, sceneWidth, sceneHeight) {
  const pts = [];
  const cX = sceneX + sceneWidth / 2, cY = sceneY + sceneHeight / 2;
  for (let xy of shape) {
    pts.push(new THREE.Vector3(xy.x + cX, xy.y + cY, 0));
  }
  return pts;
}

// polygons obtained from https://betravis.github.io/shape-tools/path-to-polygon/
let sharkPolygon = '132.23 48.05, 139.42 61.60, 140.42 63.60, 142.01 66.41, 149.34 34.68, 147.85 32.35, 148.85 25.87, 150.11 22.23, 157.11 1.40, 156.52 0.63, 148.67 6.00, 132.30 20.86, 126.80 32.40, 82.69 21.64, 86.00 11.16, 91.83 4.16, 94.17 3.00, 91.60 2.45, 71.48 6.46, 69.48 8.28, 60.19 18.28, 56.28 19.08, 29.08 17.87, 0.92 16.33, 2.59 41.07, 6.47 48.17, 14.22 54.43, 21.38 58.25, 27.00 61.39, 50.00 53.53, 50.54 54.38, 48.88 57.12, 31.88 74.62, 32.88 75.33, 51.38 93.26, 53.00 95.74, 61.20 102.74, 63.44 85.48, 66.63 84.00, 90.02 78.37, 94.93 82.37, 111.49 81.80, 118.96 79.43, 118.12 76.04, 110.40 71.61, 109.63 66.61, 123.28 50.01, 128.90 42.35, 132.33 48.21';
let sharkShape = cvtPolygon(sharkPolygon);

let dinoPolygon = '50.78 35.49, 39.46 44.12, 24.67 69.92, 2.81 91.79, 0.63 94.33, 8.09 95.55, 24.28 92.12, 34.79 101.90, 42.57 101.13, 42.82 100.84, 43.99 97.84, 43.46 91.21, 45.13 87.16, 49.59 87.27, 52.14 91.10, 53.28 100.69, 70.81 100.69, 70.81 90.90, 74.21 85.26, 79.07 89.84, 80.23 99.72, 95.11 99.72, 96.26 87.22, 98.41 85.22, 100.41 87.01, 103.67 95.68, 105.58 97.93, 120.37 98.18, 125.60 92.18, 121.93 48.18, 114.79 16.37, 110.79 9.37, 107.49 5.30, 97.11 0.54, 91.00 3.15, 88.75 21.74, 94.61 24.68, 92.33 44.13, 89.98 45.19, 77.26 34.82, 50.61 35.59';
let dinoShape = cvtPolygon(dinoPolygon);

let pigPolygon = '133.20 67.17, 134.20 69.91, 136.58 75.23, 140.08 76.95, 142.31 73.78, 139.45 66.09, 135.79 62.15, 133.53 48.41, 131.25 38.94, 129.40 35.34, 113.02 20.74, 70.15 15.60, 64.39 3.49, 63.40 0.58, 59.48 6.18, 55.07 13.59, 49.77 3.11, 41.62 12.85, 35.00 15.79, 22.85 24.86, 17.00 34.47, 14.70 39.47, 9.37 43.14, 2.69 43.95, 2.27 44.37, 0.69 47.76, 0.54 65.47, 14.00 65.47, 11.30 69.27, 10.65 70.69, 7.52 73.00, 19.59 77.45, 37.81 94.20, 40.31 95.97, 46.57 101.29, 50.23 104.29, 55.74 101.64, 65.21 98.56, 88.14 98.24, 94.30 99.82, 99.49 104.37, 104.25 100.37, 106.25 96.02, 109.49 93.00, 128.23 80.89, 130.52 77.09, 133.20 67.17';
let pigShape = cvtPolygon(pigPolygon);

export { cvtShapeToObj, sharkShape, dinoShape, pigShape };