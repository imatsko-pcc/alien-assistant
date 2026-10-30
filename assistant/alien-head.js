/*
 * Alien Assistant — the 3D alien head (shared with Alien Head 3D)
 *
 * Built from three.js primitives: a stretched sphere skull, big almond eyes,
 * brow ridges, lips rebuilt every frame from the expression, and two
 * springy antennae. Feed it an expression with update(); every channel runs
 * from 0 to 1, and L/R mean the left and right side of the screen.
 */
(function () {
  'use strict';

  const T = window.THREE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const NEUTRAL = {
    blinkL: 0, blinkR: 0, wideL: 0, wideR: 0, squintL: 0, squintR: 0,
    browInnerUp: 0, browOuterL: 0, browOuterR: 0, browDownL: 0, browDownR: 0,
    jawOpen: 0, smileL: 0, smileR: 0, frownL: 0, frownR: 0, stretchL: 0, stretchR: 0,
    pucker: 0, funnel: 0, mouthShift: 0, upperUp: 0, lowerDown: 0, cheekPuff: 0,
    gazeX: 0, gazeY: 0, yaw: 0, pitch: 0, roll: 0
  };
  const FAST = new Set(['blinkL', 'blinkR']); // blinks need to snap shut

  const MOOD_COLORS = {
    neutral: 0x22d3ee, happy: 0xfacc15, surprised: 0xf472b6, angry: 0xf43f5e,
    sad: 0x60a5fa, kissy: 0xfb7185, wink: 0xa3e635, puffed: 0xfb923c
  };

  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowTex = new T.CanvasTexture(c);
    return glowTex;
  }

  class AlienHead {
    constructor(scene) {
      this.root = new T.Group();
      this.head = new T.Group();
      this.head.rotation.order = 'YXZ';
      this.root.add(this.head);
      scene.add(this.root);

      this.skin = new T.MeshPhysicalMaterial({
        color: 0x5ee08a, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.45,
        sheen: 0.7, sheenColor: new T.Color(0xc4ffd8)
      });
      this.e = Object.assign({}, NEUTRAL);
      this.prevPose = { yaw: 0, pitch: 0, roll: 0 };
      this.tipColor = new T.Color(MOOD_COLORS.neutral);
      this.tipTarget = new T.Color(MOOD_COLORS.neutral);

      this.buildSkull();
      this.buildEyes();
      this.buildBrows();
      this.buildMouth();
      this.buildAntennae();
      this.buildCheeks();
    }

    // ---------- Building ----------
    buildSkull() {
      const g = new T.SphereGeometry(1, 128, 96);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        // Wide dome on top, narrow pointed chin below
        const w = y > 0 ? 1 + 0.1 * y : 1 - 0.42 * Math.pow(-y, 1.6);
        x *= w;
        z *= w * (z > 0 ? 0.86 : 0.95);
        y *= y > 0 ? 1.18 : 1.12;
        p.setXYZ(i, x, y, z);
      }
      g.computeVertexNormals();
      this.skull = new T.Mesh(g, this.skin);
      this.head.add(this.skull);
      this.ray = new T.Raycaster();
    }

    /** Where a ray from `from` along `dir` meets the skull (head space). */
    hit(from, dir) {
      this.ray.set(from, dir.normalize());
      const h = this.ray.intersectObject(this.skull)[0];
      return { p: h.point, n: h.face.normal.clone() };
    }

    /** Stick a group onto the skull, facing out along the surface normal. */
    place(obj, x, y, inset, fromAbove) {
      const s = fromAbove
        ? this.hit(new T.Vector3(x, 5, y), new T.Vector3(0, -1, 0))
        : this.hit(new T.Vector3(x, y, 5), new T.Vector3(0, 0, -1));
      obj.position.copy(s.p).addScaledVector(s.n, -inset);
      obj.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), s.n);
      this.head.add(obj);
      return obj;
    }

    buildEyes() {
      const eyeMat = new T.MeshPhysicalMaterial({ color: 0x03050a, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });
      const irisMat = new T.MeshStandardMaterial({ color: 0x072530, emissive: 0x0e7490, emissiveIntensity: 0.55, roughness: 0.25 });
      const shineMat = new T.MeshBasicMaterial({ color: 0xffffff });
      this.eyes = [-1, 1].map((side) => {
        const socket = this.place(new T.Group(), side * 0.4, 0.08, 0.05);
        const tilt = new T.Group();
        tilt.rotation.z = side * 0.42; // outer corners up
        socket.add(tilt);
        const lid = new T.Group(); // squashed vertically to blink
        lid.scale.set(0.3, 0.17, 0.13);
        tilt.add(lid);
        lid.add(new T.Mesh(new T.SphereGeometry(1, 48, 32), eyeMat));
        const iris = new T.Mesh(new T.SphereGeometry(0.42, 32, 16), irisMat);
        iris.position.z = 0.72;
        lid.add(iris);
        const shine = new T.Mesh(new T.SphereGeometry(0.13, 16, 8), shineMat);
        shine.position.set(-0.4, 0.45, 0.82);
        lid.add(shine);
        const shine2 = new T.Mesh(new T.SphereGeometry(0.06, 12, 6), shineMat);
        shine2.position.set(0.38, -0.3, 0.9);
        lid.add(shine2);
        return { side, lid, iris };
      });
    }

    buildBrows() {
      const mat = new T.MeshPhysicalMaterial({ color: 0x34b466, roughness: 0.5, sheen: 0.5, sheenColor: new T.Color(0xb6ffcf) });
      this.brows = [-1, 1].map((side) => {
        const socket = this.place(new T.Group(), side * 0.42, 0.42, 0.02);
        const pivot = new T.Group();
        socket.add(pivot);
        const brow = new T.Mesh(new T.SphereGeometry(1, 24, 12), mat);
        brow.scale.set(0.24, 0.045, 0.07);
        pivot.add(brow);
        return { side, pivot };
      });
    }

    buildMouth() {
      this.mouth = this.place(new T.Group(), 0, -0.52, -0.012);
      this.lipMat = new T.MeshPhysicalMaterial({ color: 0x2e9f5c, roughness: 0.35, clearcoat: 0.6 });
      this.upperLip = new T.Mesh(new T.BufferGeometry(), this.lipMat);
      this.lowerLip = new T.Mesh(new T.BufferGeometry(), this.lipMat);
      this.corners = [0, 1].map(() => new T.Mesh(new T.SphereGeometry(1, 12, 8), this.lipMat));
      this.N = 18;
      const fill = new T.BufferGeometry();
      fill.setAttribute('position', new T.BufferAttribute(new Float32Array((this.N + 1) * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < this.N; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
      fill.setIndex(idx);
      this.mouthFill = new T.Mesh(fill, new T.MeshBasicMaterial({ color: 0x1c0714, side: T.DoubleSide }));
      this.tongue = new T.Mesh(new T.SphereGeometry(1, 20, 12),
        new T.MeshStandardMaterial({ color: 0xe0558a, roughness: 0.5 }));
      this.mouth.add(this.mouthFill, this.tongue, this.upperLip, this.lowerLip, ...this.corners);
    }

    buildAntennae() {
      const stalkMat = new T.MeshPhysicalMaterial({ color: 0x4ccf7a, roughness: 0.45, sheen: 0.5 });
      this.tipMat = new T.MeshStandardMaterial({ color: 0x0b1020, emissive: this.tipColor, emissiveIntensity: 1.1 });
      this.antennae = [-1, 1].map((side) => {
        const base = this.place(new T.Group(), side * 0.36, -0.05, 0.03, true);
        base.quaternion.identity();
        const pivot = new T.Group();
        base.add(pivot);
        const stalk = new T.Mesh(new T.CylinderGeometry(0.022, 0.04, 0.7, 12), stalkMat);
        stalk.position.y = 0.35;
        pivot.add(stalk);
        const tip = new T.Mesh(new T.SphereGeometry(0.085, 24, 16), this.tipMat);
        tip.position.y = 0.74;
        pivot.add(tip);
        const glow = new T.Sprite(new T.SpriteMaterial({
          map: glowTexture(), color: this.tipColor, transparent: true, depthWrite: false, blending: T.AdditiveBlending
        }));
        glow.scale.set(0.7, 0.7, 1);
        glow.position.y = 0.74;
        pivot.add(glow);
        return { side, pivot, glow, oz: 0, ox: 0, vz: 0, vx: 0 };
      });
    }

    buildCheeks() {
      this.cheeks = [-1, 1].map((side) => {
        const s = new T.Sprite(new T.SpriteMaterial({
          map: glowTexture(), color: 0xff5c93, transparent: true, opacity: 0, depthWrite: false
        }));
        s.scale.set(0.42, 0.26, 1);
        this.place(s, side * 0.6, -0.22, -0.06);
        return s;
      });
    }

    // ---------- Per-frame ----------
    setMood(mood) {
      this.tipTarget.setHex(MOOD_COLORS[mood] || MOOD_COLORS.neutral);
    }

    update(target, dt, time) {
      const e = this.e;
      const k = 1 - Math.exp(-dt * 14);
      const kf = 1 - Math.exp(-dt * 32);
      for (const key in NEUTRAL) e[key] = lerp(e[key], target[key] || 0, FAST.has(key) ? kf : k);

      // Head pose and a little float
      this.head.rotation.set(e.pitch, e.yaw, e.roll);
      this.root.position.y = Math.sin(time * 1.5) * 0.03;

      // Eyes
      const smile = (e.smileL + e.smileR) / 2;
      this.eyes.forEach((eye) => {
        const L = eye.side < 0;
        const open = clamp(1 - (L ? e.blinkL : e.blinkR) + (L ? e.wideL : e.wideR) * 0.4
          - (L ? e.squintL : e.squintR) * 0.3 - smile * 0.18, 0.04, 1.4);
        eye.lid.scale.y = 0.17 * open;
        eye.iris.position.set(clamp(e.gazeX, -1, 1) * 0.42, clamp(e.gazeY, -1, 1) * 0.42, 0.72);
      });

      // Brow ridges: inner up = worried, down = grumpy
      this.brows.forEach((b) => {
        const L = b.side < 0;
        const outer = L ? e.browOuterL : e.browOuterR;
        const down = L ? e.browDownL : e.browDownR;
        const wide = L ? e.wideL : e.wideR;
        b.pivot.position.y = 0.07 * (e.browInnerUp * 0.6 + outer * 0.6) + wide * 0.02 - down * 0.06;
        b.pivot.rotation.z = b.side * (0.18 + 0.4 * (outer - e.browInnerUp * 0.8 + down));
      });

      this.updateMouth(e);

      // Blush when smiling or puffing cheeks
      this.cheeks.forEach((c, i) => {
        const s = i === 0 ? e.smileL : e.smileR;
        c.material.opacity = clamp(s * 0.75 + e.cheekPuff * 0.6, 0, 0.85);
        const puff = 1 + e.cheekPuff * 0.5;
        c.scale.set(0.42 * puff, 0.26 * puff, 1);
      });

      // Antennae: springs kicked by head motion
      const dYaw = e.yaw - this.prevPose.yaw, dRoll = e.roll - this.prevPose.roll, dPitch = e.pitch - this.prevPose.pitch;
      this.prevPose = { yaw: e.yaw, pitch: e.pitch, roll: e.roll };
      this.tipColor.lerp(this.tipTarget, 1 - Math.exp(-dt * 6));
      this.tipMat.emissive.copy(this.tipColor);
      this.antennae.forEach((a) => {
        a.vz += (-70 * a.oz - 5 * a.vz) * dt - (dRoll + dYaw * 0.6) * 9;
        a.vx += (-70 * a.ox - 5 * a.vx) * dt - dPitch * 9;
        a.oz += a.vz * dt;
        a.ox += a.vx * dt;
        a.pivot.rotation.z = -a.side * (0.32 + (e.browInnerUp + e.wideL + e.wideR) * 0.08) + a.oz;
        a.pivot.rotation.x = -0.12 + a.ox;
        a.glow.material.color.copy(this.tipColor);
        a.glow.material.opacity = 0.55 + Math.sin(time * 4 + a.side) * 0.15;
      });
    }

    updateMouth(e) {
      const N = this.N;
      const sL = e.smileL - e.frownL * 0.9, sR = e.smileR - e.frownR * 0.9;
      const w = 0.2 * (1 + 0.35 * (e.stretchL + e.stretchR) / 2 + 0.22 * (e.smileL + e.smileR) / 2
        - 0.5 * e.pucker - 0.25 * e.funnel);
      const open = e.jawOpen * 0.3 + e.funnel * 0.06;
      const shift = clamp(e.mouthShift, -1, 1) * 0.06;
      const upper = [], lower = [];
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * 2 - 1;
        const x = t * w + shift;
        const lift = (t < 0 ? sL : sR) * 0.085 * t * t;
        const bell = 1 - t * t;
        const z = -0.55 * x * x + e.pucker * 0.06 * bell;
        upper.push(new T.Vector3(x, lift + bell * (open * 0.25 + e.upperUp * 0.035 + 0.006), z));
        lower.push(new T.Vector3(x, lift - bell * (open + e.lowerDown * 0.035 + 0.006), z));
      }
      const r = 0.022 * (1 + e.pucker * 0.7);
      this.upperLip.geometry.dispose();
      this.upperLip.geometry = new T.TubeGeometry(new T.CatmullRomCurve3(upper), 36, r, 8, false);
      this.lowerLip.geometry.dispose();
      this.lowerLip.geometry = new T.TubeGeometry(new T.CatmullRomCurve3(lower), 36, r * 1.1, 8, false);
      this.corners[0].position.copy(upper[0]);
      this.corners[1].position.copy(upper[N]);
      this.corners.forEach((c) => c.scale.setScalar(r * 1.05));

      // Dark inside of the mouth, between the lips
      const pos = this.mouthFill.geometry.attributes.position;
      for (let i = 0; i <= N; i++) {
        pos.setXYZ(i * 2, upper[i].x, upper[i].y, upper[i].z - 0.01);
        pos.setXYZ(i * 2 + 1, lower[i].x, lower[i].y, lower[i].z - 0.01);
      }
      pos.needsUpdate = true;
      this.mouthFill.geometry.computeBoundingSphere();

      // Tongue peeks out of an open mouth
      const mid = lower[N / 2];
      const tw = Math.min(w * 0.55, 0.09);
      this.tongue.visible = open > 0.03;
      this.tongue.position.set(shift, mid.y + 0.035, mid.z - 0.04);
      this.tongue.scale.set(tw, Math.min(open * 0.35, 0.05), 0.05);
    }
  }

  AlienHead.NEUTRAL = NEUTRAL;
  window.AlienHead = AlienHead;
})();
