import { MoyersDuckHunt } from "./game.js";

const params = new URLSearchParams(window.location.search);
const isEmbed = params.get("embed") === "1" || document.body.dataset.forceEmbed === "true";
const defaultCtaUrl = "https://moyersfirearmsllc.com/";
const ctaUrl = params.get("cta") || defaultCtaUrl;
const assetUrls = [
  "/assets/moyers-logo.png",
  "/assets/marsh-background.png",
  "/assets/duck-1.png",
  "/assets/duck-2.png",
  "/assets/duck-3.png",
  "/assets/duck-5.png",
  "/assets/bonus-eagle.png"
];

if (isEmbed) {
  document.body.classList.add("is-embed");
}

const loadingScreen = document.querySelector("#loadingScreen");
const ctaButton = document.querySelector("#ctaButton");

if (ctaButton) {
  ctaButton.href = ctaUrl;
}

const game = new MoyersDuckHunt({
  canvas: document.querySelector("#gameCanvas"),
  overlay: document.querySelector("#overlay"),
  message: document.querySelector("#message"),
  startButton: document.querySelector("#startButton"),
  muteButton: document.querySelector("#muteButton"),
  endSummary: document.querySelector("#endSummary"),
  ctaButton,
  ui: {
    score: document.querySelector("#score"),
    highScore: document.querySelector("#highScore"),
    menuHighScore: document.querySelector("#menuHighScore"),
    round: document.querySelector("#round"),
    escaped: document.querySelector("#escaped"),
    missLimit: document.querySelector("#missLimit"),
    shells: document.querySelector("#shells"),
    ammoText: document.querySelector("#ammoText"),
    streak: document.querySelector("#streak"),
    nextReward: document.querySelector("#nextReward"),
    hits: document.querySelector("#roundHits"),
    roundGoal: document.querySelector("#roundGoal")
  }
});

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ src, ok: true });
    image.onerror = () => resolve({ src, ok: false });
    image.src = src;
  });
}

Promise.all(assetUrls.map(preloadImage)).then(() => {
  game.init();
  Object.defineProperty(window, "MoyersDuckHuntReady", {
    configurable: true,
    enumerable: true,
    value: true
  });
  document.body.dataset.moyersDuckHuntReady = "true";
  loadingScreen?.classList.add("is-hidden");
});
