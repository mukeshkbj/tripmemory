"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function SpatialPhoto({
  image,
  depth,
  offset,
  zoom,
  alt,
}: {
  image: string;
  depth: string;
  offset: { x: number; y: number };
  zoom: number;
  alt: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const render = useRef<((x: number, y: number, zoom: number) => void) | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    camera.position.z = 1;
    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      photo: { value: null as THREE.Texture | null },
      depthMap: { value: null as THREE.Texture | null },
      offset: { value: new THREE.Vector2() },
      cover: { value: new THREE.Vector2(1, 1) },
      zoom: { value: 1 },
      strength: { value: 0.045 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader:
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.0);}",
      fragmentShader: `uniform sampler2D photo; uniform sampler2D depthMap; uniform vec2 offset; uniform vec2 cover; uniform float zoom; uniform float strength; varying vec2 vUv;
        void main(){vec2 uv=(vUv-0.5)*cover/zoom+0.5;float d=texture2D(depthMap,uv).r;uv+=offset*(d-0.5)*strength;gl_FragColor=texture2D(photo,clamp(uv,0.001,0.999));
        #include <colorspace_fragment>
        }`,
    });
    scene.add(new THREE.Mesh(geometry, material));
    const textures: THREE.Texture[] = [];
    let disposed = false;
    let photoAspect = 1;
    const draw = () => {
      if (!disposed && textures.length === 2) renderer.render(scene, camera);
    };
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      const viewAspect = width / Math.max(height, 1);
      uniforms.cover.value.set(
        Math.min(1, viewAspect / photoAspect),
        Math.min(1, photoAspect / viewAspect),
      );
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const setMotion = () => {
      uniforms.strength.value = motion.matches ? 0 : 0.045;
      draw();
    };
    motion.addEventListener("change", setMotion);
    setMotion();
    const loader = new THREE.TextureLoader();
    for (const [url, slot] of [
      [image, "photo"],
      [depth, "depthMap"],
    ] as const) {
      loader.load(
        url,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          textures.push(texture);
          uniforms[slot].value = texture;
          if (slot === "photo") {
            texture.colorSpace = THREE.SRGBColorSpace;
            photoAspect = texture.image.width / texture.image.height;
          }
          if (textures.length === 2) {
            setLoaded(true);
            resize();
          }
        },
        undefined,
        () => {
          if (!disposed) setFailed(true);
        },
      );
    }
    render.current = (x, y, zoomValue) => {
      uniforms.offset.value.set(x, -y);
      uniforms.zoom.value = zoomValue;
      draw();
    };
    const lost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true;
      render.current = null;
      observer.disconnect();
      motion.removeEventListener("change", setMotion);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      textures.forEach((texture) => texture.dispose());
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [image, depth]);
  useEffect(() => {
    render.current?.(offset.x, offset.y, zoom);
  }, [offset.x, offset.y, zoom, loaded]);
  return (
    <>
      <img className="scene-image" src={image} alt={alt} />
      <div
        ref={host}
        className={`spatial-canvas ${loaded && !failed ? "visible" : ""}`}
        aria-hidden="true"
      />
      {failed && (
        <p className="canvas-fallback" role="status">
          Spatial rendering isn’t available in this browser. Showing your photo
          instead.
        </p>
      )}
    </>
  );
}
