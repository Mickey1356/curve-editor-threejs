import * as THREE from '../three/build/three.module.js'

export function setupLights(scene, camera) {
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

  return [light, light2, light3, ambientLight, pointLight];
}

export function exportCurve(finalCurvePoints) {
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
}

export function exportCurveObj(finalCurvePoints) {
  if (finalCurvePoints.length == 0) {
    alert('no curve to export');
  } else {
    let dat = '';
    for (let i = 0; i < finalCurvePoints.length; i++) {
      dat += 'v ' + finalCurvePoints[i].x + ' ' + finalCurvePoints[i].y + ' ' + finalCurvePoints[i].z + '\n';
    }
    dat += 'l'
    for (let i = 1; i <= finalCurvePoints.length; i++) {
      dat += ' ' + i;
    }
    dat += ' 1\n';
    const a = document.createElement('a');
    const blob = new Blob([dat], { type: 'plain/text' });
    const url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = 'curve.obj';
    a.click();
    window.URL.revokeObjectURL(url);
  }
}

export function setupResize(window, renderer, camera, container) {
  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
}