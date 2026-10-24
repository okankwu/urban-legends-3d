const fs=require('fs');
function patch(f,pairs){let s=fs.readFileSync(f,'utf8');for(const [a,b] of pairs){if(!s.includes(a)){console.error('MISSING in '+f+': '+a.slice(0,70));process.exit(1)}s=s.split(a).join(b)}fs.writeFileSync(f,s)}
patch('src/engine/runtime.ts',[["  headYaw: 0,","  /** the cockpit camera's pose in the chassis frame (stabilised eye + head look); dashboard picking uses it */\n  camRel: { pos: new Vector3(), quat: new Quaternion() },\n  headYaw: 0,"]]);
patch('src/player/CameraRig.tsx',[
["      camera.quaternion.copy(stable).multiply(qHead)\n      init = false\n      return","      camera.quaternion.copy(stable).multiply(qHead)\n      // remember where the camera sits relative to the chassis, so dashboard buttons are picked exactly where they are drawn\n      invQ.copy(rt.vehicleQuat).invert()\n      rt.camRel.pos.copy(eye).sub(rt.vehiclePos).applyQuaternion(invQ)\n      rt.camRel.quat.copy(invQ).multiply(camera.quaternion)\n      init = false\n      return"],
["const UP = new THREE.Vector3(0, 1, 0)","const UP = new THREE.Vector3(0, 1, 0)\nconst invQ = new THREE.Quaternion()"],
]);
patch('src/vehicles/Dashboard.tsx',[
["    t.e.set(rt.headPitch, Math.PI + rt.headYaw, 0)\n    t.q.setFromEuler(t.e)\n    t.dir.applyQuaternion(t.q)\n    t.org.set(cp.eye[0], cp.eye[1], cp.eye[2])","    t.dir.applyQuaternion(rt.camRel.quat)\n    t.org.copy(rt.camRel.pos)"],
]);
