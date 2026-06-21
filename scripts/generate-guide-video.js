const fs = require("fs");
const { chromium } = require("playwright");

const fontPath = "C:/Windows/Fonts/malgun.ttf";

async function main() {
  const fontBase64 = fs.readFileSync(fontPath).toString("base64");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const result = await page.evaluate(async ({ fontBase64 }) => {
    const font = new FontFace("GuideKR", `url(data:font/ttf;base64,${fontBase64}) format("truetype")`);
    await font.load();
    document.fonts.add(font);
    await document.fonts.ready;

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
      { title: "gardeningatlas 사용법", lines: ["사진과 도면을 준비한 뒤", "앱 화면에서 순서대로 업로드합니다."], accent: "#2f7d4f", mode: "home" },
      { title: "1. 식물 사진 준비", lines: ["휴대폰으로 밝고 선명하게 촬영", "전체, 잎, 꽃, 열매 사진을 따로 저장"], accent: "#477aa3", mode: "photo" },
      { title: "2. 도면 올리기", lines: ["도면 스캔 탭에서 JPG 또는 PNG 선택", "스캔 후 마당 지도에서 위치를 확인"], accent: "#b75d42", mode: "scan" },
      { title: "3. 관리자 사진 관리", lines: ["관리자는 식물 이름이나 학명으로 검색", "각 사진 칸에 파일을 선택해 저장"], accent: "#c9962b", mode: "admin" },
      { title: "4. 바로 반영 확인", lines: ["새 사진은 자동 사진보다 먼저 표시", "잘못 올리면 같은 칸에 다시 업로드"], accent: "#2f7d4f", mode: "confirm" },
      { title: "완료", lines: ["식물 도감, 상세 화면, 마당 지도 확인", "PC와 모바일에서 같은 순서로 사용할 수 있습니다."], accent: "#13231b", mode: "done" }
    ];
    const framesPerSlide = 90;
    const frameDelayMs = 33;

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function drawText(value, x, y, size, weight = 700, color = "#17201b") {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px GuideKR`;
      ctx.fillText(value, x, y);
    }

    function drawMockUi(slideIndex, slide) {
      ctx.fillStyle = "#e9eee7";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#13231b";
      ctx.fillRect(0, 0, 270, canvas.height);
      drawText("gardeningatlas", 38, 58, 25, 800, "#eef7ee");
      ["대시보드", "도면 스캔", "식물 도감", "채팅", "요금제", "사용법"].forEach((item, i) => {
        const y = 105 + i * 52;
        ctx.fillStyle = item === "사용법" ? "rgba(255,255,255,.17)" : "rgba(255,255,255,.05)";
        roundRect(24, y, 220, 38, 8);
        ctx.fill();
        drawText(item, 55, y + 25, 17, 700, "#dce9df");
      });
      ctx.fillStyle = "#fbfcf7";
      roundRect(310, 48, 900, 595, 8);
      ctx.fill();
      ctx.strokeStyle = "#d8dfd8";
      ctx.lineWidth = 2;
      ctx.stroke();
      drawText(slide.mode === "scan" ? "도면 스캔" : slide.mode === "admin" ? "식물 사진 직접 관리" : "사용법", 350, 108, 34, 900);
      ctx.fillStyle = "#f3f7f0";
      roundRect(350, 145, 260, 410, 8);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 6; i++) {
        roundRect(370, 170 + i * 58, 220, 42, 8);
        ctx.fill();
      }
      ctx.fillStyle = slide.accent;
      roundRect(380, 180 + Math.min(slideIndex, 5) * 48, 180, 12, 6);
      ctx.fill();
      if (slide.mode === "scan") {
        ctx.fillStyle = "#fff";
        roundRect(650, 185, 430, 250, 8);
        ctx.fill();
        ctx.strokeStyle = "#d8dfd8";
        ctx.stroke();
        ctx.strokeStyle = slide.accent;
        ctx.lineWidth = 4;
        ctx.strokeRect(690, 235, 350, 145);
        drawText("도면 파일 선택", 758, 318, 25, 900, slide.accent);
        return;
      }
      ["전체 사진", "잎 사진", "꽃 사진", "씨·열매 사진"].forEach((label, i) => {
        const x = 650 + (i % 2) * 230;
        const y = 170 + Math.floor(i / 2) * 185;
        ctx.fillStyle = "#fff";
        roundRect(x, y, 200, 155, 8);
        ctx.fill();
        ctx.strokeStyle = "#d8dfd8";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = i === slideIndex % 4 ? slide.accent : "#dfeadf";
        roundRect(x + 18, y + 18, 164, 86, 8);
        ctx.fill();
        drawText(label, x + 18, y + 128, 17, 700);
      });
    }

    function drawCaption(slide, progress) {
      ctx.fillStyle = "rgba(251,252,247,.95)";
      roundRect(320, 460, 850, 180, 8);
      ctx.fill();
      ctx.strokeStyle = "#d8dfd8";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = slide.accent;
      roundRect(350, 488, 14, 96, 7);
      ctx.fill();
      drawText(slide.title, 390, 520, 40, 900);
      slide.lines.forEach((line, i) => drawText(line, 390, 568 + i * 38, 26, 700));
      ctx.fillStyle = "#d8dfd8";
      roundRect(350, 610, 780, 12, 6);
      ctx.fill();
      ctx.fillStyle = slide.accent;
      roundRect(350, 610, 780 * progress, 12, 6);
      ctx.fill();
    }

    drawMockUi(0, slides[0]);
    drawCaption(slides[0], 0);
    const preview = canvas.toDataURL("image/png").split(",")[1];

    recorder.start();
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex++) {
      const slide = slides[slideIndex];
      for (let frame = 0; frame < framesPerSlide; frame++) {
        const progress = (slideIndex * framesPerSlide + frame) / (slides.length * framesPerSlide);
        drawMockUi(slideIndex, slide);
        drawCaption(slide, progress);
        await new Promise(resolve => setTimeout(resolve, frameDelayMs));
      }
    }
    recorder.stop();
    await new Promise(resolve => {
      recorder.onstop = resolve;
    });
    const blob = new Blob(chunks, { type: "video/webm" });
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const size = 0x8000;
    for (let i = 0; i < bytes.length; i += size) {
      binary += String.fromCharCode(...bytes.subarray(i, i + size));
    }
    return { video: btoa(binary), preview };
  }, { fontBase64 });
  fs.writeFileSync("assets/admin-upload-guide.webm", Buffer.from(result.video, "base64"));
  fs.writeFileSync("assets/admin-upload-guide-preview.png", Buffer.from(result.preview, "base64"));
  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
