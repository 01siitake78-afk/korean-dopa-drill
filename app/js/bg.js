// Full-screen WebGL backdrop: sunburst rays that grow into a rainbow tunnel of
// Dopakichi silhouettes. Falls back to a CSS conic gradient without WebGL.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
const FRAG = `precision highp float;
uniform vec2 uRes; uniform vec2 uCenter; uniform float uTime, uE, uKick, uFlash, uReach, uHue;
vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h*6. + vec3(0.,4.,2.), 6.) - 3.) - 1., 0., 1.); return v * mix(vec3(1.), k, s); }
// Dopakichi head silhouette: a wide rounded head with large side ears.
float dopa(vec2 p){
  vec2 q = (p - vec2(0., -0.02)) / vec2(0.2, 0.15);
  float h = (length(q) - 1.) * 0.15;
  float e1 = length(p - vec2(-0.26, 0.01)) - 0.11;
  float e2 = length(p - vec2(0.26, 0.01)) - 0.11;
  return min(h, min(e1, e2));
}
void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = (fc - uCenter) / uRes.y;
  float E = uE; float t = uTime;
  p *= 1. - 0.06 * uKick * smoothstep(.35, .6, E);
  float r = length(p); float a = atan(p.y, p.x);
  float nr = floor(mix(10., 20., clamp(E, 0., 1.))) ;
  float tw = sin(r * 6. - t * 1.5) * 0.25 * smoothstep(.6, 1., E);
  float rs = sin(a * nr + t * (0.12 + 0.55 * E) + tw);
  float ray = smoothstep(-0.06, 0.06, rs);
  float sat = smoothstep(.15, .75, E);
  vec3 cA = mix(vec3(1., .975, .93), vec3(.24, .43, 1.), sat);
  vec3 cB = mix(vec3(1., .93, .96), vec3(1., .5, .72), sat);
  vec3 col = mix(cA, cB, ray);
  float rb = smoothstep(.55, .95, E);
  vec3 rain = hsv(fract(a / 6.2832 + t * 0.07 + r * 0.25 + uHue), .62, 1.);
  col = mix(col, mix(rain, rain * .7 + .3, ray), rb * .75);
  // Beat rings travelling outward
  float rings = smoothstep(.35, .7, E) * smoothstep(0.035, 0., abs(fract(r * 2.4 - t * 0.8) - .5) - .45);
  col = mix(col, vec3(1.), rings * .55);
  // Tunnel of Dopakichi faces
  float tn = smoothstep(.82, 1.08, E);
  if (tn > 0.001) {
    vec2 uv = vec2(a / 6.2832 * 10., 0.32 / (r + .015) + t * (1.2 + .8 * max(0., E - 1.)));
    vec2 cell = floor(uv); vec2 f = fract(uv) - .5;
    f.x += .5 * mod(cell.y, 2.) - .25;
    float d = dopa(vec2(f.x, -f.y) * 1.1);
    vec3 sc = hsv(fract((cell.x * .11 + cell.y * .17) + t * .25 + uHue), .7, 1.);
    float m = smoothstep(.015, -.015, d) * smoothstep(.02, .22, r);
    float ol = smoothstep(.03, 0., abs(d + .012)) * smoothstep(.02, .22, r);
    col = mix(col, sc, tn * m);
    col = mix(col, vec3(.1, .11, .3), tn * ol * .8);
  }
  col += vec3(1., .96, .85) * exp(-r * r * 14.) * (.25 + .6 * uKick * E);
  col = mix(col, col * vec3(.16, .12, .32), uReach * smoothstep(.08, .5, r));
  col = mix(col, vec3(1.), clamp(uFlash, 0., 1.));
  float alpha = smoothstep(.1, .3, E) * (.32 + .68 * smoothstep(.3, .62, E));
  alpha = max(alpha, uReach * .88);
  alpha = max(alpha, clamp(uFlash, 0., 1.));
  gl_FragColor = vec4(col * alpha, alpha);
}`;

export class Backdrop {
  constructor(canvas, fallback) {
    this.canvas = canvas;
    this.fallback = fallback;
    this.state = { E: 0, kick: 0, flash: 0, reach: 0, hue: 0, cx: 0, cy: 0 };
    this.gl = null;
    try { this.init(); } catch (e) { console.warn('webgl off', e); this.gl = null; }
    if (!this.gl) { canvas.style.display = 'none'; fallback.style.display = 'block'; }
  }
  init() {
    const gl = this.canvas.getContext('webgl', { antialias: false, premultipliedAlpha: true, alpha: true, powerPreference: 'high-performance' });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uRes', 'uCenter', 'uTime', 'uE', 'uKick', 'uFlash', 'uReach', 'uHue']) this.u[n] = gl.getUniformLocation(prog, n);
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.gl = null; this.canvas.style.display = 'none'; this.fallback.style.display = 'block'; });
  }
  resize() {
    const dpr = Math.min(1.25, window.devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr); const h = Math.round(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr;
  }
  render(t) {
    const s = this.state;
    if (!this.gl) {
      const f = this.fallback;
      f.style.opacity = String(Math.min(1, Math.max(s.reach * 0.8, (s.E - 0.12) * 2)));
      f.style.transform = `rotate(${(t / 1000) * (8 + 40 * s.E)}deg) scale(${1 + s.kick * 0.04})`;
      f.style.filter = s.E > 0.6 ? `hue-rotate(${(t / 20) % 360}deg)` : 'none';
      return;
    }
    this.resize();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uCenter, s.cx * this.dpr, s.cy * this.dpr);
    gl.uniform1f(this.u.uTime, t / 1000);
    gl.uniform1f(this.u.uE, s.E);
    gl.uniform1f(this.u.uKick, s.kick);
    gl.uniform1f(this.u.uFlash, s.flash);
    gl.uniform1f(this.u.uReach, s.reach);
    gl.uniform1f(this.u.uHue, s.hue);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
