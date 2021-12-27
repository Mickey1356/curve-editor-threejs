import * as THREE from '../three/build/three.module.js'
import { GUI } from '../three/examples/jsm/libs/lil-gui.module.min.js'
import { OrbitControls } from '../three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from '../three/examples/jsm/lines/Line2.js';
import { LineMaterial } from '../three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from '../three/examples/jsm/lines/LineGeometry.js';

import './simplify.js'

let renderer, scene, camera, raycaster;
let controls;
let model;
let lights;
let finalCurve, finalCurvePoints = [], finalCurveColor = new THREE.Color(1, 0, 0), curveWidth = 3;

let xInd, yInd, zInd;

let container = document.getElementById('canvas');
const clock = new THREE.Clock();

// mouse buttons
let mouseIsPressed, mouseX, mouseY, pmouseX, pmouseY;

// 3d curve params
const curve3dParams = {
  modelView() {
    if (!scribbleEnabled) {
      model.visible = !model.visible;
      indicator.visible = !indicator.visible;
    } else {
      alert('exit 2d curve mode first');
    }
  },
  a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, t: 0,
  xExpr: '0',
  yExpr: '0',
  zExpr: '0',
  minT: 0,
  maxT: 1,
  numSteps: 200,
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
  const gui = new GUI({ width: 400 });

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

  // 3d curve params
  {
    const curve3dFolder = gui.addFolder('Parametric 3D Curve');

    const paramFolder = curve3dFolder.addFolder('Parameters');
    const aParam = paramFolder.add(curve3dParams, 'a', -10, 10).onChange(() => calc3DCurve());
    const bParam = paramFolder.add(curve3dParams, 'b', -10, 10).onChange(() => calc3DCurve());
    const cParam = paramFolder.add(curve3dParams, 'c', -10, 10).onChange(() => calc3DCurve());
    const dParam = paramFolder.add(curve3dParams, 'd', -10, 10).onChange(() => calc3DCurve());
    const eParam = paramFolder.add(curve3dParams, 'e', -10, 10).onChange(() => calc3DCurve());
    const fParam = paramFolder.add(curve3dParams, 'f', -10, 10).onChange(() => calc3DCurve());
    function setParams(params) {
      const allParams = [aParam, bParam, cParam, dParam, eParam, fParam];
      for (let i = 0; i < allParams.length; i++) {
        allParams[i].disable();
        if (i < params.length) {
          allParams[i].enable();
          allParams[i].setValue(params[i]);
        }
      }
    }
    paramFolder.close();

    const xExprObj = curve3dFolder.add(curve3dParams, 'xExpr').name('x').onChange(() => { calc3DCurve(); setParams([1, 1, 1, 1, 1, 1]) });
    const yExprObj = curve3dFolder.add(curve3dParams, 'yExpr').name('y').onChange(() => { calc3DCurve(); setParams([1, 1, 1, 1, 1, 1]) });
    const zExprObj = curve3dFolder.add(curve3dParams, 'zExpr').name('z').onChange(() => { calc3DCurve(); setParams([1, 1, 1, 1, 1, 1]) });
    const minTObj = curve3dFolder.add(curve3dParams, 'minT', -50, 50).name('t min').onChange(() => { calc3DCurve() });
    const maxTObj = curve3dFolder.add(curve3dParams, 'maxT', -50, 50).name('t max').onChange(() => { calc3DCurve() });
    curve3dFolder.add(curve3dParams, 'numSteps', 1, 1000, 1).name('num steps').onChange(() => { calc3DCurve() });

    const curveObjs = {
      trefoil() {
        xExprObj.setValue('a*sin(t) + b*sin((f-1)*t)');
        yExprObj.setValue('c*cos(t) - d*cos((f-1)*t)');
        zExprObj.setValue('-e*sin(f*t)');
        minTObj.setValue(0);
        maxTObj.setValue(2 * Math.PI);
        setParams([1, 2, 1, 2, 2, 3]);
      },
      lissajous() {
        xExprObj.setValue('a*cos(b*t*pi)');
        yExprObj.setValue('b*cos((a*t+1/(2*b))*pi)');
        zExprObj.setValue('cos(((2*a*b-a-b)*t+3/4)*pi)');
        minTObj.setValue(0);
        maxTObj.setValue(2);
        setParams([3, 2]);
      },
      epitrochoid() {
        xExprObj.setValue('(a+b*cos(c))*cos(t) - b*d*(cos(c)*cos(a*t/b)*cos(t) - sin(a*t/b)*sin(t))');
        yExprObj.setValue('b*sin(c)*(1 - d*cos(a*t/b))');
        zExprObj.setValue('(a+b*cos(c))*sin(t) - b*d*(cos(c) cos(a*t/b)*sin(t) - sin(a*t/b)*cos(t))');
        minTObj.setValue(0);
        maxTObj.setValue(2 * Math.PI);
        setParams([1, 1 / 4, Math.PI / 2, 1]);
      },
      spirograph() {
        xExprObj.setValue('(a-b)*cos(t) + c*cos((a-b)*t/b)');
        yExprObj.setValue('((a-b)*sin(t) - c*sin((a-b)*t/b))*cos(dt)');
        zExprObj.setValue('((a-b)*sin(t) - c*sin((a-b)*t/b))*sin(dt)');
        minTObj.setValue(0);
        maxTObj.setValue(6 * Math.PI);
        setParams([4, 3, 1.2, 2]);
      },
      clelia() {
        xExprObj.setValue('a*cos(b*t)*cos(t)');
        yExprObj.setValue('a*cos(b*t)*sin(t)');
        zExprObj.setValue('a*sin(b*t)');
        minTObj.setValue(0);
        maxTObj.setValue(2 * Math.PI);
        setParams([1, 2]);
      },
      tennis() {
        xExprObj.setValue('a*cos(t) + b*cos(c*t)');
        yExprObj.setValue('a*sin(t) + b*sin(c*t)');
        zExprObj.setValue('d*sin((c-1)*t)');
        minTObj.setValue(0);
        maxTObj.setValue(2 * Math.PI);
        setParams([1, 1, 3, 2]);
      }
    }

    const presets = curve3dFolder.addFolder('presets');
    presets.add(curveObjs, 'trefoil');
    presets.add(curveObjs, 'lissajous');
    presets.add(curveObjs, 'epitrochoid');
    presets.add(curveObjs, 'spirograph');
    presets.add(curveObjs, 'clelia');
    presets.add(curveObjs, 'tennis');
    presets.close();
  }

  gui.add({ reset() { gui.reset() } }, 'reset').name('reset params');
  gui.add({ reset() { controls.reset() } }, 'reset').name('reset camera');

  gui.open();
}

function setupIndicators() {
  scene.remove(xInd);
  scene.remove(yInd);
  scene.remove(zInd);

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

function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
}

function getParamTkn() {
  const arr = ['a', 'b', 'c', 'd', 'e', 'f'];
  const ret = [];
  for (let i = 0; i < arr.length; i++) {
    ret.push({ type: 3, token: arr[i], show: arr[i], value: arr[i] });
  }
  return ret;
}

function calc3DCurve() {
  finalCurvePoints.length = 0;

  const tkn = {
    type: 3,
    token: 't',
    show: 't',
    value: 't'
  }
  const sinTkn = {
    type: 0,
    token: 'sin',
    show: 'sin',
    value: (a) => { return Math.sin(a) }
  };
  const cosTkn = {
    type: 0,
    token: 'cos',
    show: 'cos',
    value: (a) => { return Math.cos(a) }
  };
  const tanTkn = {
    type: 0,
    token: 'tan',
    show: 'tan',
    value: (a) => { return Math.tan(a) }
  };
  const sqrtTkn = {
    type: 0,
    token: 'sqrt',
    show: 'sqrt',
    value: (a) => { return Math.sqrt(a) }
  };
  const tkns = getParamTkn();
  tkns.push(tkn, sinTkn, cosTkn, tanTkn, sqrtTkn);

  for (let i = 0; i < curve3dParams.numSteps; i++) {
    const t = i * (curve3dParams.maxT - curve3dParams.minT) / (curve3dParams.numSteps - 1) + curve3dParams.minT;

    try {
      curve3dParams.t = t;
      const x = mexp.eval(curve3dParams.xExpr, tkns, curve3dParams);
      const y = mexp.eval(curve3dParams.yExpr, tkns, curve3dParams);
      const z = mexp.eval(curve3dParams.zExpr, tkns, curve3dParams);
      finalCurvePoints.push(new THREE.Vector3(x, y, z));
    } catch (err) {
      console.log(err);
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

  // event listeners (gui, dom, mouse)
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

  requestAnimationFrame(animate);
}

main();