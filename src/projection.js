import * as THREE from '../three/build/three.module.js'
import { GUI } from '../three/examples/jsm/libs/lil-gui.module.min.js'
import { OBJLoader } from '../three/examples/jsm/loaders/OBJLoader.js'
import { OrbitControls } from '../three/examples/jsm/controls/OrbitControls.js'
import { DecalGeometry } from '../three/examples/jsm/geometries/DecalGeometry.js'
import { Line2 } from '../three/examples/jsm/lines/Line2.js';
import { LineMaterial } from '../three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from '../three/examples/jsm/lines/LineGeometry.js';

import './simplify.js'
import { cvtShapeToObj, pointCommandsToCSSPoints, cvtPolygon, pathToPoints, sharkShape, dinoShape, pigShape } from './svg.js'

let renderer, scene, camera, raycaster;
let controls;
let model;
let lights;
let finalCurve, finalCurvePoints = [], finalCurveColor = new THREE.Color(1, 0, 0), curveWidth = 3;
let finalPos, finalOrient = new THREE.Vector3(), finalScale = new THREE.Vector3(1, 1, 1);

const intersection = {
  intersects: false,
  point: new THREE.Vector3(),
  normal: new THREE.Vector3()
};
let mouseHelper, indicator, xInd, yInd, zInd;

let container = document.getElementById('canvas');
const clock = new THREE.Clock();
const objloader = new OBJLoader();

// default material
const material = new THREE.MeshPhongMaterial({ side: THREE.DoubleSide, flatShading: true });

// mouse buttons
let mouseIsPressed, mouseX, mouseY, pmouseX, pmouseY;

// scribble scene params
let scribbleEnabled = false, scribbling = false;
let scribbleScene, scribbleCamera;
let scribbleWidth = 400, scribbleHeight = 300, scribbleX = 20, scribbleY = 0, scribbleDelta = 5;
let scribble = null;
const scribblePoints = [];

// smooth curve params
const smootherParams = {
  epsilon: 10,
  alpha: 0.5,
  n_segs: 20,
};
let decimatedCurve = null, splineCurve = null;
const splineCurvePoints = [];
let decimatedHandles = [], decimatedCurvePoints = [];
const dragIntersection = {
  intersecting: false,
  draggedObject: null,
  dragged: false,
};

function setupLights() {
  // directional lights
  const light = new THREE.DirectionalLight(0x555555);
  light.position.set(-1, 1, 1);
  scene.add(light);
  const light2 = new THREE.DirectionalLight(0x555555);
  light2.position.set(1, 1, 1);
  scene.add(light2);
  const light3 = new THREE.DirectionalLight(0x555555);
  light3.position.set(0, -1, -1);
  scene.add(light3);
  // small ambient light
  const ambientLight = new THREE.AmbientLight(0x808080, 0.5);
  scene.add(ambientLight);
  // point light to camera
  const pointLight = new THREE.PointLight(0xaaaaaa, 0.25);
  camera.add(pointLight);
  scene.add(camera);

  lights = [light, light2, light3, ambientLight, pointLight];
}

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
            model.geometry.center();
            // scale mesh by about 3
            model.scale.set(3, 3, 3);
            scene.add(model);
          } catch (err) {
            alert('error in parsing file: ' + filename + ' - ' + err.message);
          }
        });
        reader.readAsText(file);
        break;
    }
  });
  document.getElementById('loadsvg').addEventListener('change', (evt) => {
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
      case 'svg':
        reader.addEventListener('load', (evt) => {
          let contents = evt.target.result;
          try {
            // load the svg file in the parser
            contents = contents.replace(/^[\s\S]*(<svg)/i, "$1");
            document.getElementById('svg-result').innerHTML = contents;

            const result = cvtPolygon(processSVG());
            console.log(result);

            // just set decimatedCurvePoints
            decimatedCurvePoints = cvtShapeToObj(result, scribbleX, scribbleY, scribbleWidth, scribbleHeight);

            drawDecimatedCurve();
            splat();

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
      if (finalCurvePoints.length == 0) {
        alert('no curve to export');
      } else {
        let dat = '';
        for (let i = 0; i < finalCurvePoints.length; i++) {
          dat += finalCurvePoints[i].x + ' ' + finalCurvePoints[i].y + ' ' + finalCurvePoints[i].z + '\n';
        }
        const a = document.createElement('a');
        const blob = new Blob([dat], { type: 'plain/text' });
        const url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = 'curve.txt';
        a.click();
        window.URL.revokeObjectURL(url);
      }
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

  // project curve params
  {
    const curveProjFolder = gui.addFolder('Project 2D Curve');
    const curveProjObj = {
      hideModel() {
        model.visible = !model.visible;
        indicator.visible = !indicator.visible;
      },
      loadSVG() {
        if (model.visible) {
          curveProjDoneDrawBtn.enable();
          curveProjDrawBtn.disable();
          scribbleEnabled = true;
        } else {
          alert('no model visible');
        }
        document.getElementById('loadsvg').click();
      },
      drawCurve() {
        if (model.visible) {
          curveProjDoneDrawBtn.enable();
          curveProjDrawBtn.disable();
          scribbleEnabled = true;
        } else {
          alert('no model visible');
        }
      },
      closeScene() {
        curveProjDoneDrawBtn.disable();
        curveProjDrawBtn.enable();
        scribbleEnabled = false;
        scribbling = false;

        scribbleScene.remove(scribble);
        scribble = null;
        scribblePoints.length = 0;
        scribbleScene.remove(decimatedCurve);
        decimatedCurve = null;
        scribbleScene.remove(splineCurve);
        splineCurve = null;
        splineCurvePoints.length = 0;
        for (let i = 0; i < decimatedHandles.length; i++) {
          scribbleScene.remove(decimatedHandles[i]);
        }
      },
      loadDino() {
        this.drawCurve();
        decimatedCurvePoints = cvtShapeToObj(dinoShape, scribbleX, scribbleY, scribbleWidth, scribbleHeight);
        drawDecimatedCurve();
        splat();
      },
      loadPig() {
        this.drawCurve();
        decimatedCurvePoints = cvtShapeToObj(pigShape, scribbleX, scribbleY, scribbleWidth, scribbleHeight);
        drawDecimatedCurve();
        splat();
      },
      loadShark() {
        this.drawCurve();
        decimatedCurvePoints = cvtShapeToObj(sharkShape, scribbleX, scribbleY, scribbleWidth, scribbleHeight);
        drawDecimatedCurve();
        splat();
      },
      width: scribbleWidth,
      height: scribbleHeight,
      x: scribbleX,
      y: scribbleY
    };
    curveProjFolder.add(curveProjObj, 'hideModel').name('show/hide model');
    const curveProjDrawBtn = curveProjFolder.add(curveProjObj, 'drawCurve').name('open draw window');
    const curveProjDoneDrawBtn = curveProjFolder.add(curveProjObj, 'closeScene').name('close draw window').disable();

    const curveProjPosFolder = curveProjFolder.addFolder('Window positions');
    curveProjPosFolder.add(curveProjObj, 'width', 0, container.clientWidth).onChange((val) => {
      scribbleWidth = val;
      updateScribbleCam();
    });
    curveProjPosFolder.add(curveProjObj, 'height', 0, container.clientHeight).onChange((val) => {
      scribbleHeight = val;
      updateScribbleCam();
    });
    curveProjPosFolder.add(curveProjObj, 'x', 0, container.clientWidth).onChange((val) => {
      scribbleX = val;
      updateScribbleCam();
    });
    curveProjPosFolder.add(curveProjObj, 'y', 0, container.clientHeight).onChange((val) => {
      scribbleY = val;
      updateScribbleCam();
    });
    curveProjPosFolder.close();

    curveProjFolder.add({ s: scribbleDelta }, 's', 1, 10).name('stickiness').onChange((val) => scribbleDelta = val);

    const curveProjSmoothFolder = curveProjFolder.addFolder('Smoothing parameters');
    curveProjSmoothFolder.add(smootherParams, 'epsilon', 0, 50).onChange(() => {
      decimateCurve();
      splat();
    });
    curveProjSmoothFolder.add(smootherParams, 'alpha', 0, 1).onChange(() => {
      decimateCurve();
      splat();
    });
    curveProjSmoothFolder.add(smootherParams, 'n_segs', 1, 50, 1).onChange(() => {
      decimateCurve();
      splat();
    });
    curveProjSmoothFolder.close();

    const splatScaleObj = { width: finalScale.x, height: finalScale.y, thickness: finalScale.z, rotation: finalOrient.z };
    curveProjFolder.add(splatScaleObj, 'width', 1, 20).onChange((val) => {
      finalScale.x = val;
      if (finalCurvePoints.length > 0) splat();
    });
    curveProjFolder.add(splatScaleObj, 'height', 1, 20).onChange((val) => {
      finalScale.y = val;
      if (finalCurvePoints.length > 0) splat();
    });
    curveProjFolder.add(splatScaleObj, 'thickness', 0, 5).onChange((val) => {
      finalScale.z = val;
      if (finalCurvePoints.length > 0) splat();
    });
    curveProjFolder.add(splatScaleObj, 'rotation', 0, 360).onChange((val) => {
      finalOrient.z = val / 180 * Math.PI;
      if (finalCurvePoints.length > 0) splat();
    });
    curveProjFolder.add(curveProjObj, 'loadDino').name('load dinosaur');
    curveProjFolder.add(curveProjObj, 'loadPig').name('load pig');
    curveProjFolder.add(curveProjObj, 'loadShark').name('load shark');
    curveProjFolder.add(curveProjObj, 'loadSVG').name('load svg');
  }

  gui.add({ reset() { gui.reset() } }, 'reset').name('reset params');
  gui.add({ reset() { controls.reset() } }, 'reset').name('reset camera');

  gui.open();
}

function mousePressed(evt) {
  const { x, y } = container.getBoundingClientRect();
  const aX = mouseX - x, aY = mouseY - y;

  checkIntersection(evt.clientX, evt.clientY);
  if (evt.button == 0) {
    if (scribbleEnabled) {
      if (aX < scribbleX + scribbleWidth && aX >= scribbleX && aY < scribbleY + scribbleHeight && aY >= scribbleY) {
        // clear points
        scribblePoints.length = 0;
        scribbling = true;

        scribblePoints.push(new THREE.Vector3(mouseX, aY, 0));

        scribbleScene.remove(scribble);
        scribbleScene.remove(decimatedCurve);
        scribbleScene.remove(splineCurve);

        // add handle points for each decimated curve
        for (let i = 0; i < decimatedHandles.length; i++) {
          scribbleScene.remove(decimatedHandles[i]);
        }
        decimatedHandles.length = 0;

      }

      if (model.visible && intersection.intersects) {
        finalPos = intersection.point.clone();
        finalOrient = mouseHelper.rotation.clone();
        splat();
      }
    }
  } else if (evt.button == 2) {
    if (dragIntersection.intersecting) {
      dragIntersection.dragged = true;
    }
  }
}

function mouseDragged(evt) {
  const { x, y } = container.getBoundingClientRect();
  const aX = mouseX - x, aY = mouseY - y;
  if (scribbling) {
    if (aX < scribbleX + scribbleWidth && aX >= scribbleX && aY < scribbleY + scribbleHeight && aY >= scribbleY) {
      // if (mouseX != pmouseX || mouseY != pmouseY) {
      const lastPt = scribblePoints[scribblePoints.length - 1];
      if (lastPt.clone().sub(new THREE.Vector3(aX, aY, 0)).lengthSq() > scribbleDelta ** 2) {
        scribblePoints.push(new THREE.Vector3(aX, aY, 0));
        if (scribble != null) {
          scribbleScene.remove(scribble);
        }
        const geom = new THREE.BufferGeometry().setFromPoints(scribblePoints);
        scribble = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xff0000 }));
        scribbleScene.add(scribble);
      }
    } else {
      scribbling = false;
      closeScribble();
    }
  }

  if (dragIntersection.dragged) {
    if (aX < scribbleX + scribbleWidth && aX >= scribbleX && aY < scribbleY + scribbleHeight && aY >= scribbleY) {
      dragIntersection.draggedObject.position.copy(new THREE.Vector3(aX, aY, 0));
    } else {
      dragIntersection.dragged = false;
    }
  }
}

function mouseMoved(evt) {
  const { x, y } = container.getBoundingClientRect();
  const aX = mouseX - x, aY = mouseY - y;
  if (scribbleEnabled) {
    if (aX < scribbleX + scribbleWidth && aX >= scribbleX && aY < scribbleY + scribbleHeight && aY >= scribbleY) {
      controls.enabled = false;
    } else {
      controls.enabled = true;
    }
  } else {
    controls.enabled = true;
  }
  checkIntersection(mouseX, mouseY);
  checkDragIntersection(mouseX, mouseY);
}

function mouseReleased(evt) {
  if (scribbling) {
    scribbling = false;
    closeScribble();
    if (finalCurvePoints.length > 0) splat();
  }

  if (dragIntersection.dragged) {
    dragIntersection.dragged = false;
    decimatedCurvePoints.length = 0;
    for (let i = 0; i < decimatedHandles.length; i++) {
      decimatedCurvePoints.push(decimatedHandles[i].position.clone());
    }
    if (decimatedCurvePoints.length > 1) {
      decimatedCurvePoints.push(decimatedCurvePoints[0]);
    }
    drawDecimatedCurve();
    if (finalCurvePoints.length > 0) splat();
  }
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

function catmullRom(pt0, pt1, pt2, pt3, t) {
  const x0 = pt0.x, x1 = pt1.x, x2 = pt2.x, x3 = pt3.x;
  const y0 = pt0.y, y1 = pt1.y, y2 = pt2.y, y3 = pt3.y;
  function dist(x0, y0, x1, y1) {
    return Math.sqrt((x0 - x1) ** 2 + (y0 - y1) ** 2);
  }
  const t0 = 0;
  const t1 = t0 + (dist(x0, y0, x1, y1) ** smootherParams.alpha);
  const t2 = t1 + (dist(x1, y1, x2, y2) ** smootherParams.alpha);
  const t3 = t2 + (dist(x2, y2, x3, y3) ** smootherParams.alpha);
  const ti = t1 + t * (t2 - t1);

  const a1x = (x0 * (t1 - ti) + x1 * (ti - t0)) / (t1 - t0);
  const a1y = (y0 * (t1 - ti) + y1 * (ti - t0)) / (t1 - t0);
  const a2x = (x1 * (t2 - ti) + x2 * (ti - t1)) / (t2 - t1);
  const a2y = (y1 * (t2 - ti) + y2 * (ti - t1)) / (t2 - t1);
  const a3x = (x2 * (t3 - ti) + x3 * (ti - t2)) / (t3 - t2);
  const a3y = (y2 * (t3 - ti) + y3 * (ti - t2)) / (t3 - t2);
  const b1x = (a1x * (t2 - ti) + a2x * (ti - t0)) / (t2 - t0);
  const b1y = (a1y * (t2 - ti) + a2y * (ti - t0)) / (t2 - t0);
  const b2x = (a2x * (t3 - ti) + a3x * (ti - t1)) / (t3 - t1);
  const b2y = (a2y * (t3 - ti) + a3y * (ti - t1)) / (t3 - t1);

  const cx = (b1x * (t2 - ti) + b2x * (ti - t1)) / (t2 - t1);
  const cy = (b1y * (t2 - ti) + b2y * (ti - t1)) / (t2 - t1);

  return new THREE.Vector2(cx, cy, 0);
}

function decimateCurve() {
  // decimate points
  decimatedCurvePoints.length = 0;
  if (scribblePoints.length > 0) {
    decimatedCurvePoints = simplify(scribblePoints, smootherParams.epsilon);
    drawDecimatedCurve();
  }
}

function drawDecimatedCurve() {
  if (decimatedCurvePoints.length < 2) return;

  // generate the decimated curve
  scribbleScene.remove(decimatedCurve);
  const decGeom = new THREE.BufferGeometry().setFromPoints(decimatedCurvePoints);
  decimatedCurve = new THREE.Line(decGeom, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
  scribbleScene.add(decimatedCurve);

  // clear existing handles
  for (let i = 0; i < decimatedHandles.length; i++) {
    scribbleScene.remove(decimatedHandles[i]);
  }
  decimatedHandles.length = 0;

  // generate handles
  for (let i = 0; i < decimatedCurvePoints.length - 1; i++) {
    const geom = new THREE.PlaneGeometry(10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(decimatedCurvePoints[i]);
    decimatedHandles.push(mesh);
    scribbleScene.add(mesh);
  }

  // smooth curve
  smoothCurve();
}

function smoothCurve() {
  // remove the old curves (if existing)
  scribbleScene.remove(splineCurve);
  splineCurvePoints.length = 0;

  if (decimatedCurvePoints.length > 0) {
    // create a new smooth curve
    const totalPts = decimatedCurvePoints.length - 1;
    for (let i = 0; i < totalPts; i++) {
      const i0 = (i - 1) < 0 ? totalPts - 1 : i - 1;
      const i1 = i;
      const i2 = (i + 1) % totalPts;
      const i3 = (i + 2) % totalPts;

      for (let j = 0; j < smootherParams.n_segs; j++) {
        const t = j / smootherParams.n_segs;
        const np = catmullRom(decimatedCurvePoints[i0], decimatedCurvePoints[i1], decimatedCurvePoints[i2], decimatedCurvePoints[i3], t);
        splineCurvePoints.push(np);
      }
    }
    splineCurvePoints.push(splineCurvePoints[0]);
    const splGeom = new THREE.BufferGeometry().setFromPoints(splineCurvePoints);
    splineCurve = new THREE.Line(splGeom, new THREE.LineBasicMaterial({ color: 0x0000ff }));
    scribbleScene.add(splineCurve);
  }
}

function closeScribble() {
  // close with a straight line
  if (scribblePoints.length > 2) {
    scribblePoints.push(scribblePoints[0]);
    if (scribble != null) {
      scribbleScene.remove(scribble);
    }
    const geom = new THREE.BufferGeometry().setFromPoints(scribblePoints);
    scribble = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    scribbleScene.add(scribble);
    decimateCurve();
  }
}

function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
}

function updateScribbleCam() {
  scribbleCamera.left = scribbleX;
  scribbleCamera.right = scribbleX + scribbleWidth;
  scribbleCamera.top = scribbleY;
  scribbleCamera.bottom = scribbleY + scribbleHeight;
  scribbleCamera.near = -scribbleHeight;
  scribbleCamera.far = scribbleHeight;
  scribbleCamera.updateProjectionMatrix();
}

function checkDragIntersection(x, y) {
  const mx = ((x - scribbleX - container.getBoundingClientRect().left) / scribbleWidth) * 2 - 1;
  const my = (1 - (y - scribbleY - container.getBoundingClientRect().top) / scribbleHeight) * 2 - 1;

  if (mx < -1 || mx > 1 || my < -1 || my > 1) return;

  raycaster.setFromCamera(new THREE.Vector2(mx, my), scribbleCamera);
  const intersects = [];
  raycaster.intersectObjects(decimatedHandles, false, intersects);
  if (intersects.length > 0) {
    dragIntersection.intersecting = true;
    dragIntersection.draggedObject = intersects[0].object;
    // dragControls = new DragControls([intersects[0].object], camera, renderer.domElement);
  } else {
    dragIntersection.intersecting = false;
  }
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
    intersects.length = 0;
  } else {
    intersection.intersects = false;
  }
}

function splat() {
  finalCurvePoints.length = 0;
  if (splineCurvePoints.length < 2) return;
  if (finalPos === undefined) return;

  const decal = new DecalGeometry(model, finalPos, finalOrient, finalScale);

  // convert splineCurvePoints to UV (0 to 1), where 0 is btm-left
  const curveUVPts = [];
  for (let i = 0; i < splineCurvePoints.length; i++) {
    const x = splineCurvePoints[i].x - scribbleX, y = scribbleHeight - splineCurvePoints[i].y + scribbleY;
    const u = x / scribbleWidth, v = y / scribbleHeight;
    curveUVPts.push(new THREE.Vector2(u, v));
  }

  const triPos = decal.getAttribute('position');
  const triUV = decal.getAttribute('uv');
  const numTris = triPos.count / 3;
  // for each splineCurve UV, determine which triangle holds that coordinate (through barycentric) and calculate its 3d position
  for (let j = 0; j < curveUVPts.length; j++) {
    const uvP = curveUVPts[j];
    for (let i = 0; i < numTris; i++) {
      const uv1 = new THREE.Vector2(triUV.array.at(6 * i + 0), triUV.array.at(6 * i + 1));
      const uv2 = new THREE.Vector2(triUV.array.at(6 * i + 2), triUV.array.at(6 * i + 3));
      const uv3 = new THREE.Vector2(triUV.array.at(6 * i + 4), triUV.array.at(6 * i + 5));

      const v0 = uv2.clone().sub(uv1), v1 = uv3.clone().sub(uv1), v2 = uvP.clone().sub(uv1);
      const den = v0.x * v1.y - v1.x * v0.y;
      const v = (v2.x * v1.y - v1.x * v2.y) / den;
      const w = (v0.x * v2.y - v2.x * v0.y) / den;
      const u = 1 - v - w;
      if (0 <= v && v <= 1 && 0 <= w && w <= 1 && 0 <= u && u <= 1) {
        const pos1 = new THREE.Vector3(triPos.array.at(9 * i + 0), triPos.array.at(9 * i + 1), triPos.array.at(9 * i + 2));
        const pos2 = new THREE.Vector3(triPos.array.at(9 * i + 3), triPos.array.at(9 * i + 4), triPos.array.at(9 * i + 5));
        const pos3 = new THREE.Vector3(triPos.array.at(9 * i + 6), triPos.array.at(9 * i + 7), triPos.array.at(9 * i + 8));

        const pos = pos1.multiplyScalar(u).add(pos2.multiplyScalar(v)).add(pos3.multiplyScalar(w));
        finalCurvePoints.push(pos);
      }
    }
  }
  drawFinalCurve();
}

function drawFinalCurve() {
  scene.remove(finalCurve);

  // create the finalCurve mesh and add it to the scene
  const geom = new THREE.BufferGeometry().setFromPoints(finalCurvePoints)
  const line_tmp = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: finalCurveColor }));

  const geom2 = new LineGeometry().fromLine(line_tmp);
  const mat2 = new LineMaterial({ color: finalCurveColor, linewidth: curveWidth / 1000 });
  finalCurve = new Line2(geom2, mat2);
  finalCurve.computeLineDistances();

  // console.log(finalCurve);
  // finalCurve = new THREE.Mesh(decal, material);
  scene.add(finalCurve);
}

function processSVG() {
  const paths = document.querySelectorAll('#svg-result path');
  if (paths.length > 1) alert('more than 1 path, using the first one');
  const path = paths[0];
  const points = pathToPoints(path.pathSegList);
  return pointCommandsToCSSPoints(points)
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
  setupLights(scene, camera);

  // init raycaster
  raycaster = new THREE.Raycaster();

  // setup 2d curve scribble scene
  scribbleScene = new THREE.Scene();
  scribbleScene.background = new THREE.Color(0xaaaaaa);
  scribbleCamera = new THREE.OrthographicCamera(0, 0, 0, 0, -scribbleHeight, scribbleHeight);
  // add a small cross indicator to mark the center
  const centerLocX = scribbleX + scribbleWidth / 2, centerLocY = scribbleY + scribbleHeight / 2;
  const centerSize = 2;
  const centerPts = [
    new THREE.Vector3(centerLocX + centerSize, centerLocY + centerSize, 0),
    new THREE.Vector3(centerLocX - centerSize, centerLocY - centerSize, 0),
    new THREE.Vector3(centerLocX, centerLocY, 0),
    new THREE.Vector3(centerLocX + centerSize, centerLocY - centerSize, 0),
    new THREE.Vector3(centerLocX - centerSize, centerLocY + centerSize, 0)
  ];
  const centerIndicator = new THREE.Line(new THREE.BufferGeometry().setFromPoints(centerPts), new THREE.LineBasicMaterial({ color: 0x000000f }));
  scribbleScene.add(centerIndicator);
  updateScribbleCam();

  // event listeners (gui, dom, mouse)
  setupDomGuiEvents();
  setupGui();
  setupMouseFunctions();
  window.addEventListener('resize', resize);

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

  if (scribbleEnabled) {
    renderer.autoClear = false;
    renderer.clearDepth();

    renderer.setScissor(scribbleX, container.clientHeight - scribbleHeight - scribbleY, scribbleWidth, scribbleHeight);
    renderer.setViewport(scribbleX, container.clientHeight - scribbleHeight - scribbleY, scribbleWidth, scribbleHeight);
    renderer.render(scribbleScene, scribbleCamera);
  }

  renderer.autoClear = true;
  requestAnimationFrame(animate);
}

main();