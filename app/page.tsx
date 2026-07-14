"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hands as HandsClass, Results } from "@mediapipe/hands";

declare global {
  interface Window {
    Hands: new (config: { locateFile: (file: string) => string }) => HandsClass;
  }
}

type Point = { x: number; y: number };
type Poop = Point & { state: "held" | "flying"; born: number; launched?: number };
type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spin: number;
  color: string;
  kind: "blob" | "star";
};

const COLORS = ["#5a2b16", "#7b3f1f", "#a95b2a", "#ffcf3d", "#ff7a59", "#fff3b0"];

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

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<HandsClass | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poopRef = useRef<Poop | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const handPointRef = useRef<Point | null>(null);
  const pinchFramesRef = useRef(0);
  const openFramesRef = useRef(0);
  const cooldownRef = useRef(0);
  const flashRef = useRef(0);
  const rafRef = useRef(0);
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
    const total = Math.min(115, Math.floor(window.innerWidth / 10));
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 20;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 5,
        life: 55 + Math.random() * 50,
        maxLife: 105,
        size: 8 + Math.random() * 34,
        spin: (Math.random() - .5) * .4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        kind: Math.random() > .72 ? "star" : "blob",
      });
    }
    particlesRef.current.push(...particles);
    flashRef.current = 14;
    setScore((value) => value + 1);
    setMessage("TOTAL POOP-OCALYPSE!");
    window.setTimeout(() => setMessage("PINCH TO RELOAD"), 650);
  }, []);

  const handleResults = useCallback((results: Results) => {
    const landmarks = results.multiHandLandmarks?.[0];
    if (!landmarks) {
      handPointRef.current = null;
      pinchFramesRef.current = 0;
      openFramesRef.current = 0;
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const p = (index: number): Point => ({ x: (1 - landmarks[index].x) * w, y: landmarks[index].y * h });
    const thumb = p(4);
    const index = p(8);
    const wrist = p(0);
    const palm = Math.max(distance(wrist, p(9)), 30);
    const pinchRatio = distance(thumb, index) / palm;
    const extended = [8, 12, 16, 20].filter((tip) => distance(p(tip), wrist) > distance(p(tip - 2), wrist) * 1.16).length;
    const pinching = pinchRatio < .48;
    const open = extended >= 4 && pinchRatio > .85;
    const midpoint = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 };
    handPointRef.current = midpoint;
    pinchFramesRef.current = pinching ? pinchFramesRef.current + 1 : 0;
    openFramesRef.current = open ? openFramesRef.current + 1 : 0;
    if (pinchFramesRef.current >= 2) makePoop(midpoint);
    if (openFramesRef.current >= 2) launchPoop();
  }, [launchPoop, makePoop]);

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
      hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: .62, minTrackingConfidence: .55 });
      hands.onResults(handleResults);
      handsRef.current = hands;
      runningRef.current = true;
      const detect = async () => {
        if (!runningRef.current || !videoRef.current || !handsRef.current) return;
        if (videoRef.current.readyState >= 2) await handsRef.current.send({ image: videoRef.current });
        rafRef.current = requestAnimationFrame(detect);
      };
      detect();
      setStatus("live");
      setMessage("PINCH YOUR FINGERS TO MAKE A POOP");
    } catch (error) {
      console.error(error);
      setStatus("error");
      setMessage("CAMERA SAID NO — USE PRESS & RELEASE");
    }
  }, [handleResults]);

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
        particle.vy += .34 * dt;
        particle.vx *= .992;
        particle.life -= dt;
        const alpha = Math.min(1, particle.life / 22);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.life * particle.spin);
        if (particle.kind === "star") drawStar(ctx, 0, 0, particle.size, particle.color);
        else {
          ctx.fillStyle = particle.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, particle.size, particle.size * .72, .4, 0, Math.PI * 2);
          ctx.fill();
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
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      handsRef.current?.close();
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

      <section className="hud" aria-live="polite">
        <div className={`live-dot ${status}`}><i />{status === "live" ? "CAMERA LIVE" : status === "loading" ? "LOADING" : "READY"}</div>
        <h1>{message}</h1>
        <div className="gesture-guide">
          <div><span className="gesture">🤏</span><p><b>PINCH</b><small>make a poop</small></p></div>
          <i className="arrow">→</i>
          <div><span className="gesture">🖐️</span><p><b>OPEN</b><small>launch & explode</small></p></div>
        </div>
      </section>

      {status === "idle" && (
        <button className="start" onPointerDown={(e) => e.stopPropagation()} onClick={startCamera}>
          <span>START CAMERA</span><small>or press anywhere to test</small>
        </button>
      )}

      <footer>NO POOPS WERE HARMED · PRESS + RELEASE ALSO WORKS</footer>
    </main>
  );
}
