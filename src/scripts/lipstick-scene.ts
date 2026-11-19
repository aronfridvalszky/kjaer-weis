import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

type Options = {
  holder: HTMLElement;
  section: HTMLElement;
  model: string;
};

const deg = THREE.MathUtils.degToRad;

/* Studio room: grey sphere with bright softbox strips, for crisp chrome. */
function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  room.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0xbdbdc2, side: THREE.BackSide }),
    ),
  );
  const strip = (w: number, h: number, x: number, y: number, z: number, color = 0xffffff, k = 6) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(k),
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
  };
  strip(6, 40, -22, 4, 12);
  strip(4, 40, 24, 2, 6);
  strip(30, 6, 0, 30, 0);
  strip(12, 30, 0, 0, 32, 0xfff4ec, 2.2);
  strip(5, 40, -8, 0, 30, 0x1a1a1c, 1);
  strip(4, 40, 30, 0, -10, 0x2a2a2c, 1);
  strip(8, 30, 12, 0, -26, 0xffffff, 3);
  const texture = pmrem.fromScene(room, 0.02).texture;
  pmrem.dispose();
  return texture;
}

/* glTF drops alpha maps, so the engravings are drawn again here. */
function engravingTexture(text: string, font: string, w = 4096, h = 400) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff";
  g.font = `italic 300px ${font}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 10);
  return new THREE.CanvasTexture(canvas);
}

function monogramTexture(w = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = w;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fff";
  g.font = `600 ${w * 0.42}px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("KW", w / 2, w / 2 + w * 0.02);
  return new THREE.CanvasTexture(canvas);
}

function restoreEngravings(root: THREE.Object3D, font: string) {
  const wordmark = engravingTexture("Kjær Weis", font);
  const engraved = (alphaMap: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      color: 0x4a4b50,
      metalness: 1,
      roughness: 0.55,
      alphaMap,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.name.startsWith("Engraving")) node.material = engraved(wordmark);
    if (node.name === "Monogram") node.material = engraved(monogramTexture());
  });
}

export async function mountLipstick({ holder, section, model }: Options) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-40, 80, 60);
  const rim = new THREE.DirectionalLight(0xfff3ea, 1.4);
  rim.position.set(60, 30, -40);
  scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.25));

  const camera = new THREE.PerspectiveCamera(24, 4 / 5, 1, 1000);
  camera.position.set(0, 20, 260);
  camera.lookAt(0, 0, 0);

  const font =
    getComputedStyle(document.documentElement).getPropertyValue("--font-netsera").trim() ||
    "Georgia, serif";

  let gltf;
  try {
    [gltf] = await Promise.all([
      new GLTFLoader().loadAsync(model),
      document.fonts.load(`italic 300px ${font}`).catch(() => null),
    ]);
  } catch {
    renderer.dispose();
    return;
  }

  const lipstick = gltf.scene.getObjectByName("KjaerWeis_Lipstick");
  const base = gltf.scene.getObjectByName("Base");
  const cap = gltf.scene.getObjectByName("Cap");
  const bullet = gltf.scene.getObjectByName("Bullet");
  if (!lipstick || !base || !cap || !bullet) {
    renderer.dispose();
    return;
  }

  restoreEngravings(gltf.scene, font);

  /* The file is in metres; the pose below is in millimetres. */
  lipstick.scale.setScalar(1);
  lipstick.rotation.set(0, -0.5, 0);
  scene.add(gltf.scene);

  const bulletRest = bullet.position.y;

  /* Pose at the top of the page matches the still render. */
  const pose = {
    baseX: -14,
    baseY: -30,
    baseTilt: -10,
    baseTurn: 0,
    capX: 20,
    capY: -22,
    capZ: -10,
    capTilt: 16,
    capTurn: 0.6,
    bulletRise: 0,
  };

  const apply = () => {
    base.position.set(pose.baseX, pose.baseY, 0);
    base.rotation.set(0, pose.baseTurn, deg(pose.baseTilt));
    cap.position.set(pose.capX, pose.capY, pose.capZ);
    cap.rotation.set(0, pose.capTurn, deg(pose.capTilt));
    bullet.position.y = bulletRest + pose.bulletRise;
  };

  let queued = false;
  const render = () => {
    queued = false;
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
    camera.updateProjectionMatrix();
    requestRender();
  };
  new ResizeObserver(resize).observe(holder);

  holder.append(renderer.domElement);
  resize();
  render();
  holder.classList.add("is-live");

  gsap
    .timeline({
      defaults: { ease: "none" },
      onUpdate: requestRender,
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom top",
        scrub: 0.6,
      },
    })
    .to(pose, { capY: 48, capX: 46, capZ: -30, capTilt: 52, capTurn: 1.8, ease: "power1.in" }, 0)
    .to(pose, { baseTurn: deg(30), baseTilt: -4, ease: "power1.inOut" }, 0)
    .to(pose, { bulletRise: 4, ease: "power1.out" }, 0.2);
}
