import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { gsap } from "gsap";

/* Main tuning knobs. */
const TWIST = Math.PI * 2;
const BULLET_DROP = 14.5;
/* Strength of the studio HDRI under the softboxes. */
const HDRI_INTENSITY = 0.8;

/* Aspect the Blender cameras were framed for. */
const AUTHORED_ASPECT = 4 / 5;

/** Scroll progress from 0 to 1, owned by the hero's pinned ScrollTrigger. */
export type TwistProgress = {
  value: number;
  /** Calls back whenever `value` changes. */
  subscribe: (callback: () => void) => void;
};

type Options = {
  holder: HTMLElement;
  model: string;
  /** Equirectangular .hdr for the studio light. Omit for the built-in room. */
  environment?: string;
  /** Scroll progress to follow. Omit to show the end state without animation. */
  progress?: TwistProgress;
};

/*
 * Studio light, seen only in reflections: the HDRI (or a light grey room without one)
 * plus three softboxes. Units are mm.
 */
function studioEnvironment(renderer: THREE.WebGLRenderer, camera: THREE.Object3D, hdri: THREE.Texture | null) {
  const room = new THREE.Scene();
  const emissive = (k: number, side: THREE.Side = THREE.DoubleSide) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(k), side });

  if (hdri) {
    room.background = hdri;
    room.backgroundIntensity = HDRI_INTENSITY;
  } else {
    room.add(new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), emissive(0.6, THREE.BackSide)));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), emissive(0.08));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -150;
    room.add(floor);
  }

  /* Positions are relative to the camera: `across` to its right, `toward` it. */
  const toCamera = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
  const right = new THREE.Vector3(toCamera.z, 0, -toCamera.x);
  const panel = (w: number, h: number, across: number, toward: number, y: number, k: number) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), emissive(k));
    mesh.position.copy(right).multiplyScalar(across).addScaledVector(toCamera, toward).setY(y);
    mesh.lookAt(0, y, 0);
    room.add(mesh);
    return mesh;
  };

  /* Tall softboxes left and right give the crisp vertical highlights. */
  panel(15, 120, -60, 20, 40, 8);
  panel(15, 120, 60, 20, 40, 8);
  /* Angled strip above and behind. */
  panel(120, 30, 0, -40, 90, 8).lookAt(0, 0, 0);
  /* Without the HDRI, dark flags give the chrome its contrast bands. */
  if (!hdri) {
    panel(30, 200, -120, -60, 40, 0.02);
    panel(30, 200, 120, -60, 40, 0.02);
    panel(40, 200, 0, -200, 40, 0.03);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(room, 0.01, 1, 2000).texture;
  pmrem.dispose();
  hdri?.dispose();
  room.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      node.material.dispose();
    }
  });
  return texture;
}

export async function mountLipstickTwist({ holder, model, environment, progress }: Options) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const hdriLoad = environment
    ? new HDRLoader().loadAsync(environment).then(
        (texture) => ((texture.mapping = THREE.EquirectangularReflectionMapping), texture),
        () => null,
      )
    : Promise.resolve(null);
  let gltf;
  let hdri: THREE.Texture | null;
  try {
    [gltf, hdri] = await Promise.all([loader.loadAsync(model), hdriLoad]);
  } catch {
    renderer.dispose();
    return;
  }

  /* gltf.scene is a Group; environment lighting needs a real Scene. */
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const base = scene.getObjectByName("Base");
  const bullet = scene.getObjectByName("Bullet");
  const camStart = scene.getObjectByName("CamStart");
  const camEnd = scene.getObjectByName("CamEnd");
  if (!base || !bullet || !camStart || !camEnd) {
    renderer.dispose();
    return;
  }

  const source = gltf.cameras[0] as THREE.PerspectiveCamera | undefined;
  const camera = new THREE.PerspectiveCamera(
    source ? source.fov : THREE.MathUtils.radToDeg(0.4174),
    AUTHORED_ASPECT,
    1,
    10000,
  );

  scene.environment = studioEnvironment(renderer, camEnd, hdri);
  scene.environmentIntensity = 1;

  /* Camera poses in world space (the glTF cameras look down their own −Z). */
  const pose = (node: THREE.Object3D) => {
    node.updateWorldMatrix(true, false);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    node.matrixWorld.decompose(position, quaternion, new THREE.Vector3());
    return { position, quaternion };
  };
  const from = pose(camStart);
  const to = pose(camEnd);

  /* Exported transforms are the end state. */
  const bulletEnd = bullet.position.y;
  /* Twist and rise track the scroll 1:1; the camera eases. */
  const cameraEase = gsap.parseEase("power2.inOut");
  const state = { twist: 0, rise: 1, camera: 1 };
  const follow = () => {
    const value = progress ? progress.value : 1;
    state.twist = 1 - value;
    state.rise = value;
    state.camera = cameraEase(value);
  };

  /* Wider or narrower canvases: move back along the view axis to keep the framing. */
  let pullBack = 1;
  const forward = new THREE.Vector3();

  const apply = () => {
    const angle = TWIST * state.twist;
    base.rotation.y = angle;
    bullet.rotation.y = angle;
    bullet.position.y = bulletEnd - BULLET_DROP * (1 - state.rise);

    camera.position.lerpVectors(from.position, to.position, state.camera);
    camera.quaternion.slerpQuaternions(from.quaternion, to.quaternion, state.camera);
    if (pullBack !== 1) {
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const distance = camera.position.length();
      camera.position.addScaledVector(forward, -distance * (pullBack - 1));
    }
  };

  let queued = false;
  const render = () => {
    queued = false;
    follow();
    apply();
    renderer.render(scene, camera);
  };
  const requestRender = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  };

  const resize = () => {
    const { width, height } = holder.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    pullBack = camera.aspect < AUTHORED_ASPECT ? AUTHORED_ASPECT / camera.aspect : 1;
    camera.updateProjectionMatrix();
    requestRender();
  };
  new ResizeObserver(resize).observe(holder);

  holder.append(renderer.domElement);
  resize();
  render();
  holder.classList.add("is-live");

  progress?.subscribe(requestRender);
}
