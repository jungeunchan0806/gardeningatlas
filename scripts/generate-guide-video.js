const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outputVideo = path.join(root, "assets", "admin-upload-guide.webm");
const outputPreview = path.join(root, "assets", "admin-upload-guide-preview.png");

async function main() {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(chromePath) ? chromePath : undefined
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
    const chunks = [];
    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };

    const slides = [
      { title: "gardeningatlas 사용법", lines: ["사진과 도면을 준비하고", "마당 지도에서 식물을 확인합니다."], mode: "home", accent: "#2f7d4f" },
      { title: "1. 마당 도면 준비", lines: ["위에서 본 사진, 지도 캡처, 손그림 도면", "밝고 선명한 JPG 또는 PNG를 준비하세요."], mode: "scan", accent: "#477aa3" },
      { title: "2. 도면 올리기", lines: ["도면 스캔에서 파일을 선택하고", "분석 결과를 마당 지도에 반영합니다."], mode: "upload", accent: "#b75d42" },
      { title: "3. 식물 도감 검색", lines: ["식물 이름이나 특징으로 검색하고", "전체, 잎, 꽃, 씨·열매 이미지를 확인합니다."], mode: "catalog", accent: "#7b6bd6" },
      { title: "4. 마당 지도 확인", lines: ["식물 위치와 물주기 정보를 보고", "필요하면 배치를 수정합니다."], mode: "map", accent: "#2f7d4f" },
      { title: "완료", lines: ["오늘 할 일과 계절 관리 정보를", "PC와 모바일에서 이어서 확인하세요."], mode: "done", accent: "#13231b" }
    ];

    const framesPerSlide = 78;
    const frameDelayMs = 33;

    function rounded(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function fillRound(x, y, w, h, r, color) {
      ctx.fillStyle = color;
      rounded(x, y, w, h, r);
      ctx.fill();
    }

    function text(value, x, y, size, weight = 700, color = "#17201b") {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif`;
      ctx.fillText(value, x, y);
    }

    function drawSidebar(active) {
      ctx.fillStyle = "#13231b";
      ctx.fillRect(0, 0, 270, 720);
      fillRound(32, 34, 34, 34, 8, "#c8e88e");
      text("Y", 44, 58, 17, 900, "#13231b");
      text("gardeningatlas", 80, 52, 23, 900, "#eef7ee");
      text("마당 식물 지도", 80, 76, 14, 700, "#b8c9be");
      ["대시보드", "도면 스캔", "식물 도감", "채팅", "요금제", "사용법"].forEach((item, i) => {
        const y = 118 + i * 54;
        fillRound(24, y, 220, 42, 8, item === active ? "rgba(255,255,255,.16)" : "transparent");
        text(item, 54, y + 27, 17, 800, "#dce9df");
      });
      fillRound(18, 596, 226, 82, 8, "rgba(255,255,255,.08)");
      text("PC UI", 54, 628, 16, 800, "#eef7ee");
      fillRound(32, 646, 52, 26, 13, "#e9f7d8");
      text("FREE", 42, 665, 13, 900, "#13231b");
    }

    function drawMap(x, y) {
      fillRound(x, y, 430, 310, 8, "#dfe9d9");
      ctx.strokeStyle = "#9aae98";
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 28, y + 28, 374, 254);
      fillRound(x + 172, y + 110, 90, 118, 2, "#efe9dc");
      fillRound(x + 36, y + 70, 116, 120, 28, "rgba(94,128,88,.22)");
      fillRound(x + 294, y + 62, 86, 156, 26, "rgba(94,128,88,.22)");
      [[78, 96], [312, 104], [112, 242], [330, 238]].forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(x + px, y + py, 16, 0, Math.PI * 2);
        ctx.fillStyle = "#2f7d4f";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
      });
    }

    function drawCatalog(x, y) {
      for (let i = 0; i < 6; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        fillRound(x + col * 154, y + row * 150, 138, 132, 8, "#fff");
        fillRound(x + col * 154 + 16, y + row * 150 + 14, 106, 70, 8, i % 2 ? "#e7efe1" : "#dfeadf");
        ctx.beginPath();
        ctx.arc(x + col * 154 + 68, y + row * 150 + 50, 24, 0, Math.PI * 2);
        ctx.fillStyle = ["#d95a3a", "#2f7d4f", "#7b6bd6", "#d96f8a"][i % 4];
        ctx.fill();
        text(["단풍나무", "소나무", "라벤더", "수국", "장미", "억새"][i], x + col * 154 + 16, y + row * 150 + 108, 15, 800);
      }
    }

    function drawScreen(slide, slideIndex) {
      ctx.fillStyle = "#e9eee7";
      ctx.fillRect(0, 0, 1280, 720);
      const active = slide.mode === "catalog" ? "식물 도감" : slide.mode === "scan" || slide.mode === "upload" ? "도면 스캔" : slide.mode === "home" ? "사용법" : "대시보드";
      drawSidebar(active);
      text(slide.mode === "catalog" ? "1000가지 식물 도감" : slide.mode === "scan" || slide.mode === "upload" ? "도면 스캔" : "우리 집 마당을 식물 지도로 관리", 320, 72, 38, 900);
      text("사진, 도면, 식물 정보를 한 화면에서 확인하세요.", 320, 112, 20, 600, "#66736b");

      if (slide.mode === "catalog") {
        fillRound(320, 140, 270, 42, 8, "#fff");
        text("식물 이름 검색", 342, 168, 17, 700, "#66736b");
        drawCatalog(320, 210);
      } else if (slide.mode === "scan" || slide.mode === "upload") {
        fillRound(320, 150, 390, 260, 8, "#fff");
        ctx.strokeStyle = "#cbd8ce";
        ctx.setLineDash([9, 8]);
        ctx.strokeRect(350, 182, 330, 160);
        ctx.setLineDash([]);
        text("마당 사진이나 설계도면 선택", 385, 260, 24, 900, slide.accent);
        fillRound(430, 300, 170, 46, 8, "#2f7d4f");
        text("파일 선택", 478, 330, 19, 900, "#fff");
        fillRound(740, 150, 350, 260, 8, "#fff");
        text("스캔 구현 방식", 772, 198, 26, 900);
        ["이미지 정리", "마당 영역 찾기", "스케일 맞추기"].forEach((line, i) => text(`${i + 1}. ${line}`, 786, 246 + i * 48, 20, 800, "#415047"));
      } else {
        drawMap(330, 150);
        fillRound(810, 150, 330, 92, 8, "#fff");
        text("오늘 할 일", 838, 194, 24, 900);
        text("물주기 · 계절 관리 자동 생성", 838, 224, 18, 700, "#66736b");
      }

      fillRound(320, 500, 850, 156, 8, "rgba(251,252,247,.96)");
      fillRound(350, 528, 14, 86, 7, slide.accent);
      text(slide.title, 390, 560, 38, 900);
      slide.lines.forEach((line, i) => text(line, 390, 604 + i * 34, 24, 700, "#415047"));
      fillRound(350, 632, 760, 10, 5, "#d8dfd8");
      fillRound(350, 632, 760 * ((slideIndex + 1) / slides.length), 10, 5, slide.accent);
    }

    drawScreen(slides[0], 0);
    const preview = canvas.toDataURL("image/png").split(",")[1];

    recorder.start();
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex++) {
      for (let frame = 0; frame < framesPerSlide; frame++) {
        drawScreen(slides[slideIndex], slideIndex);
        await new Promise(resolve => setTimeout(resolve, frameDelayMs));
      }
    }
    recorder.stop();
    await new Promise(resolve => {
      recorder.onstop = resolve;
    });
    const buffer = await new Blob(chunks, { type: "video/webm" }).arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return { video: btoa(binary), preview };
  });

  fs.writeFileSync(outputVideo, Buffer.from(result.video, "base64"));
  fs.writeFileSync(outputPreview, Buffer.from(result.preview, "base64"));
  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
