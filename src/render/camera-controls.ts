import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { createCamera } from './camera';
import { isGameDialogOpen } from './hud-dom';

const DRAG_THRESHOLD = 4;
const ZOOM_PER_PIXEL = 0.0015;

export function connectCameraControls(
  canvas: HTMLCanvasElement,
  { camera, pan, zoom }: ReturnType<typeof createCamera>,
): void {
  const ground = new Plane(new Vector3(0, 1, 0));
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const previous = new Vector3();
  const next = new Vector3();
  const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  let drag: { id: number; x: number; y: number } | undefined;
  let suppressClick = false;

  const groundPoint = (x: number, y: number, bounds: DOMRect, target: Vector3) => {
    pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      1 - ((y - bounds.top) / bounds.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(ground, target);
  };

  document.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    suppressClick = false;
    if (event.target !== canvas || isGameDialogOpen()) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (drag === undefined || event.pointerId !== drag.id || isGameDialogOpen()) return;
    const x = event.clientX;
    const y = event.clientY;
    if (!suppressClick && Math.hypot(x - drag.x, y - drag.y) < DRAG_THRESHOLD) return;
    suppressClick = true;

    const bounds = canvas.getBoundingClientRect();
    if (groundPoint(drag.x, drag.y, bounds, previous) && groundPoint(x, y, bounds, next)) {
      pan(previous.x - next.x, previous.z - next.z);
    }
    drag.x = x;
    drag.y = y;
  });

  canvas.addEventListener('lostpointercapture', (event) => {
    if (drag?.id === event.pointerId) drag = undefined;
  });

  // 阻止拖曳結束時產生的 click 傳給建造環的文件層監聽器。
  document.addEventListener(
    'click',
    (event) => {
      if (!suppressClick || event.detail === 0) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true },
  );

  document.addEventListener(
    'wheel',
    (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || isGameDialogOpen()) return;
      const mode = event.deltaMode;
      const unit =
        mode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : mode === WheelEvent.DOM_DELTA_PAGE
            ? canvas.clientHeight
            : 1;
      event.preventDefault();
      zoom(Math.exp(event.deltaY * unit * ZOOM_PER_PIXEL));
    },
    { passive: false },
  );

  document.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isGameDialogOpen()
    )
      return;
    switch (event.key) {
      case 'ArrowLeft':
        pan(-screenRight.x, -screenRight.z);
        break;
      case 'ArrowRight':
        pan(screenRight.x, screenRight.z);
        break;
      case 'ArrowUp':
        pan(screenRight.z, -screenRight.x);
        break;
      case 'ArrowDown':
        pan(-screenRight.z, screenRight.x);
        break;
      default:
        return;
    }
    event.preventDefault();
  });
}
