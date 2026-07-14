"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hands as HandsClass, Results } from "@mediapipe/hands";
import type { FaceDetection as FaceDetectionClass, Results as FaceResults } from "@mediapipe/face_detection";

declare global {
  interface Window {
    Hands: new (config: { locateFile: (file: string) => string }) => HandsClass;
    FaceDetection: new (config: { locateFile: (file: string) => string }) => FaceDetectionClass;
  }
}

type Point = { x: number; y: number };
type Poop = Point & { state: "held" | "flying"; born: number; launched?: number };
type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scale: number;
  spin: number;
  mode: "burst" | "sludge";
};
type Weapon = {
  mode: "none" | "gun" | "grin";
  palm: Point;
  direction: Point;
  depth: number;
  scale: number;
  lastEmit: number;
  lastMuzzle: Point;
  dripUntil: number;
};
type FaceBox = Point & { width: number; height: number };

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawPoop(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(38, 16, 5, .34)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "#713719";
  ctx.beginPath();
  ctx.ellipse(0, 22, 48, 31, 0, 0, Math.PI * 2);
  ctx.ellipse(0, -2, 37, 30, 0, 0, Math.PI * 2);
  ctx.ellipse(3, -26, 25, 24, -.18, 0, Math.PI * 2);
  ctx.ellipse(9, -45, 12, 16, -.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "rgba(255,255,255,.14)";
  ctx.beginPath();
  ctx.ellipse(-17, -12, 8, 16, -.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.ellipse(-12, -1, 8, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(13, -1, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1f130d";
  ctx.beginPath();
  ctx.arc(-10, 1, 3, 0, Math.PI * 2);
  ctx.arc(15, 1, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1f130d";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(2, 13, 10, .2, Math.PI - .2);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? size * .34 : size;
    const angle = i * Math.PI / 8;
    ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGun(ctx: CanvasRenderingContext2D, palm: Point, direction: Point, scale: number, alpha = 1) {
  const angle = Math.atan2(direction.y, direction.x);
  ctx.save();
  ctx.translate(palm.x, palm.y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(10, 8, 5, .36)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 7;
  const metal = ctx.createLinearGradient(-65, -26, -65, 26);
  metal.addColorStop(0, "#f1f3ed");
  metal.addColorStop(.42, "#aeb5b3");
  metal.addColorStop(1, "#6f7779");
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.roundRect(-58, -25, 112, 48, 18);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(48, -32); ctx.lineTo(78, -22); ctx.lineTo(78, 22); ctx.lineTo(48, 31); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#525b5e";
  ctx.beginPath(); ctx.ellipse(77, 0, 9, 23, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#9aa2a1";
  ctx.beginPath(); ctx.ellipse(-58, 0, 20, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#26335b";
  ctx.beginPath(); ctx.moveTo(-44, 17); ctx.lineTo(-10, 20); ctx.lineTo(-20, 72); ctx.lineTo(-53, 65); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#e4b928";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-42, -12); ctx.bezierCurveTo(-20, -34, -7, 12, 10, -13);
  ctx.bezierCurveTo(24, -31, 30, 8, 47, -12); ctx.stroke();
  ctx.beginPath(); ctx.arc(-19, 46, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#f3d35b";
  ctx.beginPath(); ctx.arc(12, -12, 4, 0, Math.PI * 2); ctx.arc(46, -12, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return getGunMuzzle(palm, direction, scale);
}

function getGunMuzzle(palm: Point, direction: Point, scale: number) {
  const angle = Math.atan2(direction.y, direction.x);
  return { x: palm.x + Math.cos(angle) * 87 * scale, y: palm.y + Math.sin(angle) * 87 * scale };
}

function drawMudStream(ctx: CanvasRenderingContext2D, muzzle: Point, direction: Point, depth: number, now: number) {
  const perpendicular = { x: -direction.y, y: direction.x };
  const lateralLength = Math.min(360, Math.hypot(window.innerWidth, window.innerHeight) * .34);
  const length = Math.abs(depth) > .42 ? 165 : lateralLength;
  const end = { x: muzzle.x + direction.x * length, y: muzzle.y + direction.y * length };
  ctx.save();
  ctx.shadowColor = "rgba(48, 22, 9, .68)";
  ctx.shadowBlur = 20;

  if (Math.abs(depth) > .42) {
    const towardViewer = depth > 0;
    const layers = 13;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const perspective = towardViewer ? t : 1 - t;
      const travel = 16 + t * 150;
      const size = 10 + perspective * 82;
      const wobble = Math.sin(now / 80 + i * 1.7) * size * .11;
      const x = muzzle.x + direction.x * travel + perpendicular.x * wobble;
      const y = muzzle.y + direction.y * travel + perpendicular.y * wobble;
      const mud = ctx.createRadialGradient(x - size * .2, y - size * .2, 2, x, y, size);
      mud.addColorStop(0, "rgba(183, 111, 53, .96)");
      mud.addColorStop(.48, "rgba(105, 55, 26, .98)");
      mud.addColorStop(1, "rgba(52, 25, 12, .96)");
      ctx.fillStyle = mud;
      ctx.beginPath();
      ctx.ellipse(x, y, size * (1 + Math.sin(i * 2.3) * .14), size * .76, now / 900 + i, 0, Math.PI * 2);
      ctx.fill();
      if (i > 2) {
        ctx.fillStyle = "rgba(36, 19, 11, .8)";
        ctx.beginPath(); ctx.arc(x + size * .18, y - size * .08, Math.max(2, size * .09), 0, Math.PI * 2); ctx.fill();
      }
    }
  } else {
    const steps = 20;
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const travel = length * t;
      const wave = Math.sin(t * 16 + now / 75) * (3 + t * 10);
      const width = 4 + t * 23 + Math.sin(t * 25 - now / 95) * (1 + t * 4);
      const cx = muzzle.x + direction.x * travel + perpendicular.x * wave;
      const cy = muzzle.y + direction.y * travel + perpendicular.y * wave;
      left.push({ x: cx + perpendicular.x * width, y: cy + perpendicular.y * width });
      right.push({ x: cx - perpendicular.x * width, y: cy - perpendicular.y * width });
    }
    const mud = ctx.createLinearGradient(muzzle.x, muzzle.y, end.x, end.y);
    mud.addColorStop(0, "#713719");
    mud.addColorStop(.45, "#5d2e17");
    mud.addColorStop(1, "#3d1f10");
    ctx.fillStyle = mud;
    ctx.beginPath();
    ctx.moveTo(muzzle.x, muzzle.y);
    left.forEach((point) => ctx.lineTo(point.x, point.y));
    right.reverse().forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath(); ctx.fill();
    ctx.shadowColor = "transparent";
    for (let lane = 0; lane < 4; lane++) {
      ctx.strokeStyle = lane % 2 ? "rgba(190,115,55,.34)" : "rgba(41,21,12,.46)";
      ctx.lineWidth = 3 + lane * 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const travel = length * t;
        const offset = Math.sin(t * (13 + lane) + now / (82 + lane * 8)) * (2 + t * 12) + (lane - 1.5) * 4;
        const x = muzzle.x + direction.x * travel + perpendicular.x * offset;
        const y = muzzle.y + direction.y * travel + perpendicular.y * offset;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  ctx.shadowColor = "transparent";
  for (let i = 0; i < 16; i++) {
    const travel = ((i * 37 + now * .55) % length);
    const wobble = Math.sin(i * 2.4 + now / 90) * (5 + Math.abs(depth) * 18);
    const x = muzzle.x + direction.x * travel + perpendicular.x * wobble;
    const y = muzzle.y + direction.y * travel + perpendicular.y * wobble;
    ctx.fillStyle = i % 3 ? "#422313" : "#b26a35";
    ctx.beginPath(); ctx.ellipse(x, y, 3 + i % 5, 2 + i % 4, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return end;
}

function drawHonestGrin(ctx: CanvasRenderingContext2D, center: Point, scale: number) {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(scale, scale);
  ctx.shadowColor = "rgba(45, 21, 10, .35)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#f2ad55";
  ctx.beginPath(); ctx.arc(0, 0, 43, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#402316"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(-15, -7, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.beginPath(); ctx.arc(15, -7, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = "#d97554";
  ctx.beginPath(); ctx.arc(-26, 7, 7, 0, Math.PI * 2); ctx.arc(26, 7, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "white"; ctx.strokeStyle = "#402316"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(-25, 8, 50, 22, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, 9); ctx.lineTo(-8, 29); ctx.moveTo(8, 9); ctx.lineTo(8, 29); ctx.stroke();
  ctx.restore();
}

function drawClownMask(ctx: CanvasRenderingContext2D, face: FaceBox) {
  const size = Math.max(face.width, face.height) * 1.05;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.shadowColor = "rgba(0,0,0,.38)";
  ctx.shadowBlur = 12;
  ctx.fillText("🤡", face.x, face.y + face.height * .03);
  const label = "防误伤";
  ctx.font = `900 ${Math.max(16, face.width * .16)}px Arial, sans-serif`;
  const labelWidth = ctx.measureText(label).width + 30;
  const labelY = face.y - face.height * .68;
  ctx.shadowBlur = 7;
  ctx.fillStyle = "#ffd43b";
  ctx.strokeStyle = "#21150f";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(face.x - labelWidth / 2, labelY - 24, labelWidth, 38, 14); ctx.fill(); ctx.stroke();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#21150f";
  ctx.fillText(label, face.x, labelY - 5);
  ctx.restore();
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<HandsClass | null>(null);
  const faceDetectionRef = useRef<FaceDetectionClass | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poopRef = useRef<Poop | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const weaponRef = useRef<Weapon>({
    mode: "none", palm: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, depth: 0, scale: 1,
    lastEmit: 0, lastMuzzle: { x: 0, y: 0 }, dripUntil: 0,
  });
  const faceBoxRef = useRef<FaceBox | null>(null);
  const pinchFramesRef = useRef(0);
  const openFramesRef = useRef(0);
  const cooldownRef = useRef(0);
  const flashRef = useRef(0);
  const rafRef = useRef(0);
  const detectRafRef = useRef(0);
  const runningRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [message, setMessage] = useState("Ready for absolute nonsense?");
  const [score, setScore] = useState(0);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, []);

  const makePoop = useCallback((point: Point) => {
    if (Date.now() < cooldownRef.current || poopRef.current?.state === "flying") return;
    if (!poopRef.current) {
      poopRef.current = { ...point, state: "held", born: performance.now() };
      setMessage("POOP ACQUIRED — OPEN YOUR HAND!");
    } else if (poopRef.current.state === "held") {
      poopRef.current.x += (point.x - poopRef.current.x) * .45;
      poopRef.current.y += (point.y - poopRef.current.y) * .45;
    }
  }, []);

  const launchPoop = useCallback(() => {
    if (poopRef.current?.state !== "held") return;
    poopRef.current.state = "flying";
    poopRef.current.launched = performance.now();
    cooldownRef.current = Date.now() + 950;
    setMessage("YEET!");
  }, []);

  const explode = useCallback((x: number, y: number) => {
    const particles: Particle[] = [];
    const total = Math.min(105, Math.max(72, Math.floor(window.innerWidth / 8)));
    for (let i = 0; i < total; i++) {
      const targetX = Math.random() * window.innerWidth;
      const targetY = Math.random() * window.innerHeight;
      const travel = 22 + Math.random() * 25;
      particles.push({
        x, y,
        vx: (targetX - x) / travel,
        vy: (targetY - y) / travel - Math.random() * 3,
        life: 78 + Math.random() * 55,
        maxLife: 133,
        scale: .12 + Math.pow(Math.random(), 1.6) * 1.18,
        spin: (Math.random() - .5) * .4,
        mode: "burst",
      });
    }
    particlesRef.current.push(...particles);
    flashRef.current = 14;
    setScore((value) => value + 1);
    setMessage("TOTAL POOP-OCALYPSE!");
    window.setTimeout(() => setMessage("PINCH TO RELOAD"), 650);
  }, []);

  const handleResults = useCallback((results: Results) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sourceWidth = videoRef.current?.videoWidth || w;
    const sourceHeight = videoRef.current?.videoHeight || h;
    const containScale = Math.min(w / sourceWidth, h / sourceHeight);
    const cameraWidth = sourceWidth * containScale;
    const cameraHeight = sourceHeight * containScale;
    const cameraLeft = (w - cameraWidth) / 2;
    const cameraTop = (h - cameraHeight) / 2;
    let sawRight = false;
    let sawLeft = false;

    results.multiHandLandmarks?.forEach((landmarks, handIndex) => {
      const reported = results.multiHandedness?.[handIndex]?.label;
      // The camera pixels are not flipped before inference, so MediaPipe's selfie labels are reversed.
      const physicalHand = reported === "Left" ? "Right" : "Left";
      const p = (index: number): Point => ({
        x: cameraLeft + (1 - landmarks[index].x) * cameraWidth,
        y: cameraTop + landmarks[index].y * cameraHeight,
      });
      const wrist = p(0);
      const tips = [8, 12, 16, 20];
      const extendedTips = tips.filter((tip) => distance(p(tip), wrist) > distance(p(tip - 2), wrist) * 1.16);

      if (physicalHand === "Right") {
        sawRight = true;
        const thumb = p(4);
        const index = p(8);
        const palm = Math.max(distance(wrist, p(9)), 30);
        const pinchRatio = distance(thumb, index) / palm;
        const pinching = pinchRatio < .48;
        const open = extendedTips.length >= 4 && pinchRatio > .85;
        const midpoint = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
        pinchFramesRef.current = pinching ? pinchFramesRef.current + 1 : 0;
        openFramesRef.current = open ? openFramesRef.current + 1 : 0;
        if (pinchFramesRef.current >= 2) makePoop(midpoint);
        if (openFramesRef.current >= 2) launchPoop();
      } else {
        sawLeft = true;
        const isStraight3D = (mcp: number, pip: number, tipIndex: number) => {
          const a = landmarks[mcp];
          const b = landmarks[pip];
          const c = landmarks[tipIndex];
          const first = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
          const second = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
          const dot = first.x * second.x + first.y * second.y + first.z * second.z;
          const firstLength = Math.hypot(first.x, first.y, first.z);
          const secondLength = Math.hypot(second.x, second.y, second.z);
          return dot / Math.max(firstLength * secondLength, .0001) < -.68;
        };
        const straightFingers = [
          isStraight3D(5, 6, 8),
          isStraight3D(9, 10, 12),
          isStraight3D(13, 14, 16),
          isStraight3D(17, 18, 20),
        ];
        const indexExtended = straightFingers[0];
        const palm = p(9);
        const base = p(6);
        const tip = p(8);
        const screenLength = distance(base, tip);
        const depthPixels = (landmarks[6].z - landmarks[8].z) * cameraWidth;
        const directionLength3D = Math.max(Math.hypot(screenLength, depthPixels), 1);
        const direction = screenLength > 8
          ? { x: (tip.x - base.x) / screenLength, y: (tip.y - base.y) / screenLength }
          : weaponRef.current.direction;
        const depth = Math.max(-1, Math.min(1, depthPixels / directionLength3D));
        const weaponScale = Math.min(1.28, Math.max(.58, distance(wrist, palm) / 78));
        if (indexExtended) {
          weaponRef.current.mode = "gun";
          weaponRef.current.palm = palm;
          weaponRef.current.direction = direction;
          weaponRef.current.depth = depth;
          weaponRef.current.scale = weaponScale;
        } else if (straightFingers.every((value) => !value)) {
          if (weaponRef.current.mode === "gun") weaponRef.current.dripUntil = performance.now() + 1100;
          weaponRef.current.mode = "grin";
          weaponRef.current.palm = palm;
          weaponRef.current.scale = weaponScale;
        }
      }
    });

    if (!sawRight) {
      pinchFramesRef.current = 0;
      openFramesRef.current = 0;
    }
    if (!sawLeft && weaponRef.current.mode === "gun") weaponRef.current.mode = "none";
  }, [launchPoop, makePoop]);

  const handleFaceResults = useCallback((results: FaceResults) => {
    const detection = results.detections?.[0];
    if (!detection) {
      faceBoxRef.current = null;
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sourceWidth = videoRef.current?.videoWidth || w;
    const sourceHeight = videoRef.current?.videoHeight || h;
    const containScale = Math.min(w / sourceWidth, h / sourceHeight);
    const cameraWidth = sourceWidth * containScale;
    const cameraHeight = sourceHeight * containScale;
    const cameraLeft = (w - cameraWidth) / 2;
    const cameraTop = (h - cameraHeight) / 2;
    const box = detection.boundingBox;
    faceBoxRef.current = {
      x: cameraLeft + (1 - box.xCenter) * cameraWidth,
      y: cameraTop + box.yCenter * cameraHeight,
      width: box.width * cameraWidth,
      height: box.height * cameraHeight,
    };
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("loading");
    setMessage("WAKING UP THE POOP DETECTOR…");
    try {
      if (!window.Hands) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/mediapipe/hands.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Could not load hand tracking"));
          document.head.appendChild(script);
        });
      }
      if (!window.FaceDetection) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/face/face_detection.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Could not load face tracking"));
          document.head.appendChild(script);
        });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      const hands = new window.Hands({ locateFile: (file) => `/mediapipe/${file}` });
      hands.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: .62, minTrackingConfidence: .55 });
      hands.onResults(handleResults);
      handsRef.current = hands;
      const faceDetection = new window.FaceDetection({ locateFile: (file) => `/face/${file}` });
      faceDetection.setOptions({ model: "short", minDetectionConfidence: .55 });
      faceDetection.onResults(handleFaceResults);
      faceDetectionRef.current = faceDetection;
      runningRef.current = true;
      let frame = 0;
      const detect = async () => {
        if (!runningRef.current || !videoRef.current || !handsRef.current) return;
        if (videoRef.current.readyState >= 2) {
          await handsRef.current.send({ image: videoRef.current });
          frame++;
          if (frame % 3 === 0 && faceDetectionRef.current) await faceDetectionRef.current.send({ image: videoRef.current });
        }
        detectRafRef.current = requestAnimationFrame(detect);
      };
      detect();
      setStatus("live");
      setMessage("RIGHT HAND THROWS · LEFT HAND FIRES");
    } catch (error) {
      console.error(error);
      setStatus("error");
      setMessage("CAMERA SAID NO — USE PRESS & RELEASE");
    }
  }, [handleFaceResults, handleResults]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    const canvas = canvasRef.current;
    if (!canvas) return;
    let previous = performance.now();
    const render = (now: number) => {
      const dt = Math.min((now - previous) / 16.67, 2);
      previous = now;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (faceBoxRef.current) drawClownMask(ctx, faceBoxRef.current);

      const weapon = weaponRef.current;
      if (weapon.mode === "gun") {
        const muzzle = getGunMuzzle(weapon.palm, weapon.direction, weapon.scale);
        weapon.lastMuzzle = muzzle;
        const streamEnd = drawMudStream(ctx, muzzle, weapon.direction, weapon.depth, now);
        drawGun(ctx, weapon.palm, weapon.direction, weapon.scale);
        if (now - weapon.lastEmit > 36) {
          weapon.lastEmit = now;
          for (let i = 0; i < 7; i++) {
            const side = (Math.random() - .5) * (8 + Math.abs(weapon.depth) * 16);
            const depthAngle = Math.random() * Math.PI * 2;
            const depthBurst = Math.max(0, weapon.depth) * (8 + Math.random() * 16);
            particlesRef.current.push({
              x: streamEnd.x, y: streamEnd.y,
              vx: weapon.direction.x * (5 + Math.random() * 9) - weapon.direction.y * side + Math.cos(depthAngle) * depthBurst,
              vy: weapon.direction.y * (5 + Math.random() * 9) + weapon.direction.x * side + Math.sin(depthAngle) * depthBurst + 2,
              life: 28 + Math.random() * 20, maxLife: 48,
              scale: .18 + Math.random() * .45,
              spin: 0,
              mode: "sludge",
            });
          }
        }
      } else if (weapon.mode === "grin") {
        drawGun(ctx, weapon.palm, weapon.direction, weapon.scale, .82);
        drawHonestGrin(ctx, weapon.palm, weapon.scale * .9);
      }
      if (now < weapon.dripUntil) {
        if (now - weapon.lastEmit > 105) {
          weapon.lastEmit = now;
          particlesRef.current.push({
            x: weapon.lastMuzzle.x + (Math.random() - .5) * 7,
            y: weapon.lastMuzzle.y + 5,
            vx: (Math.random() - .5) * .8,
            vy: 2.5 + Math.random() * 2.2,
            life: 42 + Math.random() * 18, maxLife: 60,
            scale: .12 + Math.random() * .17,
            spin: 0,
            mode: "sludge",
          });
        }
      }
      const held = poopRef.current;
      if (held?.state === "held") {
        const bob = Math.sin((now - held.born) / 130) * 5;
        const pop = Math.min(1, (now - held.born) / 180);
        drawPoop(ctx, held.x, held.y + bob, (.55 + .45 * pop) * Math.min(window.innerWidth / 620, 1.15));
      } else if (held?.state === "flying" && held.launched) {
        const t = Math.min(1, (now - held.launched) / 620);
        const ease = 1 - Math.pow(1 - t, 3);
        const targetX = window.innerWidth * .5;
        const targetY = window.innerHeight * .46;
        const x = held.x + (targetX - held.x) * ease;
        const y = held.y + (targetY - held.y) * ease - Math.sin(t * Math.PI) * 120;
        for (let i = 4; i > 0; i--) {
          const trailT = Math.max(0, ease - i * .07);
          const tx = held.x + (targetX - held.x) * trailT;
          const ty = held.y + (targetY - held.y) * trailT - Math.sin(trailT * Math.PI) * 120;
          drawPoop(ctx, tx, ty, Math.max(.08, (1 - trailT * .78) * .65), .08);
        }
        drawPoop(ctx, x, y, Math.max(.18, 1 - ease * .8));
        if (t >= 1) {
          poopRef.current = null;
          explode(targetX, targetY);
        }
      }

      if (flashRef.current > 0) {
        const power = flashRef.current / 14;
        drawStar(ctx, window.innerWidth / 2, window.innerHeight / 2, Math.max(window.innerWidth, window.innerHeight) * power, `rgba(255,213,66,${power * .35})`);
        flashRef.current--;
      }

      particlesRef.current = particlesRef.current.filter((particle) => {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += (particle.mode === "sludge" ? .42 : .22) * dt;
        particle.vx *= particle.mode === "sludge" ? .985 : .992;
        particle.life -= dt;
        const alpha = Math.min(1, particle.life / 22);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.life * particle.spin);
        if (particle.mode === "burst") {
          drawPoop(ctx, 0, 0, particle.scale, alpha);
        } else {
          const radius = 7 + particle.scale * 25;
          ctx.fillStyle = "#713719";
          ctx.beginPath();
          ctx.ellipse(0, 0, radius * .72, radius, particle.vx * .02, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(225, 151, 75, .45)";
          ctx.beginPath(); ctx.ellipse(-radius * .2, -radius * .28, radius * .16, radius * .3, -.4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        return particle.life > 0 && particle.y < window.innerHeight + 80;
      });
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(rafRef.current);
      cancelAnimationFrame(detectRafRef.current);
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      handsRef.current?.close();
      faceDetectionRef.current?.close();
    };
  }, [explode, resizeCanvas]);

  const pointerDown = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    makePoop({ x: event.clientX, y: event.clientY });
  };
  const pointerMove = (event: React.PointerEvent) => {
    if (event.buttons || event.pointerType === "touch") makePoop({ x: event.clientX, y: event.clientY });
  };

  return (
    <main className="game" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={launchPoop}>
      <video ref={videoRef} className={`camera ${status === "live" ? "visible" : ""}`} playsInline muted />
      <div className="camera-tint" />
      <canvas ref={canvasRef} className="fx-canvas" />

      <header className="topbar">
        <div className="brand"><span>💩</span> POOP POP!</div>
        <div className="score"><span>BLASTS</span><strong>{score.toString().padStart(2, "0")}</strong></div>
      </header>

      <section className={`hud ${status === "live" ? "hud-live" : ""}`} aria-live="polite">
        <div className={`live-dot ${status}`}><i />{status === "live" ? "CAMERA LIVE" : status === "loading" ? "LOADING" : "READY"}</div>
        <h1>{message}</h1>
        <div className="hand-guides">
          <div className="gesture-guide"><strong>RIGHT</strong><span className="gesture">🤏 → 🖐️</span><p><b>THROW</b><small>pinch, then open</small></p></div>
          <div className="gesture-guide laser-guide"><strong>LEFT</strong><span className="gesture">☝️ → ✊</span><p><b>POOP LASER</b><small>point to fire, fist to stop</small></p></div>
        </div>
      </section>

      {status === "live" && (
        <div className="live-controls">
          <span><b>R</b> 🤏 → 🖐️ THROW</span>
          <span className="aim-control"><b>L</b> ☝️ AIM & SPRAY · ✊ STOP</span>
        </div>
      )}

      {status === "idle" && (
        <button className="start" onPointerDown={(e) => e.stopPropagation()} onClick={startCamera}>
          <span>START CAMERA</span><small>or press anywhere to test</small>
        </button>
      )}

      <footer className={status === "live" ? "hidden-footer" : ""}>NO POOPS WERE HARMED · PRESS + RELEASE ALSO WORKS</footer>
    </main>
  );
}
