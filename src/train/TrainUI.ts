import { TrainPhysics } from "./TrainPhysics";
import { CameraMode, cameraNames } from "./TrainCamera";
export class TrainUI {
  private waitingForCamera = false;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private clearPreview() {
    clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
  }
  private pointerInside = false;
  private toggle: HTMLButtonElement;
  private content: HTMLElement;
  private setExpanded = (expanded: boolean) => {
    if (!expanded && !this.root.hidden && (this.waitingForCamera || this.previewTimer !== undefined)) return;
    this.root.classList.toggle("expanded", expanded);
    this.toggle.setAttribute("aria-expanded", String(expanded));
    this.content.inert = !expanded;
  };
  private enterPanel = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      this.pointerInside = true;
      this.setExpanded(true);
    }
  };
  private leavePanel = (event: PointerEvent) => {
    if (event.pointerType !== "touch") {
      this.pointerInside = false;
      if (this.content.contains(document.activeElement))
        (document.activeElement as HTMLElement).blur();
      this.setExpanded(false);
    }
  };
  private outsidePanel = (event: PointerEvent) => {
    if (!this.root.contains(event.target as Node)) this.setExpanded(false);
  };
  private focusPanel = () => this.setExpanded(true);
  private blurPanel = (event: FocusEvent) => {
    if (
      !this.pointerInside &&
      !this.root.contains(event.relatedTarget as Node | null)
    )
      this.setExpanded(false);
  };
  private speed: HTMLElement;
  private state: HTMLElement;
  private camera: HTMLElement;
  private throttle: HTMLElement;
  private exitButton: HTMLButtonElement;
  constructor(
    private root: HTMLElement,
    actions: {
      accelerate: () => void;
      brake: () => void;
      horn: () => void;
      camera: () => void;
      exit: () => void;
      restart: () => void;
    },
  ) {
    const get = <E extends HTMLElement>(name: string) => {
      const element = root.querySelector<E>(`[data-train="${name}"]`);
      if (!element) throw new Error(`Train UI missing ${name}`);
      return element;
    };
    this.toggle = get<HTMLButtonElement>("toggle");
    this.content = root.querySelector<HTMLElement>("#train-content")!;
    this.toggle.onpointerdown = (event) => {
      if (event.pointerType === "touch") event.preventDefault();
    };
    document.addEventListener("pointerdown", this.outsidePanel);
    this.toggle.onclick = () =>
      this.setExpanded(
        this.pointerInside || !root.classList.contains("expanded"),
      );
    root.addEventListener("pointerenter", this.enterPanel);
    root.addEventListener("pointerleave", this.leavePanel);
    root.addEventListener("focusin", this.focusPanel);
    root.addEventListener("focusout", this.blurPanel);
    this.speed = get("speed");
    this.state = get("state");
    this.camera = get("camera-name");
    this.throttle = get("throttle");
    this.exitButton = get<HTMLButtonElement>("exit");
    for (const [name, action] of Object.entries(actions))
      get<HTMLButtonElement>(name).onclick = () => {
        action();
      };
  }
  show(visible: boolean) {
    this.clearPreview();
    this.waitingForCamera = visible;
    this.pointerInside = false;
    this.root.hidden = !visible;
    this.setExpanded(visible);
  }
  cameraSettled() {
    if (!this.waitingForCamera || this.root.hidden) return;
    this.waitingForCamera = false;
    this.previewTimer = setTimeout(() => {
      this.previewTimer = undefined;
      if (!this.pointerInside && !this.root.contains(document.activeElement))
        this.setExpanded(false);
    }, 2000);
  }
  update(physics: TrainPhysics, mode: CameraMode, pendingExit: boolean) {
    this.speed.textContent = (physics.speed * 3.6).toFixed(1);
    this.state.textContent = pendingExit ? "正在停车，准备下车" : physics.state;
    this.camera.textContent = cameraNames[mode];
    this.throttle.textContent = `牵引 ${Math.round(physics.throttle * 100)}%`;
    this.exitButton.textContent = pendingExit ? "停车中…" : "下车 E";
    this.exitButton.disabled = pendingExit;
  }
  dispose() {
    this.clearPreview();
    document.removeEventListener("pointerdown", this.outsidePanel);
    this.toggle.onpointerdown = null;
    this.root.removeEventListener("pointerenter", this.enterPanel);
    this.root.removeEventListener("pointerleave", this.leavePanel);
    this.root.removeEventListener("focusin", this.focusPanel);
    this.root.removeEventListener("focusout", this.blurPanel);
    this.root.hidden = true;
    this.root
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => (b.onclick = null));
  }
}
