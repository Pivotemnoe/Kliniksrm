import { useEffect, useRef } from "react";
const vertex =
  "attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*.5;gl_Position=vec4(position,0.,1.);}";
const fragment = `precision mediump float;varying vec2 uv;uniform sampler2D portrait;uniform vec4 eyeA;uniform vec4 eyeB;uniform vec2 gaze;vec2 warp(vec2 at,vec4 eye){float d=length((at-eye.xy)/eye.zw);return gaze*(1.-smoothstep(.42,1.,d));}void main(){gl_FragColor=texture2D(portrait,uv-warp(uv,eyeA)-warp(uv,eyeB));}`;
export function PetPortrait({ src, eyes, alt }) {
  const canvas = useRef(null),
    img = useRef(null),
    holder = useRef(null);
  useEffect(() => {
    const image = img.current,
      surface = canvas.current,
      root = holder.current;
    let gl,
      program,
      texture,
      buffer,
      shaders = [],
      dead = false,
      started = false;
    root.dataset.gaze = "loading";
    function draw(event) {
      if (dead || !gl || !program || gl.isContextLost()) return;
      const { x = 0, y = 0 } = event.detail;
      gl.useProgram(program);
      gl.uniform2f(
        gl.getUniformLocation(program, "gaze"),
        x * 0.0048,
        -y * 0.0028,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      root.dataset.gazeX = x.toFixed(3);
      root.dataset.gazeY = y.toFixed(3);
    }
    function start() {
      if (dead || started || !image.naturalWidth) return;
      started = true;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        root.dataset.gaze = "static";
        return;
      }
      try {
        gl = surface.getContext("webgl", {
          alpha: true,
          premultipliedAlpha: false,
          antialias: false,
          powerPreference: "low-power",
          preserveDrawingBuffer: true,
        });
        if (!gl) throw Error("unavailable");
        const compile = (kind, source) => {
          const s = gl.createShader(kind);
          gl.shaderSource(s, source);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw Error("shader");
          shaders.push(s);
          return s;
        };
        program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw Error("link");
        gl.useProgram(program);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW,
        );
        const loc = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        surface.width = 640;
        surface.height = 960;
        gl.viewport(0, 0, 640, 960);
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        eyes.forEach((eye, i) =>
          gl.uniform4f(
            gl.getUniformLocation(program, i ? "eyeB" : "eyeA"),
            eye[0],
            1 - eye[1],
            eye[2],
            eye[3],
          ),
        );
        draw({ detail: { x: 0, y: 0 } });
        root.dataset.gaze = "ready";
      } catch {
        root.dataset.gaze = "fallback";
      }
    }
    function lost(e) {
      e.preventDefault();
      root.dataset.gaze = "fallback";
    }
    window.addEventListener("grooming:gaze", draw);
    surface.addEventListener("webglcontextlost", lost);
    if (image.complete) start();
    else image.addEventListener("load", start);
    return () => {
      dead = true;
      window.removeEventListener("grooming:gaze", draw);
      surface.removeEventListener("webglcontextlost", lost);
      image.removeEventListener("load", start);
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        shaders.forEach((s) => gl.deleteShader(s));
      }
    };
  }, [src, eyes]);
  return (
    <div className="pet-portrait" ref={holder}>
      <img ref={img} src={src} alt={alt} draggable="false" />
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  );
}
