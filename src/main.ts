import { AnimalManager } from "./animals/AnimalManager";
import "./style.css";
import { AdaptiveQuality } from "./core/AdaptiveQuality";
import { withTimeout } from "./core/startup";
import * as T from "three/webgpu";
import { createAssets, clockUniform, windUniform } from "./forest/Assets";
import { ForestGenerator } from "./forest/ForestGenerator";
import { FirstPersonController } from "./controls/FirstPersonController";
import { Atmosphere } from "./effects/Atmosphere";
import { TrainManager } from "./train/TrainManager";
import { AudioAmbience } from "./effects/AudioAmbience";
const $ = <E extends HTMLElement = HTMLElement>(id: string): E => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`界面元素缺失：#${id}，请重新加载页面。`);
  return element as E;
};
async function boot() {
  const low =
    matchMedia("(pointer:coarse)").matches ||
    navigator.hardwareConcurrency <= 4;
  const renderer = new T.WebGPURenderer({
    antialias: true,
    powerPreference: "high-performance",
    forceWebGL: new URLSearchParams(location.search).has("webgl"),
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  $("world").appendChild(renderer.domElement);
  $("status").textContent = "正在初始化渲染器";
  await withTimeout(renderer.init(), 6000, "渲染器初始化超时");
  $("status").textContent = "正在生成森林";
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(62, innerWidth / innerHeight, 0.08, 230);
  const assets = createAssets(),
    forest = new ForestGenerator(scene, assets),
    controls = new FirstPersonController(camera, renderer.domElement, forest),
    atmosphere = new Atmosphere(scene),
    audio = new AudioAmbience();
  forest.update(camera.position.x, camera.position.z);
  const animals = new AnimalManager(scene, forest);
  atmosphere.sun.shadow.mapSize.set(1024, 1024);
  atmosphere.update(0, 0, camera);
  const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean })
    .isWebGPUBackend
    ? "WEBGPU"
    : "WEBGL 2";
  $("backend").textContent = `${backend} · PROCEDURAL WORLD`;
  const timeInput = $<HTMLInputElement>("time");
  const updateTime = () => {
    timeInput.value = String(atmosphere.time);
    $("time-name").textContent = atmosphere.label;
    document
      .querySelectorAll<HTMLButtonElement>("[data-time]")
      .forEach((b) =>
        b.classList.toggle(
          "active",
          Math.abs(Number(b.dataset.time) - atmosphere.time) < 0.05,
        ),
      );
  };
  function toggleSettings(open: boolean) {
    $("settings").hidden = !open;
    $("settings-toggle").setAttribute("aria-expanded", String(open));
  }
  let train: TrainManager | null = null;
  const showTrainMode = () => {
    document.body.classList.add("exploring", "train-mode");
    $("intro").hidden = true;
    $("paused").hidden = true;
    $("reticle").hidden = true;
    $("tour-controls").hidden = true;
    $("touch").hidden = true;
    $("status").textContent = "森林列车 · 铁路驾驶";
    toggleSettings(false);
  };
  controls.onLockChange = (locked) => {
    if (train?.active) {
      showTrainMode();
      return;
    }
    if (controls.tour) locked = true;
    document.body.classList.toggle("exploring", controls.started);
    $("intro").hidden = controls.started;
    $("paused").hidden = locked || !controls.started;
    $("reticle").hidden = !locked || controls.tour;
    $("tour-controls").hidden = !locked || !controls.tour;
    $("resume").textContent = controls.tourPaused
      ? "继续自动漫游 ↗"
      : "继续探索 ↗";
    $("touch").hidden = !locked || !matchMedia("(pointer:coarse)").matches;
    if (locked) {
      toggleSettings(false);
      $("status").textContent = controls.tour
        ? "正在自由漫游"
        : "此刻，身在森林";
    } else $("status").textContent = "停下来，听听森林";
  };
  $("enter").onclick = () => void controls.enter();
  $("resume").onclick = () =>
    controls.tourPaused ? controls.startTour() : void controls.enter();
  $("auto-enter").onclick = () => controls.startTour();
  $("train-enter").onclick = () => train?.enter();
  $("tour-pause").onclick = () => controls.pauseTour();
  $("tour-manual").onclick = () => void controls.enter();
  $<HTMLSelectElement>("tour-speed").onchange = (e) =>
    (controls.tourSpeed = Number((e.target as HTMLSelectElement).value));
  $("home").onclick = () => {
    controls.active = false;
    controls.tour = false;
    controls.tourPaused = false;
    controls.started = false;
    document.body.classList.remove("exploring");
    $("paused").hidden = true;
    $("intro").hidden = false;
    $("status").textContent = "森林正在呼吸";
  };
  $("settings-toggle").onclick = () => toggleSettings($("settings").hidden);
  $("settings-close").onclick = () => toggleSettings(false);
  const updateSoundButton = () => {
    $("sound").setAttribute(
      "aria-label",
      audio.enabled ? "关闭环境音" : "开启环境音",
    );
    $("sound").setAttribute("aria-pressed", String(audio.enabled));
    $("sound").innerHTML =
      `${audio.enabled ? "♫" : "♪"} <span>${audio.enabled ? "声音开启" : "声音关闭"}</span>`;
  };
  const startAudio = () =>
    void audio.start().catch((error) => console.warn("环境音暂未启动", error));
  $("sound").onclick = () => {
    const result = audio.toggle();
    updateSoundButton();
    if (train) train.audio.enabled = audio.enabled;
    void result.catch((error) => console.warn("环境音暂未启动", error));
  };
  // Start immediately where autoplay is allowed; retry inside a trusted gesture otherwise.
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target instanceof Element && event.target.closest("#sound"))
        return;
      startAudio();
    },
    { capture: true },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.target instanceof Element && event.target.closest("#sound"))
        return;
      startAudio();
    },
    { capture: true },
  );
  updateSoundButton();
  startAudio();
  timeInput.oninput = () => {
    atmosphere.time = Number(timeInput.value);
    atmosphere.cycle = false;
    $<HTMLInputElement>("cycle").checked = false;
    updateTime();
  };
  document.querySelectorAll<HTMLButtonElement>("[data-time]").forEach(
    (b) =>
      (b.onclick = () => {
        atmosphere.time = Number(b.dataset.time);
        atmosphere.cycle = false;
        $<HTMLInputElement>("cycle").checked = false;
        updateTime();
      }),
  );
  $<HTMLInputElement>("wind").oninput = (e) => {
    windUniform.value = Number((e.target as HTMLInputElement).value);
    $("wind-value").textContent =
      windUniform.value < 0.2
        ? "静谧"
        : windUniform.value < 1
          ? "柔风"
          : "劲风";
  };
  $<HTMLInputElement>("cycle").onchange = (e) =>
    (atmosphere.cycle = (e.target as HTMLInputElement).checked);
  const adaptive = new AdaptiveQuality(low ? 1 : 0);
  let qualityMode = "auto";
  const applyQuality = () => {
    const level = qualityMode === "low" ? 2 : adaptive.level;
    const high = qualityMode === "high";
    forest.setQuality(high);
    forest.shadowDistance = high ? 65 : level === 0 ? 42 : 0;
    forest.detailDistance = high
      ? 70
      : level === 0
        ? 58
        : level === 1
          ? 45
          : 34;
    animals.drawDistance = high ? 85 : level === 2 ? 48 : 65;
    renderer.setPixelRatio(
      Math.min(devicePixelRatio, high ? 1.8 : [1.2, 1, 0.8][level]),
    );
    renderer.shadowMap.enabled = high || level === 0;
    renderer.setSize(innerWidth, innerHeight);
  };
  applyQuality();
  $<HTMLSelectElement>("quality").onchange = (e) => {
    qualityMode = (e.target as HTMLSelectElement).value;
    adaptive.reset();
    applyQuality();
  };
  const forward = $("touch-forward");
  forward.onpointerdown = (e) => {
    e.preventDefault();
    forward.setPointerCapture(e.pointerId);
    controls.keys.add("KeyW");
  };
  forward.onpointerup = forward.onpointercancel = () =>
    controls.keys.delete("KeyW");
  $("touch-jump").onpointerdown = () => {
    if (controls.grounded) {
      controls.velocityY = 5.4;
      controls.grounded = false;
    }
  };
  train = new TrainManager(scene, camera, controls, forest, $("train-panel"));
  train.onHorn = () =>
    animals.reactToTrain(train!.focus, train!.physics.speed, true);
  train.onModeChange = (active) => {
    if (active) showTrainMode();
    else document.body.classList.remove("train-mode");
  };
  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    adaptive.clear();
  });
  let last = performance.now(),
    elapsed = 0,
    frames = 0,
    fpsTime = 0,
    ready = false;
  let firstFrameReady!: () => void;
  let firstFrameFailed!: (error: unknown) => void;
  const firstFrame = new Promise<void>((resolve, reject) => {
    firstFrameReady = resolve;
    firstFrameFailed = reject;
  });
  // Attach the timeout immediately, including while the animation loop starts.
  const startup = withTimeout(firstFrame, 12000, "首帧渲染超时");
  $("status").textContent = "正在准备第一帧画面";
  await renderer.setAnimationLoop(() => {
    try {
      const now = performance.now(),
        wallDelta = (now - last) / 1000,
        dt = Math.min(wallDelta, 0.045);
      last = now;
      if (
        qualityMode === "auto" &&
        adaptive.sample(wallDelta, !document.hidden)
      )
        applyQuality();
      elapsed += dt;
      clockUniform.value = elapsed;
      train!.update(dt, elapsed);
      if (!train!.active) controls.update(dt, elapsed);
      const focus = train!.active ? train!.focus : camera.position;
      forest.update(focus.x, focus.z);
      if (train!.active) animals.reactToTrain(focus, train!.physics.speed);
      animals.update(dt, focus, camera);
      atmosphere.update(dt, elapsed, camera);
      train!.environment(atmosphere.sun, atmosphere.ambient);
      renderer.render(scene, camera);
      frames++;
      fpsTime += wallDelta;
      if (!ready) {
        ready = true;
        $<HTMLButtonElement>("enter").disabled = false;
        $<HTMLButtonElement>("auto-enter").disabled = false;
        $<HTMLButtonElement>("train-enter").disabled = false;
        $("enter-text").textContent = "走进森林";
        $("status").textContent = "森林正在呼吸";
        firstFrameReady();
      }
      if (fpsTime > 1) {
        $("fps").textContent = `${Math.round(frames / fpsTime)} FPS`;
        $("coordinates").textContent = controls.started
          ? `已漫游 ${Math.floor(controls.distance)} m · ${Math.floor(camera.position.x)}, ${Math.floor(camera.position.z)} · ${forest.active.size} 个区块`
          : "北纬般的宁静，任何方向";
        frames = 0;
        fpsTime = 0;
        updateTime();
      }
    } catch (error) {
      void renderer.setAnimationLoop(null);
      if (!ready) firstFrameFailed(error);
      else showStartupError(error);
    }
  });
  // Read-only diagnostics plus explicit movement controls for browser validation.
  Object.assign(window, {
    forestDebug: {
      animals,
      get stats() {
        return forest.stats();
      },
      get position() {
        return camera.position.toArray();
      },
      get time() {
        return elapsed;
      },
      get wind() {
        return windUniform.value;
      },
      get locked() {
        return document.pointerLockElement === renderer.domElement;
      },
      get renderer() {
        return backend;
      },
      get renderInfo() {
        return {
          calls: renderer.info.render.drawCalls,
          triangles: renderer.info.render.triangles,
        };
      },
      teleport(x: number, z: number) {
        camera.position.x = x;
        camera.position.z = z;
        camera.position.y = 30;
      },
      controls,
      forest,
      train,
    },
  });
  try {
    await startup;
  } catch (error) {
    await renderer.setAnimationLoop(null);
    throw error;
  }
}
function showStartupError(error: unknown) {
  console.error(error);
  const url = new URL(location.href);
  if (
    !url.searchParams.has("webgl") &&
    !(error instanceof Error && error.message.startsWith("界面元素缺失"))
  ) {
    $("status").textContent = "正在切换 WebGL2 兼容模式";
    url.searchParams.set("webgl", "");
    location.replace(url.href);
    return;
  }
  $("status").textContent = "启动失败，请重试";
  $("enter-text").textContent = "森林未能启动";
  const box = $("error"),
    title = document.createElement("h2"),
    details = document.createElement("p"),
    retry = document.createElement("button");
  title.textContent = "森林暂时未能启动";
  details.textContent = error instanceof Error ? error.message : String(error);
  retry.textContent = "重新加载";
  retry.onclick = () => location.reload();
  box.replaceChildren(title, details, retry);
  box.hidden = false;
}
boot().catch(showStartupError);
