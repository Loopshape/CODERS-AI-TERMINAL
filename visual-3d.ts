/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

// FIX: Corrected Lit imports to use 'lit-element' and 'lit-element/decorators.js' to resolve module export errors.
import {LitElement, css, html} from 'lit-element';
import {customElement, property} from 'lit-element/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {AfterimagePass} from 'three/addons/postprocessing/AfterimagePass.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';

const PARTICLE_COUNT = 5000;

const particleVS = `
  uniform float uTime;
  uniform float uSize;
  uniform float uOutputAvg;
  uniform float uOutputHigh;

  attribute vec3 aStartPosition;
  attribute vec3 aRandom;

  varying vec3 vColor;

  void main() {
      vec3 pos = aStartPosition;

      // Displacement
      float displacement = uOutputAvg * 2.0;
      pos += normalize(pos) * displacement * (0.5 + 0.5 * sin(aRandom.x * 10.0 + uTime * 2.0 * aRandom.y));

      // Color
      vColor = mix(vec3(1.0, 0.2, 0.1), vec3(0.8, 0.5, 1.0), uOutputAvg * 1.5); // Red/Orange to Purple
      vColor = mix(vColor, vec3(1.0, 1.0, 0.5), uOutputHigh * 2.0); // Add yellow 'sparks' for high frequencies

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Size
      float pointSize = (uOutputAvg * 2.0 + uOutputHigh * 40.0 + 2.0);
      gl_PointSize = pointSize * (20.0 / -mvPosition.z);
  }
`;

const particleFS = `
  varying vec3 vColor;
  uniform float uIdleFactor;

  void main() {
      float strength = 1.0 - (2.0 * distance(gl_PointCoord, vec2(0.5)));
      if (strength < 0.0) discard;

      gl_FragColor = vec4(vColor * uIdleFactor, strength);
  }
`;

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private backdrop!: THREE.Mesh;
  private composer!: EffectComposer;
  private particles!: THREE.Points;
  private controls!: OrbitControls;
  private afterimagePass!: AfterimagePass;
  private bloomPass!: UnrealBloomPass;
  private lastInputTime = performance.now();
  private readonly IDLE_DELAY = 3000; // ms
  private readonly FADE_DURATION = 2000; // ms

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    const scene = new THREE.Scene();

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          rand: {value: 0},
          idleFactor: {value: 1.0},
          uAvgOutput: {value: 0.0},
          uHighFreq: {value: 0.0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 2;
    controls.maxDistance = 15;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    this.controls = controls;

    // Particles
    const particleGeometry = new THREE.BufferGeometry();
    const startPositions = new Float32Array(PARTICLE_COUNT * 3);
    const randoms = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Spherical distribution
      const i3 = i * 3;
      const t = i;
      const phi = Math.acos(-1.0 + (2.0 * t) / PARTICLE_COUNT);
      const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;
      const radius = 2.0;

      startPositions[i3 + 0] = radius * Math.cos(theta) * Math.sin(phi);
      startPositions[i3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      startPositions[i3 + 2] = radius * Math.cos(phi);

      randoms[i3 + 0] = Math.random();
      randoms[i3 + 1] = Math.random();
      randoms[i3 + 2] = Math.random();
    }
    particleGeometry.setAttribute(
      'aStartPosition',
      new THREE.BufferAttribute(startPositions, 3),
    );
    particleGeometry.setAttribute(
      'aRandom',
      new THREE.BufferAttribute(randoms, 3),
    );

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uSize: {value: PARTICLE_COUNT},
        uOutputAvg: {value: 0},
        uOutputHigh: {value: 0},
        uIdleFactor: {value: 1.0},
      },
      vertexShader: particleVS,
      fragmentShader: particleFS,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(this.particles);

    const renderPass = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      2.5, // Increased strength for a more intense glow
      0.8, // Increased radius to make the glow spread further
      0,
    );
    this.bloomPass = bloomPass;

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(this.bloomPass);

    this.afterimagePass = new AfterimagePass();
    composer.addPass(this.afterimagePass);

    this.composer = composer;

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      backdrop.material.uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    const t = performance.now();

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const avgInput =
      this.inputAnalyser.data.reduce((a, b) => a + b, 0) /
      this.inputAnalyser.data.length /
      255;

    // A small threshold to account for noise.
    if (avgInput > 0.01) {
      this.lastInputTime = t;
    }

    const timeSinceLastInput = t - this.lastInputTime;
    const idleProgress = Math.max(
      0,
      (timeSinceLastInput - this.IDLE_DELAY) / this.FADE_DURATION,
    );
    const idleFactor = 1.0 - THREE.MathUtils.smootherstep(idleProgress, 0, 1);

    const backdropMaterial = this.backdrop.material as THREE.RawShaderMaterial;
    const particleMaterial = this.particles.material as THREE.ShaderMaterial;

    backdropMaterial.uniforms.rand.value = Math.random() * 10000;
    backdropMaterial.uniforms.idleFactor.value = idleFactor;
    particleMaterial.uniforms.uIdleFactor.value = idleFactor;

    const outputData = this.outputAnalyser.data;
    const avgOutput =
      outputData.reduce((a, b) => a + b, 0) / outputData.length / 255;
    const highFreq = (outputData[10] + outputData[11]) / 2 / 255;

    backdropMaterial.uniforms.uAvgOutput.value = avgOutput;
    backdropMaterial.uniforms.uHighFreq.value = highFreq;

    // Make bloom react to audio
    this.bloomPass.strength = (1.5 + avgOutput * 2.0) * idleFactor;
    this.bloomPass.radius = 0.6 + highFreq * 0.4;

    // Afterimage effect based on output volume - more pronounced trails
    this.afterimagePass.uniforms['damp'].value = THREE.MathUtils.lerp(
      0.96,
      0.6,
      avgOutput ** 2,
    );

    // Update particle uniforms
    particleMaterial.uniforms.uTime.value = t * 0.001;
    particleMaterial.uniforms.uOutputAvg.value = avgOutput;
    particleMaterial.uniforms.uOutputHigh.value = highFreq;

    // Update controls
    this.controls.autoRotateSpeed = (0.2 + avgInput * 2.0) * idleFactor;
    this.controls.update();

    this.composer.render();
  }

  protected firstUpdated() {
    // FIX: Property 'shadowRoot' does not exist on type 'GdmLiveAudioVisuals3D'. Use 'renderRoot' instead.
    this.canvas = this.renderRoot.querySelector('canvas') as HTMLCanvasElement;
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
