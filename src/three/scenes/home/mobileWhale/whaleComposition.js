import { Euler, Quaternion } from "three";

// Positive local yaw brings the negative-X head forward and sends the tail away.
const viewTurn = new Quaternion().setFromEuler(new Euler(.04, .50, .06));
export function setWhaleViewRotation(target, parentMatrix, cameraQuaternion) {
	return target.setFromRotationMatrix(parentMatrix).invert().multiply(cameraQuaternion).multiply(viewTurn);
}

// Actual view-space depth, measured against the authored head/tail span.
// Works at every fitted scale/DPR and follows camera changes without CPU skinning.
export const whaleDepthMistGLSL = `
float whaleDepthMist(vec3 viewPosition, mat4 modelView) {
 float headDepth=-(modelView*vec4(-3.7,0.,0.,1.)).z;
 float tailDepth=-(modelView*vec4(3.4,0.,0.,1.)).z;
 float span=max(abs(tailDepth-headDepth),length(modelView[0].xyz)*1.5);
 float nearDepth=min(headDepth,tailDepth);
 return smoothstep(nearDepth+span*.12,nearDepth+span*1.12,-viewPosition.z);
}
`;
