import { Filter, GlProgram, GpuProgram, UniformGroup, defaultFilterVert } from 'pixi.js';

const glslFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uColor;
uniform float uAlpha;

void main() {
    vec4 sampleColor = texture(uTexture, vTextureCoord);
    // sampleColor.a contiene la iluminación máxima I en [0, 1] combinada mediante blendMode 'max'
    // La oscuridad resultante es (1.0 - I) * uAlpha
    float darkness = clamp(1.0 - sampleColor.a, 0.0, 1.0) * uAlpha;
    finalColor = vec4(uColor * darkness, darkness);
}
`;

const wgslSource = `
struct GlobalFilterUniforms {
  uInputSize:vec4<f32>,
  uInputPixel:vec4<f32>,
  uInputClamp:vec4<f32>,
  uOutputFrame:vec4<f32>,
  uGlobalFrame:vec4<f32>,
  uOutputTexture:vec4<f32>,
};

struct DarknessUniforms {
  uColor:vec3<f32>,
  uAlpha:f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler : sampler;

@group(1) @binding(0) var<uniform> darknessUniforms : DarknessUniforms;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv : vec2<f32>
};

fn filterVertexPosition(aPosition:vec2<f32>) -> vec4<f32>
{
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord( aPosition:vec2<f32> ) -> vec2<f32>
{
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(
  @location(0) aPosition : vec2<f32>, 
) -> VSOutput {
  return VSOutput(
   filterVertexPosition(aPosition),
   filterTextureCoord(aPosition)
  );
}

@fragment
fn mainFragment(
  @location(0) uv: vec2<f32>,
  @builtin(position) position: vec4<f32>
) -> @location(0) vec4<f32> {
    var sampleColor = textureSample(uTexture, uSampler, uv);
    var darkness = clamp(1.0 - sampleColor.a, 0.0, 1.0) * darknessUniforms.uAlpha;
    return vec4<f32>(darknessUniforms.uColor * darkness, darkness);
}
`;

export class DarknessInvertFilter extends Filter {
  private uniforms: {
    uColor: [number, number, number];
    uAlpha: number;
  };

  constructor(colorR = 0, colorG = 0, colorB = 0, alpha = 1.0) {
    const glProgram = GlProgram.from({
      vertex: defaultFilterVert,
      fragment: glslFragment,
      name: 'darkness-invert-filter'
    });

    const gpuProgram = GpuProgram.from({
      vertex: {
        source: wgslSource,
        entryPoint: 'mainVertex'
      },
      fragment: {
        source: wgslSource,
        entryPoint: 'mainFragment'
      }
    });

    const uniforms = {
      uColor: [colorR, colorG, colorB] as [number, number, number],
      uAlpha: alpha
    };

    const uniformGroup = new UniformGroup({
      uColor: { value: new Float32Array(uniforms.uColor), type: 'vec3<f32>' },
      uAlpha: { value: uniforms.uAlpha, type: 'f32' }
    });

    super({
      glProgram,
      gpuProgram,
      resources: {
        darknessUniforms: uniformGroup
      }
    });

    this.uniforms = uniforms;
  }

  public setDarknessColor(r: number, g: number, b: number) {
    this.uniforms.uColor[0] = r;
    this.uniforms.uColor[1] = g;
    this.uniforms.uColor[2] = b;
    const group = this.resources.darknessUniforms as UniformGroup;
    if (group && (group.uniforms as any).uColor) {
      (group.uniforms as any).uColor[0] = r;
      (group.uniforms as any).uColor[1] = g;
      (group.uniforms as any).uColor[2] = b;
    }
  }

  public setDarknessAlpha(alpha: number) {
    this.uniforms.uAlpha = alpha;
    const group = this.resources.darknessUniforms as UniformGroup;
    if (group) {
      (group.uniforms as any).uAlpha = alpha;
    }
  }
}
