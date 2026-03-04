// =============================================================================
// "Flow Background" – WebGL2 recreation
//
// Pipeline:
//   Pass 0 → Gradient          → fb_gradient (texture)
//   Pass 1 → MouseDraw update  → fb_ping / fb_pong  (ping-pong)
//   Pass 2 → MouseDraw blend   → fb_blend   (reads gradient + latest ping-pong)
//   Pass 3 → FBM distortion    → screen     (reads fb_blend)
// =============================================================================

export function init(canvas) {
  "use strict";

  // --------------------------------------------------------------------------
  // Canvas / GL
  // --------------------------------------------------------------------------
  const gl = canvas.getContext("webgl2", { antialias: false });

  if (!gl) {
    console.error("WebGL2 is required – please use a modern browser.");
    return null;
  }

  // --------------------------------------------------------------------------
  // Detect page background color
  // --------------------------------------------------------------------------
  function readBgColor() {
    for (const el of [document.documentElement, document.body]) {
      const c = getComputedStyle(el).backgroundColor;
      if (c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)") {
        const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
      }
    }
    return [0, 0, 0];
  }
  let bgColor = readBgColor();
  // Perceived luminance (BT.601)
  let bgLuminance = bgColor[0] * 0.299 + bgColor[1] * 0.587 + bgColor[2] * 0.114;

  function readAccentColor() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--s-accent").trim();
    // parse hex (#rrggbb or #rgb) or rgb(...)
    if (raw.startsWith("#")) {
      const hex = raw.length === 4 ? raw.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : raw;
      const n = parseInt(hex.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    return [0, 0.831, 1.0]; // fallback: #00d4ff
  }
  let accentColor = readAccentColor();

  function refreshColors() {
    const newBg = readBgColor();
    bgColor[0] = newBg[0];
    bgColor[1] = newBg[1];
    bgColor[2] = newBg[2];
    bgLuminance = newBg[0] * 0.299 + newBg[1] * 0.587 + newBg[2] * 0.114;
    const newAccent = readAccentColor();
    accentColor[0] = newAccent[0];
    accentColor[1] = newAccent[1];
    accentColor[2] = newAccent[2];
  }

  function onThemeChange() {
    // Wait 1s for CSS transitions and data-theme variables to fully settle
    setTimeout(refreshColors, 300);
  }

  window.addEventListener("app-theme-change", onThemeChange);

  // --------------------------------------------------------------------------
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  function compileShader(src, type) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("Shader error:", gl.getShaderInfoLog(sh), "\n", src.slice(0, 300));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function createProgram(vsSrc, fsSrc) {
    const vs = compileShader(vsSrc, gl.VERTEX_SHADER);
    const fs = compileShader(fsSrc, gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Link error:", gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  // Try to use half-float for better precision; fall back to RGBA8
  const extCBF =
    gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float");
  const USE_FLOAT = !!extCBF;

  function createTexture(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (USE_FLOAT) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function createFBO(w, h) {
    const tex = createTexture(w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  function resizeFBO(fbo, w, h) {
    gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
    if (USE_FLOAT) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    fbo.w = w;
    fbo.h = h;
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  // --------------------------------------------------------------------------
  // Fullscreen quad
  // --------------------------------------------------------------------------
  const quadVerts = new Float32Array([
    -1, -1, 0, 0, 0, 1, -1, 0, 1, 0, -1, 1, 0, 0, 1, 1, 1, 0, 1, 1,
  ]);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

  function bindQuad(prog) {
    const posLoc = gl.getAttribLocation(prog, "aVertexPosition");
    const uvLoc = gl.getAttribLocation(prog, "aTextureCoord");
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 20, 0);
    if (uvLoc >= 0) {
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 20, 12);
    }
  }

  function setUniMatrices(prog) {
    const mv = gl.getUniformLocation(prog, "uMVMatrix");
    const p = gl.getUniformLocation(prog, "uPMatrix");
    const tm = gl.getUniformLocation(prog, "uTextureMatrix");
    if (mv) gl.uniformMatrix4fv(mv, false, identity);
    if (p) gl.uniformMatrix4fv(p, false, identity);
    if (tm) gl.uniformMatrix4fv(tm, false, identity);
  }

  // --------------------------------------------------------------------------
  // Vertex shaders (two variants – with and without uTextureMatrix)
  // --------------------------------------------------------------------------
  const VS_SIMPLE = `#version 300 es
precision mediump float;
in vec3 aVertexPosition;
in vec2 aTextureCoord;
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
out vec2 vTextureCoord;
out vec3 vVertexPosition;
void main() {
  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
  vTextureCoord = aTextureCoord;
  vVertexPosition = aVertexPosition;
}`;

  const VS_TEXMAT = `#version 300 es
precision mediump float;
in vec3 aVertexPosition;
in vec2 aTextureCoord;
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
uniform mat4 uTextureMatrix;
out vec2 vTextureCoord;
out vec3 vVertexPosition;
void main() {
  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
  vTextureCoord = (uTextureMatrix * vec4(aTextureCoord, 0.0, 1.0)).xy;
  vVertexPosition = aVertexPosition;
}`;

  // --------------------------------------------------------------------------
  // Fragment shaders
  // --------------------------------------------------------------------------

  // Pass 0 – gradient (uses page background color)
  const FS_GRADIENT = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform float uTime;
uniform vec2 uMousePos;
uniform vec3 uBgColor;
uniform float uBgLuminance;

vec3 getColor(int index) {
  // For dark bg: stop0 is lighter. For light bg: stop0 is darker/tinted.
  vec3 variant = uBgLuminance > 0.5
    ? max(uBgColor * 0.70, vec3(0.0))          // darken on light bg
    : min(uBgColor * 1.6 + vec3(0.05), vec3(1.0)); // lighten on dark bg
  switch(index) {
    case 0: return variant;
    case 1: return uBgColor;
    case 2: return uBgColor;
    default: return vec3(0.0);
  }
}
float getStop(int index) {
  switch(index) {
    case 0: return 0.0000;
    case 1: return 0.5000;
    case 2: return 1.0000;
    default: return 0.0;
  }
}
const float PI = 3.14159265;
vec2 rotate(vec2 coord, float angle) {
  float s = sin(angle); float c = cos(angle);
  return vec2(coord.x*c - coord.y*s, coord.x*s + coord.y*c);
}
float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233)))*43758.5453); }
vec3 linear_from_srgb(vec3 rgb) { return pow(rgb, vec3(2.2)); }
vec3 srgb_from_linear(vec3 lin) { return pow(lin, vec3(1.0/2.2)); }
vec3 oklab_mix(vec3 lin1, vec3 lin2, float a) {
  const mat3 kCONEtoLMS = mat3(
    0.4121656120,0.2118591070,0.0883097947,
    0.5362752080,0.6807189584,0.2818474174,
    0.0514575653,0.1074065790,0.6302613616);
  const mat3 kLMStoCONE = mat3(
    4.0767245293,-1.2681437731,-0.0041119885,
    -3.3072168827,2.6093323231,-0.7034763098,
    0.2307590544,-0.3411344290,1.7068625689);
  vec3 lms1 = pow(kCONEtoLMS*lin1, vec3(1.0/3.0));
  vec3 lms2 = pow(kCONEtoLMS*lin2, vec3(1.0/3.0));
  vec3 lms = mix(lms1, lms2, a);
  lms *= 1.0 + 0.025 * a * (1.0-a);
  return kLMStoCONE * (lms*lms*lms);
}
vec3 getGradientColor(float position) {
  position = clamp(position, 0.0, 1.0);
  for (int i = 0; i < 2; i++) {
    float cp  = getStop(i);
    float ncp = getStop(i+1);
    if (position <= ncp) {
      float mf = (position - cp) / (ncp - cp);
      vec3 ls = linear_from_srgb(getColor(i));
      vec3 le = linear_from_srgb(getColor(i+1));
      return srgb_from_linear(oklab_mix(ls, le, mf));
    }
  }
  return getColor(2);
}
out vec4 fragColor;
vec3 applyColorToPosition(float position) {
  vec3 color;
  position -= (uTime * 0.01 + 0.0);
  float cycle = floor(position);
  bool rev = int(cycle) % 2 == 0;
  float ap = rev ? 1.0 - fract(position) : fract(position);
  color = getGradientColor(ap);
  float dither = rand(gl_FragCoord.xy) * 0.005;
  color += dither;
  return color;
}
vec3 linearGrad(vec2 uv) { return applyColorToPosition(uv.x + 0.5); }
vec3 getGradient(vec2 uv) { return linearGrad(uv); }
vec3 getCol(vec2 uv) { return getGradient(uv); }
void main() {
  vec2 uv  = vTextureCoord;
  vec2 pos = vec2(0.5,0.5) + mix(vec2(0.0),(uMousePos-0.5),0.0);
  uv -= pos;
  uv /= (0.5*2.0);
  uv  = rotate(uv, (0.0783 - 0.5) * 2.0 * PI);
  fragColor = vec4(getCol(uv), 1.0);
}`;

  // Pass 1A – mouse-trail ping-pong update
  const FS_PINGPONG = `#version 300 es
precision highp float;
in vec3 vVertexPosition;
in vec2 vTextureCoord;
uniform sampler2D uPingPongTexture;
uniform vec2 uPreviousMousePos;
uniform float uTime;
uniform vec2 uMousePos;
uniform vec2 uResolution;

const float PI = 3.1415926;
const float TWOPI = 6.2831852;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
  vec4 p = mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q = mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d = q.x - min(q.w,q.y); float e = 1.0e-10;
  return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)), d/(q.x+e), q.x);
}
mat2 rot(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
vec2 angleToDir(float angle) { float rad = angle*2.0*PI; return vec2(cos(rad),sin(rad)); }
vec2 liquify(vec2 st, vec2 dir) {
  float ar = uResolution.x/uResolution.y;
  st.x *= ar;
  float amp = 0.0025; float freq = 6.0;
  for (float i = 1.0; i <= 5.0; i++) {
    st = st * rot(i/5.0*PI*2.0);
    st += vec2(
      amp * cos(i*freq*st.y + uTime*0.02*dir.x),
      amp * sin(i*freq*st.x + uTime*0.02*dir.y)
    );
  }
  st.x /= ar;
  return st;
}
vec3 calculateTrailContribution(vec2 mousePos, vec2 prevMousePos, vec2 uv, vec2 correctedUv, float ar, float radius) {
  vec2 dir = (mousePos - prevMousePos)*vec2(ar,1.0);
  float angle = atan(dir.y, dir.x);
  if (angle < 0.0) angle += TWOPI;
  vec2 mouseVec = mousePos - prevMousePos;
  float mouseLen = length(mouseVec);
  vec2 mouseDir = mouseLen > 0.0 ? mouseVec/mouseLen : vec2(0.0);
  vec2 posToUv = (correctedUv - prevMousePos)*vec2(ar,1.0);
  float projection = clamp(dot(posToUv, mouseDir*vec2(ar,1.0)), 0.0, mouseLen*ar);
  vec2 closestPoint = prevMousePos*vec2(ar,1.0) + mouseDir*vec2(ar,1.0)*projection;
  float distanceToLine = distance(correctedUv, closestPoint);
  float s = (1.0+radius)/(distanceToLine+radius)*radius;
  vec3 color = vec3(angle/TWOPI, 1.0, 1.0);
  vec3 pointColor = hsv2rgb(color);
  pointColor = pow(pointColor, vec3(2.2));
  float intensity = pow(s, 10.0*(1.0 - 0.5 + 0.1));
  return pointColor * intensity;
}
out vec4 fragColor;
void main() {
  float ar = uResolution.x/uResolution.y;
  vec2 uv = vTextureCoord;
  vec2 correctedUv = uv * vec2(ar, 1.0);

  vec3 lastFrameColor = texture(uPingPongTexture, uv).rgb;
  vec3 lastFrameColorGamma = pow(lastFrameColor, vec3(2.2));
  vec3 hsv = rgb2hsv(lastFrameColor);
  vec3 hsvGamma = rgb2hsv(lastFrameColorGamma);
  vec2 prevDir = angleToDir(hsv.x);
  float prevStrength = hsvGamma.z;

  vec2 dir = (uMousePos - uPreviousMousePos)*vec2(ar,1.0);
  float dist = length(dir);
  float blurAmount = 0.03 * prevStrength;
  uv = uv - prevDir * blurAmount;
  uv = mix(uv, liquify(uv - prevDir*0.005, prevDir), (1.0 - prevStrength)*0.25);
  lastFrameColor = texture(uPingPongTexture, uv).rgb;
  lastFrameColor = pow(lastFrameColor, vec3(2.2));

  int numPoints = int(max(12.0, dist*24.0));
  float speedFactor = clamp(dist, 0.7, 1.3);
  float radius = mix(0.1, 0.7, 0.528 * speedFactor);

  vec3 trailColor = vec3(0.0);
  int iter = min(numPoints, 24);
  for (int i = 0; i <= iter; i++) {
    float t = float(i)/float(numPoints);
    vec2 interpPos = mix(uPreviousMousePos, uMousePos, t);
    vec2 prevInterpPos = i > 0
      ? mix(uPreviousMousePos, uMousePos, float(i-1)/float(numPoints))
      : uPreviousMousePos;
    trailColor += calculateTrailContribution(interpPos, prevInterpPos, uv, correctedUv, ar, radius);
  }
  trailColor = trailColor / float(min(numPoints, 50)+1);

  vec3 blurredLastFrame = vec3(0.0);
  float clampedDist = clamp(length(trailColor)*dist, 0.0, 1.0);
  float blurRadius = 0.005;
  blurredLastFrame += pow(texture(uPingPongTexture, uv+vec2(blurRadius,0.0)).rgb,  vec3(2.2))*0.2;
  blurredLastFrame += pow(texture(uPingPongTexture, uv+vec2(-blurRadius,0.0)).rgb, vec3(2.2))*0.2;
  blurredLastFrame += pow(texture(uPingPongTexture, uv+vec2(0.0,blurRadius)).rgb,  vec3(2.2))*0.2;
  blurredLastFrame += pow(texture(uPingPongTexture, uv+vec2(0.0,-blurRadius)).rgb, vec3(2.2))*0.2;
  blurredLastFrame += lastFrameColor * 0.2;

  vec3 draw = mix(blurredLastFrame, trailColor, clampedDist);
  draw *= pow(0.5, 0.2);
  draw = pow(draw, vec3(1.0/2.2));
  fragColor = vec4(draw, 1.0);
}`;

  // Pass 1B – composite mouse trail over gradient background
  const FS_BLEND = `#version 300 es
precision highp float;
precision highp int;
in vec2 vTextureCoord;
in vec3 vVertexPosition;
uniform sampler2D uTexture;
uniform sampler2D uPingPongTexture;
uniform vec3 uTintColor;
uniform float uBgLuminance;

uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y*v.y*1664525u + 1013904223u;
  v.y += v.x*v.x*1664525u + 1013904223u;
  v ^= v >> 16u;
  v.x += v.y*v.y*1664525u + 1013904223u;
  v.y += v.x*v.x*1664525u + 1013904223u;
  return v;
}
float randFibo(vec2 p) {
  uvec2 v = floatBitsToUint(p);
  v = pcg2d(v);
  uint r = v.x ^ v.y;
  return float(r)/float(0xffffffffu);
}
const float PI = 3.1415926;
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);
  vec4 p = mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q = mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d = q.x - min(q.w,q.y); float e = 1.0e-10;
  return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)), d/(q.x+e), q.x);
}
vec2 angleToDir(float angle) { float rad = angle*2.0*PI; return vec2(cos(rad),sin(rad)); }
out vec4 fragColor;
void main() {
  vec2 uv = vTextureCoord;
  vec3 mouseRgb   = texture(uPingPongTexture, uv).rgb;
  vec3 mouseTrail = rgb2hsv(mouseRgb);
  float strength  = mouseTrail.z * (0.5 * 5.0);
  vec4 bg = texture(uTexture, uv);
  // tint: uses page accent color via uTintColor uniform
  vec3 tintedTrail = vec3(strength * mix(mouseRgb, uTintColor, 0.5));
  float dither = (randFibo(gl_FragCoord.xy) - 0.5) / 255.0;
  // On dark bg: additive (brightens). On light bg: multiply-darken.
  vec3 blendedRgb;
  if (uBgLuminance > 0.5) {
    // Darken: trail subtracts from bg, tinted by accent
    vec3 darkTrail = tintedTrail * 1.8 + dither;
    blendedRgb = bg.rgb * (1.0 - darkTrail) + darkTrail * uTintColor * 0.35;
  } else {
    blendedRgb = tintedTrail + dither + bg.rgb;
  }
  fragColor = vec4(mix(bg.rgb, blendedRgb, mouseTrail.z), 1.0);
}`;

  // Pass 2 – FBM domain-warp distortion
  const FS_FBM = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uMousePos;
uniform vec2 uResolution;

float ease(int ef, float t) { return t; }
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031,0.11369,0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(vec3((p3.x+p3.y)*p3.z,(p3.x+p3.z)*p3.y,(p3.y+p3.z)*p3.x));
}
float perlin_noise(vec3 p) {
  vec3 pi = floor(p); vec3 pf = p - pi;
  vec3 w = pf*pf*(3.0 - 2.0*pf);
  float n000 = dot(pf-vec3(0,0,0), hash33(pi+vec3(0,0,0)));
  float n100 = dot(pf-vec3(1,0,0), hash33(pi+vec3(1,0,0)));
  float n010 = dot(pf-vec3(0,1,0), hash33(pi+vec3(0,1,0)));
  float n110 = dot(pf-vec3(1,1,0), hash33(pi+vec3(1,1,0)));
  float n001 = dot(pf-vec3(0,0,1), hash33(pi+vec3(0,0,1)));
  float n101 = dot(pf-vec3(1,0,1), hash33(pi+vec3(1,0,1)));
  float n011 = dot(pf-vec3(0,1,1), hash33(pi+vec3(0,1,1)));
  float n111 = dot(pf-vec3(1,1,1), hash33(pi+vec3(1,1,1)));
  float nx00 = mix(n000,n100,w.x); float nx01 = mix(n001,n101,w.x);
  float nx10 = mix(n010,n110,w.x); float nx11 = mix(n011,n111,w.x);
  float nxy0 = mix(nx00,nx10,w.y); float nxy1 = mix(nx01,nx11,w.y);
  return mix(nxy0,nxy1,w.z);
}
const float PI = 3.14159265359;
// rotHalf: pre-computed rotation matrix for 0.5 radians
// cos(0.5)=0.87758256, sin(0.5)=0.47942554
const mat2 rotHalf = mat2(0.87758256, 0.47942554, -0.47942554, 0.87758256);
mat2 rot(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float fbm(in vec3 st) {
  float value = 0.0; float amp = 0.25;
  float aM = (0.1 + 0.76 * 0.65);
  vec2 shift = vec2(100.0);
  for (int i = 0; i < 6; i++) {
    value += amp * perlin_noise(st);
    st.xy = rotHalf * st.xy * 2.5 + shift;
    amp *= aM;
  }
  return value;
}
out vec4 fragColor;
void main() {
  vec2 uv = vTextureCoord;
  float ar = uResolution.x / uResolution.y;
  float multiplier = 6.0 * (0.15 / ((ar + 1.0) / 2.0));
  vec2 mPos  = vec2(0.568564, 0.651100) + mix(vec2(0.0),(uMousePos-0.5),0.0);
  vec2 pos   = mix(vec2(0.568564, 0.651100), mPos, floor(1.0));
  float mDist = ease(0, max(0.0, 1.0 - distance(uv*vec2(ar,1), mPos*vec2(ar,1)) * 4.0 * (1.0 - 1.0)));
  vec2 st = ((uv - pos) * vec2(ar,1)) * multiplier * ar;
  st = rot(0.135 * -1.0 * 2.0 * PI) * st;
  vec2 drift = vec2(uTime * 0.005) * (0.72 * 2.0);
  float time  = uTime * 0.025;
  vec2 r = vec2(
    fbm(vec3(st - drift + vec2(1.7, 9.2), time)),
    fbm(vec3(st - drift + vec2(8.2, 1.3), time))
  );
  float f = fbm(vec3(st + r - drift, time)) * 0.31;
  vec2 offset = (f * 2.0 + (r * 0.31));
  vec4 color = texture(uTexture, uv + offset * mDist);
  fragColor = color;
}`;

  // --------------------------------------------------------------------------
  // Programs
  // --------------------------------------------------------------------------
  const programs = {
    gradient: createProgram(VS_SIMPLE, FS_GRADIENT),
    pingpong: createProgram(VS_SIMPLE, FS_PINGPONG),
    blend: createProgram(VS_TEXMAT, FS_BLEND),
    fbm: createProgram(VS_TEXMAT, FS_FBM),
  };

  // --------------------------------------------------------------------------
  // Framebuffers
  // --------------------------------------------------------------------------
  let W = canvas.clientWidth | 0;
  let H = canvas.clientHeight | 0;

  canvas.width = W;
  canvas.height = H;

  // Gradient renders at 0.5 downsample → half res
  let fb_gradient = createFBO(W >> 1, H >> 1);
  // Ping-pong mouse trail 0.5 downsample
  let pingpong = [createFBO(W >> 1, H >> 1), createFBO(W >> 1, H >> 1)];
  // Blend composite (full res — resamples from half-res textures)
  let fb_blend = createFBO(W, H);
  let pp = 0; // current ping-pong read index

  // --------------------------------------------------------------------------
  // Input state
  // --------------------------------------------------------------------------
  let mousePos = { x: 0.5, y: 0.5 };
  let prevMouse = { x: 0.5, y: 0.5 };
  let startTime = performance.now();

  // --------------------------------------------------------------------------
  // Resize
  // --------------------------------------------------------------------------
  function resize() {
    W = canvas.clientWidth | 0;
    H = canvas.clientHeight | 0;
    canvas.width = W;
    canvas.height = H;
    resizeFBO(fb_gradient, W >> 1, H >> 1);
    resizeFBO(pingpong[0], W >> 1, H >> 1);
    resizeFBO(pingpong[1], W >> 1, H >> 1);
    resizeFBO(fb_blend, W, H);
  }

  // --------------------------------------------------------------------------
  // Input handlers
  // --------------------------------------------------------------------------
  function onMouseMove(e) {
    const r = canvas.getBoundingClientRect();
    mousePos.x = (e.clientX - r.left) / r.width;
    mousePos.y = 1.0 - (e.clientY - r.top) / r.height;
  }
  function onTouchMove(e) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const t = e.touches[0];
    mousePos.x = (t.clientX - r.left) / r.width;
    mousePos.y = 1.0 - (t.clientY - r.top) / r.height;
  }

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("resize", resize);

  // --------------------------------------------------------------------------
  // Render helpers
  // --------------------------------------------------------------------------
  function renderTo(fbo) {
    if (fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
      gl.viewport(0, 0, fbo.w, fbo.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
    }
  }

  function useTexture(unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  // --------------------------------------------------------------------------
  // Render loop
  // --------------------------------------------------------------------------
  let rafId;
  function render() {
    const now = performance.now();
    const time = (now - startTime) * 0.001; // seconds

    // ---- Pass 0: gradient --------------------------------
    const gProg = programs.gradient;
    gl.useProgram(gProg);
    bindQuad(gProg);
    setUniMatrices(gProg);
    gl.uniform1f(gl.getUniformLocation(gProg, "uTime"), time);
    gl.uniform2f(gl.getUniformLocation(gProg, "uMousePos"), mousePos.x, mousePos.y);
    gl.uniform3f(gl.getUniformLocation(gProg, "uBgColor"), bgColor[0], bgColor[1], bgColor[2]);
    gl.uniform1f(gl.getUniformLocation(gProg, "uBgLuminance"), bgLuminance);
    renderTo(fb_gradient);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ---- Pass 1A: ping-pong mouse trail update -----------
    const ppProg = programs.pingpong;
    const ppWrite = 1 - pp;
    gl.useProgram(ppProg);
    bindQuad(ppProg);
    setUniMatrices(ppProg);
    useTexture(0, pingpong[pp].tex);
    gl.uniform1i(gl.getUniformLocation(ppProg, "uPingPongTexture"), 0);
    gl.uniform1f(gl.getUniformLocation(ppProg, "uTime"), time);
    gl.uniform2f(gl.getUniformLocation(ppProg, "uMousePos"), mousePos.x, mousePos.y);
    gl.uniform2f(gl.getUniformLocation(ppProg, "uPreviousMousePos"), prevMouse.x, prevMouse.y);
    gl.uniform2f(gl.getUniformLocation(ppProg, "uResolution"), W, H);
    renderTo(pingpong[ppWrite]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    pp = ppWrite;

    // ---- Pass 1B: blend gradient + mouse trail ----------
    const blProg = programs.blend;
    gl.useProgram(blProg);
    bindQuad(blProg);
    setUniMatrices(blProg);
    useTexture(0, fb_gradient.tex);
    useTexture(1, pingpong[pp].tex);
    gl.uniform1i(gl.getUniformLocation(blProg, "uTexture"), 0);
    gl.uniform1i(gl.getUniformLocation(blProg, "uPingPongTexture"), 1);
    gl.uniform3f(
      gl.getUniformLocation(blProg, "uTintColor"),
      accentColor[0],
      accentColor[1],
      accentColor[2],
    );
    gl.uniform1f(gl.getUniformLocation(blProg, "uBgLuminance"), bgLuminance);
    renderTo(fb_blend);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ---- Pass 2: FBM distortion → screen ----------------
    const fbmProg = programs.fbm;
    gl.useProgram(fbmProg);
    bindQuad(fbmProg);
    setUniMatrices(fbmProg);
    useTexture(0, fb_blend.tex);
    gl.uniform1i(gl.getUniformLocation(fbmProg, "uTexture"), 0);
    gl.uniform1f(gl.getUniformLocation(fbmProg, "uTime"), time);
    gl.uniform2f(gl.getUniformLocation(fbmProg, "uMousePos"), mousePos.x, mousePos.y);
    gl.uniform2f(gl.getUniformLocation(fbmProg, "uResolution"), W, H);
    renderTo(null);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // track previous mouse
    prevMouse.x = mousePos.x;
    prevMouse.y = mousePos.y;

    rafId = requestAnimationFrame(render);
  }

  rafId = requestAnimationFrame(render);

  return function destroy() {
    cancelAnimationFrame(rafId);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("resize", resize);
    window.removeEventListener("app-theme-change", onThemeChange);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  };
}
