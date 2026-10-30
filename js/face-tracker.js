/*
 * Alien Head 3D — webcam face tracking
 *
 * Uses Google's MediaPipe Face Landmarker, which runs fully in the browser
 * (WebAssembly + GPU). Video frames never leave the device. Each frame gives
 * 52 expression scores ("blendshapes" such as mouthSmileLeft or jawOpen),
 * a head-pose matrix and 478 face landmarks.
 */
(function () {
  'use strict';

  const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  // Eye-corner and eyelid landmarks for the two eyes: [corner, corner, lid pair, lid pair]
  const EYES = [
    [33, 133, [160, 144], [158, 153]],
    [362, 263, [385, 380], [387, 373]]
  ];

  class FaceTracker {
    constructor(video) {
      this.video = video;
      this.landmarker = null;
      this.lastVideoTime = -1;
      // Evidence for which way MediaPipe names Left/Right (see sideEvidence()).
      this.sideScore = 0;
    }

    async load() {
      const { FaceLandmarker, FilesetResolver } = await import(VISION + '/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(VISION + '/wasm');
      const opts = {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      };
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(files, opts);
      } catch (e) {
        opts.baseOptions.delegate = 'CPU';
        this.landmarker = await FaceLandmarker.createFromOptions(files, opts);
      }
    }

    async startCamera() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      this.video.srcObject = stream;
      await this.video.play();
    }

    stopCamera() {
      const s = this.video.srcObject;
      if (s) s.getTracks().forEach((t) => t.stop());
      this.video.srcObject = null;
    }

    get running() { return !!this.video.srcObject; }

    /**
     * Returns undefined when there is no new video frame, null when no face
     * is visible, or { shapes, matrix, ownLeftIsLeft }.
     */
    detect(now) {
      const v = this.video;
      if (!this.landmarker || !this.running || v.readyState < 2 || v.currentTime === this.lastVideoTime) return undefined;
      this.lastVideoTime = v.currentTime;
      const r = this.landmarker.detectForVideo(v, now);
      if (!r.faceBlendshapes || !r.faceBlendshapes.length) return null;
      const shapes = {};
      r.faceBlendshapes[0].categories.forEach((c) => { shapes[c.categoryName] = c.score; });
      if (r.faceLandmarks && r.faceLandmarks[0]) this.sideEvidence(shapes, r.faceLandmarks[0]);
      return {
        shapes,
        matrix: r.facialTransformationMatrixes && r.facialTransformationMatrixes[0] ? r.facialTransformationMatrixes[0].data : null,
        ownLeftIsLeft: this.sideScore >= 0
      };
    }

    /**
     * Do "...Left" blendshapes describe the person's own left side?
     * Rather than trust a naming convention, compare the blink scores with
     * how open each eye actually is. In the raw camera image the person's own
     * left eye is the one further to the right (larger x).
     */
    sideEvidence(shapes, lm) {
      const eyes = EYES.map(([a, b, p1, p2]) => {
        const width = Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y) || 1e-6;
        const height = (Math.abs(lm[p1[0]].y - lm[p1[1]].y) + Math.abs(lm[p2[0]].y - lm[p2[1]].y)) / 2;
        return { x: (lm[a].x + lm[b].x) / 2, open: height / width };
      });
      const [imgLeft, imgRight] = eyes[0].x < eyes[1].x ? eyes : [eyes[1], eyes[0]];
      const geo = imgLeft.open - imgRight.open;        // > 0: own-left eye (image right) more closed
      const named = shapes.eyeBlinkLeft - shapes.eyeBlinkRight; // > 0: "Left" more closed
      if (Math.abs(geo) > 0.02 && Math.abs(named) > 0.08) {
        this.sideScore = Math.max(-20, Math.min(20, this.sideScore + Math.sign(geo * named)));
      }
    }
  }

  window.FaceTracker = FaceTracker;
})();
