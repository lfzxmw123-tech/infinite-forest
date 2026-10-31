import * as T from "three/webgpu";
import { ForestGenerator } from "../forest/ForestGenerator";
import { heightAt, streamX } from "../forest/world";
import { FirstPersonController } from "../controls/FirstPersonController";
import {
  trainPositionUniform,
  trainSpeedUniform,
  nightUniform,
} from "../forest/Assets";
import {
  enableRailway,
  railwayEnabled,
  tunnelBlend,
  railX,
} from "./RailwayPath";
import { TrainModel } from "./TrainModel";
import { RailwayGenerator } from "./RailwayGenerator";
import { TrainPhysics } from "./TrainPhysics";
import { TrainController } from "./TrainController";
import { TrainCamera, CameraMode } from "./TrainCamera";
import { TrainAudio } from "./TrainAudio";
import { TrainUI } from "./TrainUI";
import { TrainEffects } from "./TrainEffects";
export class TrainManager {
  active = false;
  parameter = 0;
  pendingExit = false;
  readonly physics = new TrainPhysics();
  readonly railway: RailwayGenerator;
  readonly model = new TrainModel();
  readonly cameras: TrainCamera;
  readonly controller: TrainController;
  readonly audio = new TrainAudio();
  private ui: TrainUI;
  private steam: TrainEffects;
  private matrix = new T.Matrix4();
  private up = new T.Vector3(0, 1, 0);
  private point = new T.Vector3();
  private tangent = new T.Vector3();
  private look = new T.Vector3();
  private chimney = new T.Vector3();
  private initialized = false;
  private uiClock = 0;
  private tunnel = 0;
  onModeChange: (active: boolean) => void = () => {};
  onHorn: () => void = () => {};
  constructor(
    private scene: T.Scene,
    private camera: T.PerspectiveCamera,
    private walker: FirstPersonController,
    private forest: ForestGenerator,
    panel: HTMLElement,
  ) {
    this.railway = new RailwayGenerator(scene);
    this.cameras = new TrainCamera(camera, this.railway.path);
    this.steam = new TrainEffects(scene);
    scene.add(this.model.root);
    this.model.root.visible = false;
    this.steam.mesh.visible = false;
    const actions = {
      accelerate: () => this.physics.increase(),
      brake: () => this.physics.brake(),
      horn: () => this.horn(),
      camera: () => this.setCamera(),
      exit: () => this.requestExit(),
      restart: () => this.restart(),
    };
    this.ui = new TrainUI(panel, actions);
    this.controller = new TrainController(this.physics, {
      horn: actions.horn,
      camera: actions.camera,
      exit: actions.exit,
      restart: actions.restart,
      enter: () => {
        if (
          this.initialized &&
          this.camera.position.distanceTo(this.model.units[0].group.position) <
            9
        )
          this.enter();
      },
    });
  }
  enter() {
    if (this.active) return;
    (document.activeElement as HTMLElement | null)?.blur();
    this.audio.start();
    if (!railwayEnabled()) {
      enableRailway();
      this.forest.refresh();
    }
    if (!this.initialized) {
      this.parameter = -this.camera.position.z;
      this.initialized = true;
      this.railway.update(this.parameter, true);
      this.pose();
    }
    this.active = true;
    this.pendingExit = false;
    this.controller.active = true;
    this.controller.reset();
    this.physics.restart();
    this.walker.suspended = true;
    this.walker.active = false;
    this.walker.tour = false;
    this.walker.tourPaused = false;
    this.walker.keys.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.model.root.visible = true;
    this.steam.mesh.visible = true;
    this.ui.show(true);
    this.cameras.beginTransition();
    this.onModeChange(true);
    this.ui.update(this.physics, this.cameras.mode, false);
  }
  requestExit() {
    if (!this.active) return;
    this.pendingExit = true;
    this.physics.brake();
    if (this.physics.speed < 0.03) this.leave();
  }
  private leave() {
    this.active = false;
    this.pendingExit = false;
    this.controller.active = false;
    this.controller.reset();
    this.physics.brake();
    this.ui.show(false);
    this.audio.update(0, this.physics.distance, false);
    this.steam.mesh.visible = false;
    trainSpeedUniform.value = 0;
    const head = this.model.units[0].group.position;
    let x = head.x + 4.8,
      z = head.z + 1.5;
    // A boarding platform is not assumed: find clear ground beside the parked engine.
    outer: for (let radius = 4.8; radius < 12; radius += 1)
      for (const side of [1, -1]) {
        const cx = head.x + radius * side;
        if (!this.forest.collides(cx, z, 0.45)) {
          x = cx;
          break outer;
        }
      }
    this.point.set(x, Math.max(heightAt(x, z), -0.6) + 1.75, z);
    this.walker.restorePose(this.point, this.camera.quaternion);
    this.walker.suspended = false;
    this.walker.active = false;
    this.walker.started = true;
    this.tunnel = 0;
    this.onModeChange(false);
    this.walker.onLockChange(false);
  }
  restart() {
    this.pendingExit = false;
    this.physics.restart();
  }
  horn() {
    this.audio.horn();
    this.onHorn();
  }
  setCamera(mode?: CameraMode) {
    this.cameras.switch(mode);
  }
  private pose() {
    for (const unit of this.model.units) {
      const parameter = this.railway.path.advance(this.parameter, -unit.offset);
      this.railway.path.sample(parameter, this.point);
      this.railway.path.tangent(parameter, this.tangent);
      unit.group.position.copy(this.point);
      this.look.copy(this.point).add(this.tangent);
      this.matrix.lookAt(this.point, this.look, this.up);
      unit.group.quaternion.setFromRotationMatrix(this.matrix);
    }
  }
  update(dt: number, time: number) {
    if (!this.active) {
      this.audio.update(0, this.physics.distance, false);
      return;
    }
    this.controller.update(dt);
    const travelled = this.physics.update(dt);
    this.parameter = this.railway.path.advance(this.parameter, travelled);
    this.railway.update(this.parameter);
    this.pose();
    this.model.animate(this.physics.distance, this.physics.speed, time);
    this.cameras.update(dt, this.parameter);
    if (this.cameras.settled) this.ui.cameraSettled();
    const head = this.model.units[0].group;
    head.updateWorldMatrix(true, false);
    this.chimney.set(0, 4.6, -3.2).applyMatrix4(head.matrixWorld);
    this.steam.update(dt, this.physics.speed, this.chimney, this.camera);
    this.audio.update(this.physics.speed, this.physics.distance, true);
    trainPositionUniform.value.copy(head.position);
    trainSpeedUniform.value = this.physics.speed;
    const middle = this.parameter;
    const bridge = Math.abs(railX(-middle) - streamX(-middle)) < 5;
    const target = bridge ? 0 : tunnelBlend(middle);
    this.tunnel = T.MathUtils.damp(this.tunnel, target, 3, dt);
    this.uiClock += dt;
    if (this.uiClock > 0.1) {
      this.uiClock = 0;
      this.ui.update(this.physics, this.cameras.mode, this.pendingExit);
    }
    if (this.pendingExit && this.physics.speed === 0) this.leave();
  }
  environment(sun: T.DirectionalLight, ambient: T.HemisphereLight) {
    if (!this.active) return;
    sun.intensity *= 1 - this.tunnel * 0.96;
    ambient.intensity *= 1 - this.tunnel * 0.9;
    this.model.lamp.intensity = nightUniform.value * 90 + this.tunnel * 100 + 8;
  }
  get focus() {
    return this.model.units[0].group.position;
  }
  get tunnelAmount() {
    return this.tunnel;
  }
  stats() {
    return {
      active: this.active,
      parameter: this.parameter,
      speed: this.physics.speed,
      state: this.physics.state,
      camera: this.cameras.mode,
      railway: this.railway.stats(),
      cars: this.model.units.length,
      steamParticles: 72,
    };
  }
  dispose() {
    this.controller.dispose();
    this.ui.dispose();
    this.model.dispose();
    this.railway.dispose();
    this.steam.dispose();
    this.audio.dispose();
  }
}
