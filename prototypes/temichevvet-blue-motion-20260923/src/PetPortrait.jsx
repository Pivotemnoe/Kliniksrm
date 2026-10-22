import { useEffect, useRef } from "react";
import { petEyes, gazeOffset } from "./motion-math.js";

// Render the existing raster unchanged except for bounded, smoothly feathered
// UV displacement inside its two irises. No replacement eyes or drawn pupils.
const vertex = `attribute vec2 position; varying vec2 uv; void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;
const fragment = `precision mediump float;
varying vec2 uv; uniform sampler2D portrait;
uniform vec4 eyeA; uniform vec4 eyeB; uniform vec2 moveA; uniform vec2 moveB;
vec2 gaze(vec2 at,vec4 eye,vec2 delta){float d=length((at-eye.xy)/eye.zw);float weight=1.0-smoothstep(0.48,1.0,d);return delta*weight;}
void main(){vec2 sampleAt=uv-gaze(uv,eyeA,moveA)-gaze(uv,eyeB,moveB);gl_FragColor=texture2D(portrait,sampleAt);}`;
export function PetPortrait({ animal }) {
  const canvasRef = useRef(null),
    imageRef = useRef(null),
    holderRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current,
      img = imageRef.current,
      holder = holderRef.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;
    let gl,
      program,
      buffer,
      texture,
      shaders = [],
      dead = false,
      initialized = false;
    function fallback() {
      holder.dataset.gaze = "fallback";
    }
    function start() {
      if (dead || initialized) return;
      initialized = true;
      try {
        gl = canvas.getContext("webgl", {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          preserveDrawingBuffer: true,
          powerPreference: "low-power",
        });
        if (!gl) {
          fallback();
          return;
        }
        const compile = (type, source) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          shaders.push(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw Error("shader");
          return shader;
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
        const attribute = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        // Source cutouts contain pale RGB in fully transparent pixels.
        // Premultiply before linear sampling so iOS does not show a white
        // checker/halo around the fur when WebGL replaces the fallback image.
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          img,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        petEyes[animal].forEach((eye, i) =>
          gl.uniform4f(
            gl.getUniformLocation(program, i ? "eyeB" : "eyeA"),
            eye[0] / canvas.width,
            1 - eye[1] / canvas.height,
            eye[2] / canvas.width,
            eye[3] / canvas.height,
          ),
        );
        draw({ detail: { x: 0, y: 0, active: false } });
        holder.dataset.gaze = "ready";
      } catch {
        fallback();
      }
    }
    function draw(event) {
      if (!gl || dead || !program) return;
      const { x = 0, y = 0, active = false } = event.detail;
      const off =
        !active ||
        reduced.matches ||
        document.documentElement.dataset.motion === "off";
      const values = petEyes[animal].map((eye) =>
        gazeOffset(off ? 0 : x, off ? 0 : y, eye),
      );
      // A small head/body lean makes the separate iris movement legible at
      // the actual hero size. It follows the same eased pointer, never a timer.
      holder.style.setProperty("--pet-attention-turn", `${off ? 0 : x * (animal === "cat" ? 2.4 : 1.8)}deg`);
      gl.useProgram(program);
      values.forEach((delta, i) =>
        gl.uniform2f(
          gl.getUniformLocation(program, i ? "moveB" : "moveA"),
          delta[0] / canvas.width,
          -delta[1] / canvas.height,
        ),
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      holder.dataset.gazeX = values[0][0].toFixed(2);
      holder.dataset.gazeY = values[0][1].toFixed(2);
      holder.dataset.gazeSource = event.detail.source || "neutral";
    }
    function lost(event) {
      event.preventDefault();
      fallback();
      dead = true;
    }
    window.addEventListener("clinic:gaze", draw);
    canvas.addEventListener("webglcontextlost", lost);
    if (img.complete && img.naturalWidth) start();
    else img.addEventListener("load", start, { once: true });
    return () => {
      dead = true;
      img.removeEventListener("load", start);
      window.removeEventListener("clinic:gaze", draw);
      canvas.removeEventListener("webglcontextlost", lost);
      if (gl) {
        if (texture) gl.deleteTexture(texture);
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
        shaders.forEach((s) => gl.deleteShader(s));
      }
      fallback();
    };
  }, [animal]);
  return (
    <div className="pet-visual" ref={holderRef}>
      <img
        ref={imageRef}
        src={`/assets/hero-${animal}.webp`}
        alt=""
        width="1086"
        height="1448"
        fetchPriority="high"
      />
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
