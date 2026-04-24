/**
 * @fileoverview WebGL Fluid Background for Authentication Screen
 */

const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;

  // Simple pseudo-random function
  float random(in vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  // 2D Noise
  float noise(in vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);

      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));

      vec2 u = f * f * (3.0 - 2.0 * f);

      return mix(a, b, u.x) +
             (c - a) * u.y * (1.0 - u.x) +
             (d - b) * u.x * u.y;
  }

  // Fractal Brownian Motion (5 Octaves)
  #define OCTAVES 5
  float fbm(in vec2 st) {
      float value = 0.0;
      float amplitude = 0.5;
      vec2 shift = vec2(100.0);
      mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
      for (int i = 0; i < OCTAVES; i++) {
          value += amplitude * noise(st);
          st = rot * st * 2.0 + shift;
          amplitude *= 0.5;
      }
      return value;
  }

  void main() {
      vec2 st = gl_FragCoord.xy / u_resolution.xy;
      st.x *= u_resolution.x / u_resolution.y;

      vec2 center = vec2(0.5 * (u_resolution.x / u_resolution.y), 0.5);
      
      // Mouse distortion
      vec2 mouseNorm = u_mouse / u_resolution.xy;
      mouseNorm.x *= u_resolution.x / u_resolution.y;
      
      vec2 diff = st - mouseNorm;
      float dist = length(diff);
      
      // Bend st towards mouse
      float bend = smoothstep(0.6, 0.0, dist);
      vec2 distortedSt = st - diff * bend * 0.4;
      
      // Scale down for organic flow
      distortedSt *= 3.0;

      // Domain warping: fbm(p + fbm(p + fbm(p)))
      vec2 q = vec2(0.0);
      q.x = fbm(distortedSt + 0.05 * u_time);
      q.y = fbm(distortedSt + vec2(1.0));

      vec2 r = vec2(0.0);
      r.x = fbm(distortedSt + 1.0 * q + vec2(1.7, 9.2) + 0.15 * u_time);
      r.y = fbm(distortedSt + 1.0 * q + vec2(8.3, 2.8) + 0.126 * u_time);

      float f = fbm(distortedSt + r);

      // Deep blacks with warm amber and gold tones (#EAAF26)
      // vec3(0.917, 0.686, 0.149) is approximately #EAAF26
      vec3 color = mix(
          vec3(0.02, 0.015, 0.01), // Deep black-brown base
          vec3(0.917, 0.686, 0.149), // Gold accent
          clamp((f * f) * 1.5, 0.0, 1.0)
      );
      
      // Midtones
      color = mix(
          color,
          vec3(0.4, 0.15, 0.02),
          clamp(length(q) * 0.6, 0.0, 1.0)
      );

      // Add warmth
      color += vec3(0.8, 0.3, 0.0) * (f * f * f * f);

      // Radial vignette to keep edges dark
      float vignette = 1.0 - smoothstep(0.2, 1.2, length(st - center));
      color *= vignette;

      gl_FragColor = vec4(color, 1.0);
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function initAuthBackground() {
  const canvas = document.getElementById('auth-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return;
  }

  gl.useProgram(program);

  // Full viewport quad
  const vertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
  const timeLocation = gl.getUniformLocation(program, 'u_time');
  const mouseLocation = gl.getUniformLocation(program, 'u_mouse');

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let targetMouseX = mouseX;
  let targetMouseY = mouseY;

  window.addEventListener('mousemove', (e) => {
    targetMouseX = e.clientX;
    targetMouseY = window.innerHeight - e.clientY; // WebGL uses bottom-left origin
  });

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
  }

  window.addEventListener('resize', resize);
  resize();

  let animationFrameId;
  const startTime = Date.now();

  function render() {
    const authScreen = document.getElementById('auth-screen');
    // Only render if auth screen is open or visible (not fully hidden by css)
    // To be safe, we just render if display !== none
    const isVisible = window.getComputedStyle(authScreen).display !== 'none';
    
    if (isVisible) {
      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      const elapsed = (Date.now() - startTime) / 1000.0;
      gl.uniform1f(timeLocation, elapsed);
      gl.uniform2f(mouseLocation, mouseX, mouseY);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    
    animationFrameId = requestAnimationFrame(render);
  }

  render();

  return () => {
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', resize);
  };
}
