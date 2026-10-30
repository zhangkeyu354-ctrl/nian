import { Color, type MeshPhysicalMaterial } from "three";
import { dicePaintColors } from "./dice-paint-colors.ts";

/** Object-space paint, shared by every face and rounded edge. Only the body
 * material is painted: the separate ivory pip wells remain completely clear. */
export function applyDicePaint(material: MeshPhysicalMaterial, base: string) {
  const colors = dicePaintColors(base).map((c) => new Color(c));
  material.onBeforeCompile = (shader) => {
    colors.forEach((color, i) => {
      shader.uniforms["maPaint" + i] = { value: color };
    });
    shader.vertexShader =
      "varying vec3 maPaintPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nmaPaintPosition=position;",
    );
    shader.fragmentShader =
      `
varying vec3 maPaintPosition;
uniform vec3 maPaint0;
uniform vec3 maPaint1;
uniform vec3 maPaint2;
float maBlob(vec3 p,vec3 center,vec3 size,float phase){
  vec3 d=(p-center)/size;
  float wobble=.13*sin(p.x*19.+p.y*12.+phase)*sin(p.z*15.-p.y*18.+phase);
  float edge=length(d)+wobble;
  float aa=clamp(fwidth(edge)*.8,.008,.05);
  return 1.-smoothstep(1.-aa,1.+aa,edge);
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `
#include <color_fragment>
vec3 p=maPaintPosition;
float paintA=max(maBlob(p,vec3(-.43,.43,.32),vec3(.23,.20,.39),1.2),
                 maBlob(p,vec3(.44,-.29,.45),vec3(.16,.31,.19),2.5));
paintA=max(paintA,maBlob(p,vec3(.10,.43,-.46),vec3(.35,.21,.15),1.8));
float paintB=max(maBlob(p,vec3(.46,.36,-.30),vec3(.18,.24,.36),3.1),
                 maBlob(p,vec3(-.35,-.46,.36),vec3(.28,.18,.28),4.7));
float paintC=max(maBlob(p,vec3(-.46,-.18,-.43),vec3(.17,.35,.20),2.2),
                 maBlob(p,vec3(.34,.48,.40),vec3(.22,.18,.28),5.1));
diffuseColor.rgb=mix(diffuseColor.rgb,maPaint0,paintA);
diffuseColor.rgb=mix(diffuseColor.rgb,maPaint1,paintB);
diffuseColor.rgb=mix(diffuseColor.rgb,maPaint2,paintC);
`,
    );
  };
  material.customProgramCacheKey = () => "ma-dice-paint-v2";
  return (next: string) => {
    material.color.set(next);
    dicePaintColors(next).forEach((value, i) => colors[i].set(value));
  };
}
