import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../node_modules/three/build/three.module.js";
import {
  computeForwardKinematics, createJointState, getPhysicalJointPositions,
  J3_J4_MM, J4_J5_MM, J5_J6_MM, TOOL_LENGTH_MM,
} from "../src/kinematics.js";
import { getEndEffectorPose } from "../src/forward-kinematics.js";

const tol = 1e-7;
const close = (a,b,info="") => assert.ok(Math.abs(a-b) < tol, `${info}: ${a} != ${b}`);
const same = (a,b,info="") => close(a.distanceTo(b),0,info);
const angle = n => n*Math.PI/180;
const z = M => new THREE.Vector3(M[2],M[6],M[10]).normalize();

function pose(changes={}) {
  const js=createJointState();
  for (const [key,deg] of Object.entries(changes)) js[Number(key)-1].thetaRad=angle(deg);
  const state=computeForwardKinematics(js);
  return {state,physical:getPhysicalJointPositions(state)};
}

test("DH classica corresponde a J4/J6 roll e a ferramenta fica separada", () => {
  const js=createJointState();
  const expected=[
    [229.4,0,90,0], [0,250.2,0,0], [0,0,90,90],
    [J3_J4_MM+J4_J5_MM,0,-90,0], [0,0,90,0], [J5_J6_MM,0,0,0],
  ];
  js.forEach((j,i)=>assert.deepEqual([j.d,j.a,j.alpha,j.thetaOffset],expected[i]));
});

test("os centros J3-J4-J5-J6 e o TCP respeitam cada comprimento", () => {
  for(const angles of [{},{2:35,3:-70,4:82,5:-33,6:120}]) {
    const {physical:p,state}=pose(angles);
    close(p[2].distanceTo(p[3]),J3_J4_MM,"J3-J4");
    close(p[3].distanceTo(p[4]),J4_J5_MM,"J4-J5");
    close(p[4].distanceTo(p[5]),J5_J6_MM,"J5-J6");
    close(p[5].distanceTo(state.endPosition),TOOL_LENGTH_MM,"J6-TCP");
    const axisJ6=state.axes[5];
    close(Math.abs(axisJ6.dot(p[5].clone().sub(p[4]).normalize())),1,"J6 axial");
    close(Math.abs(axisJ6.dot(state.endPosition.clone().sub(p[5]).normalize())),1,"TCP axial");
  }
});

test("J4 faz roll; J3-J4 fica imovel; J5 continua perpendicular a J4", () => {
  const before=pose({4:0,5:0}),after=pose({4:90,5:0});
  for(let i=0;i<5;i++)same(before.physical[i],after.physical[i],`centro J${i+1}`);
  close(Math.abs(before.state.axes[3].dot(before.state.axes[4])),0,"perpendicular J4/J5");
  close(Math.abs(after.state.axes[3].dot(after.state.axes[4])),0,"perpendicular J4/J5 girada");
  close(before.state.axes[4].dot(after.state.axes[4]),0,"eixo J5 acompanhou roll");
  // J5 e o elo J5-J6 ficam coaxiais ao roll de J4 quando theta5=0.
  same(before.physical[5],after.physical[5],"J6 alinhada na pose zero");
  const bentBefore=pose({4:0,5:35}),bentAfter=pose({4:90,5:35});
  assert.ok(bentBefore.physical[5].distanceTo(bentAfter.physical[5])>1,"J6 move com J4 quando J5 flete");
});

test("J5 inclina J5-J6; J6 gira sem mover J6/TCP", () => {
  const before=pose({5:0,6:0}),bent=pose({5:45,6:0});
  same(before.physical[4],bent.physical[4],"centro J5");
  assert.ok(before.physical[5].distanceTo(bent.physical[5])>1,"centro J6 inclina com J5");
  const rolled=pose({5:45,6:90});
  same(bent.physical[5],rolled.physical[5],"centro J6 nao desloca com roll");
  same(bent.state.endPosition,rolled.state.endPosition,"TCP nao desloca com roll");
  assert.notDeepEqual(bent.state.cumulativeMatrices[5],rolled.state.cumulativeMatrices[5],"orientacao deve mudar");
  const result=getEndEffectorPose(createJointState());
  same(result.positionDh,new THREE.Vector3(result.matrix[3],result.matrix[7],result.matrix[11]),"pose TCP consistente");
});
