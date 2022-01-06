import * as THREE from '../three/build/three.module.js'
import { GUI } from '../three/examples/jsm/libs/lil-gui.module.min.js'
import { OBJLoader } from '../three/examples/jsm/loaders/OBJLoader.js'
import { OrbitControls } from '../three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from '../three/examples/jsm/lines/Line2.js';
import { LineMaterial } from '../three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from '../three/examples/jsm/lines/LineGeometry.js';

import * as Common from './common.js'

let renderer, scene, camera, raycaster;
let controls;
let model;
let lights;
let mainPoints = [], ptIndicators = [], connectCurve = false;
let finalCurve, finalCurvePoints = [], finalCurveColor = new THREE.Color(1, 0, 0), curveWidth = 3;
let finalPos;
let tree;

const smootherParams = {
  epsilon: 10,
  alpha: 0.5,
  n_segs: 20,
};

const intersection = {
  intersects: false,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  intersectObj: null
};
let mouseHelper, indicator, xInd, yInd, zInd;

let container = document.getElementById('canvas');
const clock = new THREE.Clock();
const objloader = new OBJLoader();

// default material
const material = new THREE.MeshPhongMaterial({ side: THREE.DoubleSide, flatShading: true });
const ptMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });

// mouse buttons
let mouseIsPressed, mouseX, mouseY, pmouseX, pmouseY;

function setupDomGuiEvents() {
  document.getElementById('loadmesh').addEventListener('change', (evt) => {
    // take the first file
    const file = evt.target.files[0];
    // get filereader instance
    const reader = new FileReader();
    // get file extension
    const filename = file.name;
    const extension = filename.split('.').pop().toLowerCase();

    // remove existing stuff
    scene.remove(finalCurve);

    switch (extension) {
      case 'obj':
        scene.remove(model);
        reader.addEventListener('load', (evt) => {
          const contents = evt.target.result;
          try {
            model = objloader.parse(contents);
            // set model to be the underlying mesh (first children)
            model = model.children[0];
            // set model shading
            model.material = material;
            // center the mesh (based on bbox)
            // model.geometry.center();
            // scale mesh by about 3
            // model.scale.set(3, 3, 3);
            scene.add(model);
          } catch (err) {
            alert('error in parsing file: ' + filename + ' - ' + err.message);
          }
        });
        reader.readAsText(file);
        break;
    }
  });
}

function setupMouseFunctions() {
  mouseIsPressed = false;
  mouseX = 0;
  mouseY = 0;
  pmouseX = 0;
  pmouseY = 0;
  var setMouse = function (evt) {
    mouseX = evt.clientX;
    mouseY = evt.clientY;
  }
  renderer.domElement.addEventListener('mousedown', function (evt) {
    setMouse(evt);
    mouseIsPressed = true;
    if (typeof mousePressed !== 'undefined') mousePressed(evt);
  });
  renderer.domElement.addEventListener('mousemove', function (evt) {
    pmouseX = mouseX;
    pmouseY = mouseY;
    setMouse(evt);
    if (mouseIsPressed) {
      if (typeof mouseDragged !== 'undefined') mouseDragged(evt);
    }
    if (typeof mouseMoved !== 'undefined') mouseMoved(evt);
  });
  renderer.domElement.addEventListener('mouseup', function (evt) {
    mouseIsPressed = false;
    if (typeof mouseReleased !== 'undefined') mouseReleased(evt);
  });
}

function setupGui() {
  const gui = new GUI();

  // create an obj that loads a mesh
  const commonObj = {
    loadMesh() {
      indicator.visible = true;
      document.getElementById('loadmesh').click();
    },
    exportCurve() {
      Common.exportCurve(finalCurvePoints);
    },
    exportCurveObj() {
      Common.exportCurveObj(finalCurvePoints);
    },
    curveColor: finalCurveColor,
    lineWidth: curveWidth,
  };
  gui.add(commonObj, 'loadMesh').name('load mesh');
  gui.addColor(commonObj, 'curveColor').name('curve color').onChange((val) => {
    finalCurveColor = val;
    drawFinalCurve();
  });
  gui.add(commonObj, 'lineWidth', 1, 20).name('curve width').onChange((val) => {
    curveWidth = val;
    drawFinalCurve();
  })
  gui.add(commonObj, 'exportCurve').name('export curve');
  gui.add(commonObj, 'exportCurveObj').name('export curve as obj');

  // viewer params
  {
    const lightFolder = gui.addFolder('Viewer Parameters');
    const dirLightParams = { 'dir light color': lights[0].color.getHex() };
    const ambLightParams = { 'amb light color': lights[3].color.getHex(), 'amb intensity': lights[3].intensity };
    const ptLightParams = { 'pt light color': lights[4].color.getHex(), 'pt intensity': lights[4].intensity }
    lightFolder.addColor(dirLightParams, 'dir light color').onChange((val) => {
      lights[0].color.setHex(val);
      lights[1].color.setHex(val);
      lights[2].color.setHex(val);
    });
    lightFolder.addColor(ambLightParams, 'amb light color').onChange((val) => lights[3].color.setHex(val));
    lightFolder.add(ambLightParams, 'amb intensity', 0, 1).onChange((val) => lights[3].intensity = val);
    lightFolder.addColor(ptLightParams, 'pt light color').onChange((val) => lights[4].color.setHex(val));
    lightFolder.add(ptLightParams, 'pt intensity', 0, 1).onChange((val) => lights[4].intensity = val);
    lightFolder.close();
  }

  // wire mesh curve params
  {
    const curveProjFolder = gui.addFolder('Wire mesh');
    const curveProjObj = {
      hideModel() {
        model.visible = !model.visible;
        indicator.visible = !indicator.visible;
      },
      undoLastPoint() {
        if (mainPoints.length > 0) {
          mainPoints = mainPoints.slice(0, -1);
          scene.remove(ptIndicators[ptIndicators.length - 1]);
          ptIndicators = ptIndicators.slice(0, -1);
          computePaths();
        }
      },
      resetCurve() {
        mainPoints.length = 0;
        finalCurvePoints.length = 0;
        scene.remove(finalCurve);
        for (let ptMesh of ptIndicators) {
          scene.remove(ptMesh);
        }
      },
      // connect: connectCurve,
    };
    curveProjFolder.add(curveProjObj, 'hideModel').name('show/hide model');
    curveProjFolder.add(curveProjObj, 'undoLastPoint').name('undo last point');
    curveProjFolder.add(curveProjObj, 'resetCurve').name('reset curve');
    // curveProjFolder.add(curveProjObj, 'closeCurve').name('close curve');

    curveProjFolder.add(smootherParams, 'epsilon', 0, 50).onChange(() => {
      computePaths();
    });
    curveProjFolder.add(smootherParams, 'alpha', 0, 1).onChange(() => {
      computePaths();
    });
    curveProjFolder.add(smootherParams, 'n_segs', 1, 50, 1).onChange(() => {
      computePaths();
    });
  }

  gui.add({ reset() { gui.reset() } }, 'reset').name('reset params');
  gui.add({ reset() { controls.reset() } }, 'reset').name('reset camera');

  gui.open();
}

function mousePressed(evt) {
  const { x, y } = container.getBoundingClientRect();
  checkIntersection(evt.clientX, evt.clientY);

  if (evt.button == 0) {
    if (model.visible && intersection.intersects) {
      finalPos = intersection.point.clone();
      // finalOrient = mouseHelper.rotation.clone();
      addPoint();
    }
  }
}

function mouseMoved(evt) {
  checkIntersection(mouseX, mouseY);
}

function setupIndicators() {
  scene.remove(mouseHelper);
  scene.remove(indicator);
  scene.remove(xInd);
  scene.remove(yInd);
  scene.remove(zInd);

  // setup mouse helper and indicator
  mouseHelper = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 10), new THREE.MeshNormalMaterial());
  mouseHelper.visible = false;
  const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  indicator = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0x00aa00 }));
  scene.add(mouseHelper, indicator);

  // draw a simple xyz axis
  const geomX = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]);
  const geomY = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)]);
  const geomZ = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);
  xInd = new THREE.Line(geomX, new THREE.LineBasicMaterial({ color: 0xaa0000 }));
  yInd = new THREE.Line(geomY, new THREE.LineBasicMaterial({ color: 0x00aa00 }));
  zInd = new THREE.Line(geomZ, new THREE.LineBasicMaterial({ color: 0x0000aa }));

  const geomX2 = new LineGeometry().fromLine(xInd);
  xInd = new Line2(geomX2, new LineMaterial({ color: 0xaa0000, linewidth: 0.005 }));
  xInd.computeLineDistances();
  const geomY2 = new LineGeometry().fromLine(yInd);
  yInd = new Line2(geomY2, new LineMaterial({ color: 0x00aa00, linewidth: 0.005 }));
  yInd.computeLineDistances();
  const geomZ2 = new LineGeometry().fromLine(zInd);
  zInd = new Line2(geomZ2, new LineMaterial({ color: 0x0000aa, linewidth: 0.005 }));
  zInd.computeLineDistances();

  scene.add(xInd, yInd, zInd);
}

function checkIntersection(x, y) {
  if (model === undefined) return;

  const mx = ((x - container.getBoundingClientRect().left) / container.clientWidth) * 2 - 1;
  const my = -((y - container.getBoundingClientRect().top) / container.clientHeight) * 2 + 1;

  raycaster.setFromCamera(new THREE.Vector2(mx, my), camera);
  const intersects = [];
  raycaster.intersectObject(model, false, intersects);

  if (intersects.length > 0) {
    const p = intersects[0].point;
    mouseHelper.position.copy(p);
    intersection.point.copy(p);

    const n = intersects[0].face.normal.clone();
    n.transformDirection(model.matrixWorld);
    n.multiplyScalar(0.5);
    n.add(intersects[0].point);

    intersection.normal.copy(intersects[0].face.normal);
    mouseHelper.lookAt(n);

    const positions = indicator.geometry.attributes.position;
    positions.setXYZ(0, p.x, p.y, p.z);
    positions.setXYZ(1, n.x, n.y, n.z);
    positions.needsUpdate = true;

    intersection.intersects = true;
    intersection.intersectObj = intersects[0];
    intersects.length = 0;
  } else {
    intersection.intersects = false;
  }
}

function catmullRom(pt0, pt1, pt2, pt3, t) {
  const x0 = pt0.x, x1 = pt1.x, x2 = pt2.x, x3 = pt3.x;
  const y0 = pt0.y, y1 = pt1.y, y2 = pt2.y, y3 = pt3.y;
  const z0 = pt0.z, z1 = pt1.z, z2 = pt2.z, z3 = pt3.z;
  function dist(x0, y0, z0, x1, y1, z1) {
    return Math.sqrt((x0 - x1) ** 2 + (y0 - y1) ** 2 + (z0 - z1) ** 2);
  }
  const t0 = 0;
  const t1 = t0 + (dist(x0, y0, z0, x1, y1, z1) ** smootherParams.alpha);
  const t2 = t1 + (dist(x1, y1, z1, x2, y2, z2) ** smootherParams.alpha);
  const t3 = t2 + (dist(x2, y2, z2, x3, y3, z3) ** smootherParams.alpha);
  const ti = t1 + t * (t2 - t1);

  const a1x = (x0 * (t1 - ti) + x1 * (ti - t0)) / (t1 - t0);
  const a1y = (y0 * (t1 - ti) + y1 * (ti - t0)) / (t1 - t0);
  const a1z = (z0 * (t1 - ti) + z1 * (ti - t0)) / (t1 - t0);

  const a2x = (x1 * (t2 - ti) + x2 * (ti - t1)) / (t2 - t1);
  const a2y = (y1 * (t2 - ti) + y2 * (ti - t1)) / (t2 - t1);
  const a2z = (z1 * (t2 - ti) + z2 * (ti - t1)) / (t2 - t1);

  const a3x = (x2 * (t3 - ti) + x3 * (ti - t2)) / (t3 - t2);
  const a3y = (y2 * (t3 - ti) + y3 * (ti - t2)) / (t3 - t2);
  const a3z = (z2 * (t3 - ti) + z3 * (ti - t2)) / (t3 - t2);

  const b1x = (a1x * (t2 - ti) + a2x * (ti - t0)) / (t2 - t0);
  const b1y = (a1y * (t2 - ti) + a2y * (ti - t0)) / (t2 - t0);
  const b1z = (a1z * (t2 - ti) + a2z * (ti - t0)) / (t2 - t0);
  
  const b2x = (a2x * (t3 - ti) + a3x * (ti - t1)) / (t3 - t1);
  const b2y = (a2y * (t3 - ti) + a3y * (ti - t1)) / (t3 - t1);
  const b2z = (a2z * (t3 - ti) + a3z * (ti - t1)) / (t3 - t1);

  const cx = (b1x * (t2 - ti) + b2x * (ti - t1)) / (t2 - t1);
  const cy = (b1y * (t2 - ti) + b2y * (ti - t1)) / (t2 - t1);
  const cz = (b1z * (t2 - ti) + b2z * (ti - t1)) / (t2 - t1);

  return new THREE.Vector3(cx, cy, cz);
}

function addPoint() {
  mainPoints.push(finalPos);
  const ptGeom = new THREE.SphereGeometry(0.01);
  const ptMesh = new THREE.Mesh(ptGeom, ptMaterial);
  ptMesh.position.copy(finalPos);
  ptIndicators.push(ptMesh);
  scene.add(ptMesh);
  if (mainPoints.length > 1) {
    computePaths();
  }
}

function computePaths() {
  finalCurvePoints.length = 0;
  const totalPts = mainPoints.length;
  for (let i = 0; i < totalPts; i++) {
    const i0 = (i - 1) < 0 ? totalPts - 1 : i - 1;
    const i1 = i;
    const i2 = (i + 1) % totalPts;
    const i3 = (i + 2) % totalPts;

    for (let j = 0; j < smootherParams.n_segs; j++) {
      const t = j / smootherParams.n_segs;
      const np = catmullRom(mainPoints[i0], mainPoints[i1], mainPoints[i2], mainPoints[i3], t);
      finalCurvePoints.push(np);
    }
  }
  drawFinalCurve();
}

function drawFinalCurve() {
  if (finalCurvePoints.length > 0) {
    scene.remove(finalCurve);

    // create the finalCurve mesh and add it to the scene
    finalCurvePoints.push(finalCurvePoints[0]);
    const geom = new THREE.BufferGeometry().setFromPoints(finalCurvePoints)
    const line_tmp = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: finalCurveColor }));

    const geom2 = new LineGeometry().fromLine(line_tmp);
    const mat2 = new LineMaterial({ color: finalCurveColor, linewidth: curveWidth / 1000 });
    finalCurve = new Line2(geom2, mat2);
    finalCurve.computeLineDistances();

    scene.add(finalCurve);
  }
}

function main() {
  // init renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // init scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  // grid
  const gridHelper = new THREE.GridHelper(10, 10, 0x222222, 0xaaaaaa);
  scene.add(gridHelper);

  // load cube as model
  const geometry = new THREE.BoxGeometry(5, 5, 5);
  model = new THREE.Mesh(geometry, material);
  scene.add(model);

  // axis and hover
  setupIndicators();

  // init camera
  const fov = 75;
  const aspect = container.clientWidth / container.clientHeight;
  const near = 0.1;
  const far = 50;
  camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.z = 8;

  // add orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.mouseButtons = { RIGHT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN };
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // add lights
  lights = Common.setupLights(scene, camera);

  // init raycaster
  raycaster = new THREE.Raycaster();

  // event listeners (gui, dom, mouse)
  setupDomGuiEvents();
  setupGui();
  setupMouseFunctions();
  Common.setupResize(window, renderer, camera, container);

  // start render loop
  requestAnimationFrame(animate);
}

function animate(time) {
  const delta = clock.getDelta();
  time *= 0.001;

  controls.update(delta);

  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, container.clientWidth, container.clientHeight);
  renderer.setViewport(0, 0, container.clientWidth, container.clientHeight);
  renderer.render(scene, camera);

  renderer.autoClear = true;
  requestAnimationFrame(animate);
}

main();