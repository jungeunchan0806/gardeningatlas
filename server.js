const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const root = __dirname;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");
const usersFile = path.join(dataDir, "users.json");
const yardsFile = path.join(dataDir, "yards.json");
const plantImageFile = path.join(dataDir, "plant-images.json");
const paymentsFile = path.join(dataDir, "payments.json");

loadEnvFile(path.join(root, ".env"));

const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || "0.0.0.0";
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const tossClientKey = process.env.TOSS_CLIENT_KEY || "";
const tossSecretKey = process.env.TOSS_SECRET_KEY || "";
const tossWebhookSecret = process.env.TOSS_WEBHOOK_SECRET || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom = process.env.EMAIL_FROM || "gardeningatlas <noreply@gardeningatlas.com>";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const adminAccount = {
  email: "jungeunchan0806@gmail.com",
  username: "ec0806",
  password: "Chan0806!",
  name: "정은찬",
  plan: "max",
  role: "admin"
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webm": "video/webm"
};

function ensureData() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify({ users: [], resetCodes: {}, signupCodes: {}, messages: [], sessions: [] }, null, 2), "utf8");
  }
  if (!fs.existsSync(yardsFile)) {
    fs.writeFileSync(yardsFile, JSON.stringify({ yards: [] }, null, 2), "utf8");
  }
  if (!fs.existsSync(plantImageFile)) {
    fs.writeFileSync(plantImageFile, JSON.stringify({ images: {} }, null, 2), "utf8");
  }
  if (!fs.existsSync(paymentsFile)) {
    fs.writeFileSync(paymentsFile, JSON.stringify({ orders: [] }, null, 2), "utf8");
  }
  const db = readDb();
  if (!findUser(db, adminAccount.email) && !findUser(db, adminAccount.username)) {
    db.users.push({
      email: adminAccount.email,
      username: adminAccount.username,
      passwordHash: hashPassword(adminAccount.password),
      name: adminAccount.name,
      plan: adminAccount.plan,
      role: adminAccount.role,
      createdAt: new Date().toISOString()
    });
    writeDb(db);
  }
}

function readDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usersFile, "utf8").replace(/^\uFEFF/, ""));
    return { users: parsed.users || [], resetCodes: parsed.resetCodes || {}, signupCodes: parsed.signupCodes || {}, messages: parsed.messages || [], sessions: parsed.sessions || [] };
  } catch {
    return { users: [], resetCodes: {}, signupCodes: {}, messages: [], sessions: [] };
  }
}

function writeDb(db) {
  fs.writeFileSync(usersFile, JSON.stringify(db, null, 2), "utf8");
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function hashPassword(password) {
  return bcrypt.hashSync(String(password), 12);
}

function legacyHashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function verifyPassword(user, password) {
  const stored = String(user?.passwordHash || "");
  if (!stored) return false;
  if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
    return bcrypt.compareSync(String(password), stored);
  }
  const ok = stored === legacyHashPassword(password);
  if (ok) {
    user.passwordHash = hashPassword(password);
    user.passwordUpgradedAt = new Date().toISOString();
  }
  return ok;
}

function publicUser(user) {
  if (!user) return null;
  return {
    email: user.email || "",
    username: user.username || "",
    name: user.name || user.username || user.email || "사용자",
    plan: user.role === "admin" ? "max" : (user.plan || "free"),
    role: user.role || "user",
    emailVerified: Boolean(user.emailVerified || user.role === "admin"),
    subscriptionStatus: user.subscriptionStatus || (user.plan && user.plan !== "free" ? "active" : "free"),
    paidUntil: user.paidUntil || ""
  };
}

function findUser(db, loginId) {
  const normalized = String(loginId || "").trim().toLowerCase();
  return db.users.find(user =>
    String(user.email || "").toLowerCase() === normalized ||
    String(user.username || "").toLowerCase() === normalized
  );
}

function ownerKey(user) {
  return String(user?.email || user?.username || "").trim().toLowerCase();
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function createSession(db, user) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions = (db.sessions || []).filter(session => session.expiresAt > Date.now());
  db.sessions.push({
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    owner: ownerKey(user),
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  });
  return token;
}

function authenticate(req, db, body = {}) {
  const token = getBearerToken(req) || String(body.authToken || "");
  if (token) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const session = (db.sessions || []).find(item => item.tokenHash === tokenHash && item.expiresAt > Date.now());
    if (session) return findUser(db, session.owner);
  }
  return null;
}

function requireAdmin(req, db, body = {}) {
  const user = authenticate(req, db, body);
  return user?.role === "admin" ? user : null;
}

function readYards() {
  return readJsonFile(yardsFile, { yards: [] });
}

function writeYards(payload) {
  writeJsonFile(yardsFile, payload);
}

function normalizeYardPayload(body, user) {
  const mapped = Array.isArray(body.mapped) ? body.mapped.slice(0, 500).map(item => ({
    id: Number(item.id) || 0,
    x: Math.max(0, Math.min(100, Number(item.x) || 0)),
    y: Math.max(0, Math.min(100, Number(item.y) || 0))
  })).filter(item => item.id > 0) : [];
  const image = String(body.yardImage || body.image || "");
  if (image && !/^data:image\/(?:png|jpe?g|webp);base64,/i.test(image)) {
    throw new Error("지원하지 않는 도면 이미지 형식입니다.");
  }
  if (image.length > 6_000_000) {
    throw new Error("도면 이미지가 너무 큽니다. 더 작은 이미지로 업로드해주세요.");
  }
  return {
    id: String(body.id || "default"),
    owner: ownerKey(user),
    name: String(body.name || "내 마당").trim().slice(0, 80),
    yardImage: image,
    yardZoom: Math.max(0.75, Math.min(3, Number(body.yardZoom) || 1)),
    scanCount: Math.max(0, Number(body.scanCount) || 0),
    mapped,
    updatedAt: new Date().toISOString()
  };
}

async function sendEmail({ to, subject, text }) {
  if (!resendApiKey) return { sent: false, provider: "dev" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: emailFrom, to, subject, text })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "이메일 발송에 실패했습니다.");
  return { sent: true, provider: "resend", id: payload.id || "" };
}

async function sendSignupEmail(to, code, name) {
  return sendEmail({
    to,
    subject: "gardeningatlas 회원가입 인증번호",
    text: `안녕하세요 ${name || ""}님.\n\ngardeningatlas 회원가입 인증번호는 ${code} 입니다.\n이 코드는 10분 뒤 만료됩니다.\n\n요청한 적이 없다면 이 메일을 무시하세요.`
  });
}

async function sendResetEmail(to, code, user) {
  return sendEmail({
    to,
    subject: "gardeningatlas 비밀번호 재설정 인증번호",
    text: `안녕하세요 ${user.name || user.username || ""}님.\n\ngardeningatlas 비밀번호 재설정 인증번호는 ${code} 입니다.\n이 코드는 10분 뒤 만료됩니다.\n\n요청한 적이 없다면 이 메일을 무시하세요.`
  });
}

function isAdminMessage(db, message) {
  const sender = findUser(db, message.fromEmail) || findUser(db, message.fromUsername);
  return sender?.role === "admin";
}

function planPrice(plan) {
  return { plus: 5900, max: 9900 }[plan] || 0;
}

function addOneMonth(date = new Date()) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

function escapeSvgText(value) {
  return String(value || "plant").replace(/[<>&"]/g, "");
}

function plantProfile(name, latin, type) {
  const text = `${name} ${latin}`.toLowerCase();
  const base = { type: type || "flower", color: "#4f8b56", accent: "#d96f8a", plant: "flower", leaf: "oval", fruit: "seed" };
  if (/acer|단풍/.test(text)) return { ...base, color: "#d95a3a", accent: "#b94b2b", plant: "tree", leaf: "maple", fruit: "samara" };
  if (/pinus|소나무|juniperus|cedrus|abies|picea|tsuga|thuja|cupressus|cryptomeria/.test(text)) return { ...base, color: "#2f7d4f", accent: "#8b643c", plant: "conifer", leaf: "needle", fruit: "cone" };
  if (/miscanthus|pennisetum|carex|festuca|zoysia|grass|억새|사초|잔디|수크령/.test(text) || type === "grass") return { ...base, color: "#8aa15e", accent: "#c9a75b", plant: "grass", leaf: "blade", fruit: "grain" };
  if (/fern|pteridium|dryopteris|adiantum|matteuccia|고사리|관중/.test(text) || type === "fern") return { ...base, color: "#4e8b55", accent: "#9b6b38", plant: "fern", leaf: "frond", fruit: "spore" };
  if (/aloe|echeveria|sedum|agave|haworthia|kalanchoe|succulent|알로에|에케베리아|세덤|용설란/.test(text) || type === "succulent") return { ...base, color: "#6fae91", accent: "#e08c65", plant: "rosette", leaf: "succulent", fruit: "capsule" };
  if (/carrot|daucus|당근/.test(text)) return { ...base, color: "#4f9b62", accent: "#e87522", plant: "vegetable", leaf: "feathery", fruit: "root" };
  if (/tomato|lycopersicum|토마토/.test(text)) return { ...base, color: "#4d9655", accent: "#d9412e", plant: "vegetable", leaf: "compound", fruit: "tomato" };
  if (/pepper|capsicum|고추|파프리카/.test(text)) return { ...base, color: "#4c9658", accent: "#d83f2f", plant: "vegetable", leaf: "lance", fruit: "pepper" };
  if (/cucumber|cucumis|오이|호박|cucurbita/.test(text)) return { ...base, color: "#539a52", accent: "#6ba83f", plant: "vine", leaf: "lobed", fruit: "gourd" };
  if (/rose|rosa|장미/.test(text)) return { ...base, color: "#4f8b56", accent: "#d64663", plant: "shrub", leaf: "serrated", fruit: "hip" };
  if (/hydrangea|수국/.test(text)) return { ...base, color: "#508d59", accent: "#7fa8dc", plant: "shrub", leaf: "oval", fruit: "cluster" };
  if (/lavandula|라벤더/.test(text)) return { ...base, color: "#6f9c71", accent: "#8b6bd6", plant: "herb", leaf: "needle", fruit: "spike" };
  if (/citrus|귤|레몬|라임|유자/.test(text)) return { ...base, color: "#528c50", accent: "#e6a72d", plant: "tree", leaf: "oval", fruit: "citrus" };
  if (/malus|사과/.test(text)) return { ...base, color: "#5f965b", accent: "#d74332", plant: "tree", leaf: "oval", fruit: "apple" };
  if (/vitis|포도/.test(text)) return { ...base, color: "#57915a", accent: "#60439c", plant: "vine", leaf: "lobed", fruit: "grape" };
  if (type === "tree") return { ...base, plant: "tree", fruit: "berry" };
  if (type === "shrub") return { ...base, plant: "shrub", fruit: "berry" };
  if (type === "vine") return { ...base, plant: "vine", leaf: "heart", fruit: "pod" };
  if (type === "vegetable" || type === "crop") return { ...base, plant: "vegetable", fruit: "seed" };
  if (type === "aquatic") return { ...base, plant: "aquatic", leaf: "round", fruit: "pod" };
  if (type === "foliage") return { ...base, plant: "foliage", leaf: "pattern" };
  return base;
}

function leafSvg(profile) {
  const c = profile.color;
  if (profile.leaf === "maple") return `<path d="M210 54l19 53 44-34-18 57 58 2-52 26 36 42-55-12 6 58-38-44-38 44 6-58-55 12 36-42-52-26 58-2-18-57 44 34z" fill="${c}"/><path d="M210 108v128" stroke="#5d4b2f" stroke-width="8" stroke-linecap="round"/>`;
  if (profile.leaf === "needle") return `<g stroke="${c}" stroke-width="10" stroke-linecap="round"><path d="M210 54c-18 58-44 106-86 148"/><path d="M210 54c8 64 6 122-4 178"/><path d="M210 54c32 58 66 104 112 146"/><path d="M210 54c-45 42-86 74-128 100"/><path d="M210 54c44 38 84 70 128 94"/></g>`;
  if (profile.leaf === "blade") return `<g stroke="${c}" stroke-width="12" stroke-linecap="round"><path d="M112 250c28-102 56-158 94-202"/><path d="M190 254c8-112 24-172 50-216"/><path d="M270 254c-12-104-6-166 24-208"/><path d="M344 250c-34-92-46-152-30-204"/></g>`;
  if (profile.leaf === "frond") return `<path d="M86 250c70-126 128-176 252-202" stroke="${c}" stroke-width="8" fill="none"/><g stroke="${c}" stroke-width="6" stroke-linecap="round">${Array.from({ length: 9 }, (_, i) => `<path d="M${116 + i * 23} ${225 - i * 17}c-22-8-40-20-54-35"/><path d="M${116 + i * 23} ${225 - i * 17}c24-16 46-26 70-30"/>`).join("")}</g>`;
  if (profile.leaf === "succulent") return `<g fill="${c}">${Array.from({ length: 12 }, (_, i) => `<ellipse cx="210" cy="150" rx="35" ry="88" transform="rotate(${i * 30} 210 150)" opacity=".82"/>`).join("")}</g><circle cx="210" cy="150" r="34" fill="#8fc3a8"/>`;
  if (profile.leaf === "round") return `<circle cx="210" cy="145" r="96" fill="${c}"/><path d="M210 145L286 82" stroke="#e9f1e8" stroke-width="8" stroke-linecap="round"/>`;
  return `<path d="M205 82c-72-44-126 4-144 70 68 24 121 10 144-70z" fill="${c}"/><path d="M215 78c76-38 128 14 138 80-70 18-121 0-138-80z" fill="#6da765"/><path d="M210 116v118" stroke="#557449" stroke-width="10" stroke-linecap="round"/><path d="M208 175c-50-28-87-14-111 36 50 16 86 4 111-36z" fill="#7eb473"/><path d="M218 174c52-24 88-6 108 45-51 12-86-4-108-45z" fill="#85ba79"/>`;
}

function plantSvg(profile) {
  const c = profile.color;
  const a = profile.accent;
  if (profile.plant === "conifer") return `<path d="M210 58L104 214h212z" fill="${c}"/><path d="M210 104L126 240h168z" fill="#3f7f51"/><rect x="196" y="214" width="28" height="42" rx="8" fill="#8b643c"/>`;
  if (profile.plant === "tree") return `<rect x="196" y="158" width="28" height="84" rx="9" fill="#80613d"/><circle cx="170" cy="132" r="62" fill="${c}"/><circle cx="238" cy="116" r="76" fill="#6ca763"/><circle cx="270" cy="158" r="58" fill="${c}"/><circle cx="208" cy="170" r="70" fill="#79b46d"/><circle cx="260" cy="120" r="16" fill="${a}" opacity=".85"/>`;
  if (["grass", "fern", "rosette"].includes(profile.plant)) return leafSvg(profile);
  if (profile.plant === "vegetable") return `<path d="M210 238V126" stroke="#557449" stroke-width="12" stroke-linecap="round"/><path d="M188 138c-60-46-112-16-132 44 58 24 104 10 132-44z" fill="${c}"/><path d="M232 136c62-42 114-8 128 54-60 18-105 0-128-54z" fill="#6fae68"/><path d="M210 236c32-34 46-70 38-110" stroke="${profile.accent}" stroke-width="16" stroke-linecap="round"/><ellipse cx="210" cy="250" rx="74" ry="16" fill="#d9e6d7"/>`;
  if (profile.plant === "foliage") return `<rect x="0" y="230" width="420" height="70" fill="#d9e6d7"/><path d="M132 226c-48-84-18-148 67-170 42 77 26 138-67 170z" fill="${c}"/><path d="M262 226c-56-76-36-146 44-178 52 70 44 134-44 178z" fill="#679f67"/><path d="M159 105c22 26 38 58 48 96M289 95c-8 36-14 72-18 110" stroke="${a}" stroke-width="7" stroke-linecap="round" opacity=".85"/>`;
  if (profile.plant === "vine") return `<path d="M90 226c82-154 222 30 248-150" stroke="${c}" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M126 190c-45-18-54-56-28-89 44 13 56 51 28 89z" fill="#6ea763"/><path d="M220 158c-35-40-21-82 20-100 32 35 20 78-20 100z" fill="${c}"/><circle cx="276" cy="148" r="18" fill="${a}"/>`;
  if (profile.plant === "aquatic") return `<rect x="0" y="208" width="420" height="92" fill="#cfe2df"/><circle cx="174" cy="176" r="78" fill="${c}"/><path d="M174 176l68-42" stroke="#cfe2df" stroke-width="8"/><circle cx="252" cy="112" r="34" fill="${a}"/><circle cx="276" cy="134" r="26" fill="#efb5c6"/>`;
  return `<path d="M210 238V134" stroke="#557449" stroke-width="12" stroke-linecap="round"/><path d="M166 190c-40-20-58-54-46-93 44 4 72 34 46 93z" fill="${c}"/><path d="M246 188c43-18 61-52 50-90-45 3-74 31-50 90z" fill="#6fae68"/><g fill="${a}"><circle cx="210" cy="102" r="34"/><circle cx="178" cy="126" r="28"/><circle cx="242" cy="126" r="28"/><circle cx="210" cy="143" r="30"/></g><circle cx="210" cy="124" r="18" fill="#f1cf68"/>`;
}

function seedSvg(profile) {
  const a = profile.accent;
  if (profile.fruit === "cone") return `<path d="M210 62c58 48 74 116 4 190-70-72-56-141-4-190z" fill="${a}"/><g stroke="#6e4a2f" stroke-width="5">${Array.from({ length: 8 }, (_, i) => `<path d="M164 ${102 + i * 18}c30 22 62 22 94 0"/><path d="M176 ${116 + i * 18}c22 16 45 16 68 0"/>`).join("")}</g>`;
  if (profile.fruit === "samara") return `<path d="M210 148c-68-78-128-76-156-22 55 45 106 48 156 22z" fill="${a}"/><path d="M210 148c72-74 132-68 156-10-58 40-108 39-156 10z" fill="#d9a34d"/><circle cx="210" cy="148" r="12" fill="#6e4a2f"/>`;
  if (profile.fruit === "tomato") return `<circle cx="190" cy="144" r="50" fill="${a}"/><circle cx="240" cy="158" r="43" fill="#c9362d"/><path d="M186 91l20 24 28-18-13 31" stroke="${profile.color}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
  if (profile.fruit === "pepper") return `<path d="M208 72c72 40 58 144-15 178-60-58-55-154 15-178z" fill="${a}"/><path d="M210 78c6-30 26-42 54-34" stroke="${profile.color}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
  if (profile.fruit === "root") return `<path d="M210 64c52 70 28 154-12 204-46-54-66-138 12-204z" fill="${a}"/><g stroke="${profile.color}" stroke-width="8" stroke-linecap="round"><path d="M210 74c-24-30-54-42-92-38"/><path d="M210 74c18-32 48-48 88-50"/></g>`;
  if (profile.fruit === "grape") return `<g fill="${a}">${Array.from({ length: 14 }, (_, i) => `<circle cx="${170 + (i % 4) * 28 + Math.floor(i / 4) * 8}" cy="${112 + Math.floor(i / 4) * 30}" r="18"/>`).join("")}</g>`;
  return `<g fill="${a}"><circle cx="164" cy="138" r="26"/><circle cx="210" cy="116" r="30"/><circle cx="254" cy="142" r="25"/><circle cx="204" cy="172" r="28"/></g><path d="M210 86c-2-28 18-44 48-48" stroke="${profile.color}" stroke-width="8" fill="none" stroke-linecap="round"/>`;
}

function partSvg(profile, part) {
  if (part === "leaf") return leafSvg(profile);
  if (part === "seed") return seedSvg(profile);
  if (part === "flower") return `<g fill="${profile.accent}">${Array.from({ length: 10 }, (_, i) => `<ellipse cx="210" cy="136" rx="30" ry="78" transform="rotate(${i * 36} 210 136)"/>`).join("")}</g><circle cx="210" cy="136" r="28" fill="#f1cf68"/>`;
  return plantSvg(profile);
}

function plantIllustrationSvg({ name, latin, type, part }) {
  const profile = plantProfile(name, latin, type);
  const safeName = escapeSvgText(name || latin || "plant");
  const safePart = escapeSvgText({ plant: "전체", leaf: "잎", flower: "꽃", seed: "씨·열매" }[part] || "전체");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="525" viewBox="0 0 700 525"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f6faf3"/><stop offset="1" stop-color="#dfeadf"/></linearGradient></defs><rect width="700" height="525" fill="url(#bg)"/><rect x="52" y="38" width="596" height="372" rx="22" fill="#fff" opacity=".88"/><g transform="translate(140 68)">${partSvg(profile, part)}</g><rect x="52" y="428" width="596" height="58" rx="16" fill="#fff" opacity=".92"/><text x="78" y="464" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#17201b">${safeName}</text><text x="620" y="464" text-anchor="end" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#66736b">${safePart}</text></svg>`;
}

function sendPlantFallback(res, label, cacheControl = "public, max-age=3600") {
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": cacheControl
  });
  res.end(plantIllustrationSvg({ name: label, latin: "", type: "flower", part: "plant" }));
}

function sendPlantIllustration(res, details, cacheControl = "public, max-age=604800") {
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": cacheControl
  });
  res.end(plantIllustrationSvg(details));
}

function normalizePhotoKey(name, latin) {
  return normalizePlantSearch(latin || name || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sendDataUrlImage(res, dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new Error("invalid image data");
  const body = Buffer.from(match[2], "base64");
  res.writeHead(200, {
    "Content-Type": match[1].toLowerCase(),
    "Cache-Control": "no-store",
    "Content-Length": body.length
  });
  res.end(body);
}

function normalizePlantSearch(text) {
  return String(text || "")
    .replace(/'[^']*'/g, "")
    .replace(/\b(var\.|cv\.|cultivar)\b/gi, "")
    .replace(/\b(subsp\.|ssp\.|f\.)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLatinForPhoto(latin) {
  return normalizePlantSearch(latin)
    .replace(/\bsp\.\b/gi, "")
    .replace(/\b(White|Pink|Red|Yellow|Purple|Double|Fragrant|Silver|Golden|Dwarf|Upright|Weeping|Compact|Leaf|Flower|Group)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackPhotoKeyword(query, part) {
  const normalized = normalizePlantSearch(query).toLowerCase();
  const latinFirstWord = normalized.match(/[a-z][a-z-]+/)?.[0] || "";
  const koreanKeywordMap = [
    [/라즈베리|산딸기|rubus/, "raspberry"],
    [/블루베리|vaccinium/, "blueberry"],
    [/딸기|fragaria/, "strawberry"],
    [/사과|malus/, "apple"],
    [/배나무|pyrus/, "pear"],
    [/복숭아|prunus persica/, "peach"],
    [/매화|prunus mume/, "prunus"],
    [/소나무|pinus/, "pinus"],
    [/단풍|acer/, "acer"],
    [/자작|betula/, "betula"],
    [/배롱|lagerstroemia/, "lagerstroemia"],
    [/느티|zelkova/, "zelkova"],
    [/당근|daucus/, "carrot"],
    [/감자|tuberosum/, "potato"],
    [/시금치|spinacia/, "spinach"],
    [/고구마|ipomoea/, "sweetpotato"],
    [/상추|lettuce|lactuca/, "lettuce"],
    [/양배추|brassica oleracea var. capitata/, "cabbage"],
    [/브로콜리|italica/, "broccoli"],
    [/오이|cucumis/, "cucumber"],
    [/고추|capsicum/, "pepper"],
    [/토마토|lycopersicum/, "tomato"],
    [/레몬|라임|유자|귤|citrus/, "citrus"],
    [/장미|rosa/, "rose"],
    [/튤립|tulipa/, "tulip"],
    [/연꽃|nelumbo/, "lotus"],
    [/수국|hydrangea/, "hydrangea"],
    [/라벤더|lavandula/, "lavender"],
    [/로즈마리|rosmarinus|salvia rosmarinus/, "rosemary"],
    [/바질|ocimum/, "basil"],
    [/세이지|salvia/, "sage"],
    [/옥수수|zea/, "corn"]
  ];
  const matched = koreanKeywordMap.find(([pattern]) => pattern.test(normalized));
  if (matched) return matched[1];
  return latinFirstWord || "plant";
}

function partPhotoWords(part) {
  return {
    plant: ["plant", "tree", "shrub", "habitus", "whole plant"],
    leaf: ["leaf", "leaves", "foliage", "closeup"],
    flower: ["flower", "flowers", "bloom", "inflorescence", "closeup"],
    seed: ["seed", "seeds", "fruit", "fruits", "samara", "berry", "berries", "cone", "cones", "pod"]
  }[part] || ["plant"];
}

function commonsSearchQuery(core, name, part) {
  const normalizedCore = cleanLatinForPhoto(core);
  const normalizedName = normalizePlantSearch(name);
  const genus = normalizedCore.match(/^[A-Za-z][A-Za-z-]+/)?.[0] || "";
  const species = normalizedCore.split(/\s+/).slice(0, 2).join(" ");
  const partWords = partPhotoWords(part);
  const primaryPart = partWords[0];
  const terms = [
    species && `${species} ${primaryPart}`,
    species && `${species} ${partWords[1] || primaryPart}`,
    species && part === "seed" && `${species} fruit`,
    species && part === "seed" && `${species} samara`,
    normalizedCore && normalizedCore !== species && `${normalizedCore} ${primaryPart}`,
    genus && genus !== species && `${genus} ${primaryPart}`,
    genus && genus !== species && part === "flower" && `${genus} flower`,
    genus && genus !== species && part === "leaf" && `${genus} leaf`,
    genus && genus !== species && part === "seed" && `${genus} seed`,
    part !== "plant" && species && `${species} plant`,
    part !== "plant" && genus && genus !== species && `${genus} plant`,
    species || normalizedCore,
    normalizedName && `${normalizedName} ${primaryPart}`,
    normalizedName && `${fallbackPhotoKeyword(normalizedName, part)} ${primaryPart}`
  ].filter(Boolean);
  return [...new Set(terms)];
}

async function findCommonsImage(query, seed, part = "plant") {
  const cache = readJsonFile(plantImageFile, { images: {} });
  const key = `v20|${query}|${part}|${seed}`.toLowerCase();
  const cached = cache.images[key];
  if (cached && cached.url) return cached.url;

  const endpoint = new URL("https://commons.wikimedia.org/w/api.php");
  endpoint.searchParams.set("action", "query");
  endpoint.searchParams.set("generator", "search");
  endpoint.searchParams.set("gsrsearch", `file:${normalizePlantSearch(query)}`);
  endpoint.searchParams.set("gsrnamespace", "6");
  endpoint.searchParams.set("gsrlimit", "20");
  endpoint.searchParams.set("prop", "imageinfo");
  endpoint.searchParams.set("iiprop", "url|mime|size");
  endpoint.searchParams.set("iiurlwidth", "700");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("origin", "*");

  const response = await fetch(endpoint, { headers: { "User-Agent": "gardeningatlasPrototype/1.0" } });
  if (!response.ok) throw new Error("image search failed");
  const payload = await response.json();
  const blockedTitleWords = /(catalogue|catalog|plate|herbarium|specimen|illustration|drawing|scan|book|flora|botanical register|iconograph|stamp|map|diagram|street|road|city|temple|shrine|landscape|building|house|avenue|monument|people|person|portrait|sign|logo|seedling tray|nursery row|bonsai display|pdf|\.svg)/i;
  const queryTokens = normalizePlantSearch(query).toLowerCase().split(/\s+/).filter(token => token.length > 3);
  const partWords = partPhotoWords(part);
  const genericTokens = new Set([...partWords, "plant", "tree", "shrub", "whole", "habitus", "closeup", "close-up", "macro"]);
  const identityTokens = queryTokens.filter(token => !genericTokens.has(token));
  const pages = Object.values(payload.query?.pages || {})
    .map(page => ({ title: page.title || "", info: page.imageinfo?.[0] }))
    .filter(page => !blockedTitleWords.test(page.title))
    .map(page => ({ ...page, info: page.info }))
    .filter(page => {
      const info = page.info;
      const mime = info?.mime || "";
      const url = info?.thumburl || info?.url || "";
      return /^image\//.test(mime) &&
        mime !== "image/svg+xml" &&
        /\.(jpe?g|png|webp)(\?|$)/i.test(url) &&
        !blockedTitleWords.test(decodeURIComponent(url));
    })
    .map(page => {
      const info = page.info;
      const haystack = `${page.title} ${decodeURIComponent(info.thumburl || info.url || "")}`.toLowerCase();
      const identityScore = identityTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
      if (identityTokens.length && identityScore === 0) return { info, score: -100 };
      const tokenScore = queryTokens.reduce((sum, token) => sum + (haystack.includes(token) ? 6 : 0), 0);
      const partScore = partWords.reduce((sum, token) => sum + (haystack.includes(token) ? 5 : 0), 0);
      const closeupScore = /(close|closeup|close-up|macro|detail|foliage|flower|fruit|leaf|leaves|seed|cone)/i.test(haystack) ? 4 : 0;
      const sizeScore = Math.min(4, Math.round(((info.width || 0) * (info.height || 0)) / 500000));
      const plantPenalty = part === "plant" && /(bark|trunk|leaf|flower|fruit|seed|cone|closeup|close-up|macro)/i.test(haystack) ? 4 : 0;
      const contextPenalty = /(habitat|forest|street|building|landscape)/i.test(haystack) ? 5 : 0;
      const score = tokenScore + partScore + closeupScore + sizeScore - plantPenalty - contextPenalty;
      return { info, score };
    })
    .filter(page => page.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(page => page.info);
  if (!pages.length) throw new Error("image not found");

  const topPages = pages.slice(0, Math.min(3, pages.length));
  const picked = topPages[0];
  const url = picked.thumburl || picked.url;
  cache.images[key] = { url, query, seed, source: "Wikimedia Commons", cachedAt: new Date().toISOString() };
  writeJsonFile(plantImageFile, cache);
  return url;
}

function wikipediaTitleCandidates(name, latin, part) {
  const cleanLatin = cleanLatinForPhoto(latin);
  const latinWords = cleanLatin.split(/\s+/).filter(Boolean);
  const latinTitle = latinWords.length >= 2 ? `${latinWords[0]} ${latinWords[1]}` : latinWords[0] || "";
  const genusTitle = latinWords[0] || "";
  const fallback = fallbackPhotoKeyword(`${name} ${latin}`, part);
  return [latinTitle, cleanLatin, genusTitle, fallback, name].filter(Boolean).map(item => item.replace(/\s+/g, "_"));
}

async function findWikipediaLeadImage(name, latin, part, seed) {
  const cache = readJsonFile(plantImageFile, { images: {} });
  const titles = wikipediaTitleCandidates(name, latin, part);
  for (const title of titles) {
    const key = `wiki-v2|${title}|${part}|${seed}`.toLowerCase();
    const cached = cache.images[key];
    if (cached && cached.url) return cached.url;
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const response = await fetch(endpoint, { headers: { "User-Agent": "gardeningatlasPrototype/1.0" } });
      if (!response.ok) continue;
      const payload = await response.json();
      const url = payload.originalimage?.source || payload.thumbnail?.source || "";
      const text = `${payload.title || ""} ${payload.description || ""} ${payload.extract || ""}`.toLowerCase();
      if (!url || !/^https?:\/\//i.test(url) || !/(plant|tree|flower|shrub|species|genus|herb|grass|fern|vegetable|fruit)/i.test(text)) continue;
      cache.images[key] = { url, query: title, seed, source: "Wikipedia lead image", cachedAt: new Date().toISOString() };
      writeJsonFile(plantImageFile, cache);
      return url;
    } catch {
      // Try the next title candidate.
    }
  }
  throw new Error("Wikipedia image not found");
}

function redirectExternalImage(res, imageUrl) {
  if (!/^https?:\/\//i.test(imageUrl)) throw new Error("invalid image url");
  res.writeHead(302, {
    Location: imageUrl,
    "Cache-Control": "public, max-age=604800"
  });
  res.end();
}

function realPhotoFallbackUrl(part, type) {
  if (part === "leaf") return "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Hedera_helix_Leaf_Closeup_2084px.jpg/960px-Hedera_helix_Leaf_Closeup_2084px.jpg";
  if (part === "flower") return "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Rosa_canina_closeup.jpg/960px-Rosa_canina_closeup.jpg";
  if (part === "seed") return "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Acer_seed.jpg/960px-Acer_seed.jpg";
  if (type === "vegetable" || type === "crop") return "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Marketvegetables.jpg/960px-Marketvegetables.jpg";
  return "https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Tree_in_field_001.jpg/960px-Tree_in_field_001.jpg";
}

async function proxyImage(res, imageUrl) {
  const response = await fetch(imageUrl, {
    redirect: "follow",
    headers: { "User-Agent": "gardeningatlasPrototype/1.0" }
  });
  if (!response.ok) throw new Error("image fetch failed");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!/^image\//i.test(contentType)) throw new Error("not an image");
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=604800",
    "Content-Length": body.length
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 8_000_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function devicePathFromUserAgent(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  const isMobile = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/.test(ua);
  return isMobile ? "/mobile" : "/pc";
}

function serveStatic(req, res) {
  const cleanPath = decodeURIComponent(req.url.split("?")[0]);
  if (cleanPath === "/") {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.writeHead(302, {
      Location: `${devicePathFromUserAgent(req.headers["user-agent"])}${query}`,
      "Cache-Control": "no-store"
    });
    res.end();
    return;
  }
  const requested = cleanPath === "/" || cleanPath === "/mobile" || cleanPath === "/pc" ? "index.html" : cleanPath.slice(1);
  const filePath = path.resolve(root, requested);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const route = req.url.split("?")[0];
  const db = readDb();

  if (route === "/api/status" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      users: db.users.length,
      resetCodes: Object.keys(db.resetCodes).length,
      signupCodes: Object.keys(db.signupCodes || {}).length,
      messages: db.messages.length,
      yards: readYards().yards.length,
      payments: readJsonFile(paymentsFile, { orders: [] }).orders.length,
      paymentProvider: tossClientKey && tossSecretKey ? "toss" : "mock",
      emailProvider: resendApiKey ? "resend" : "dev"
    });
    return;
  }

  if (route === "/api/plant-photo" && req.method === "GET") {
    const url = new URL(req.url, publicBaseUrl);
    const latin = normalizePlantSearch(url.searchParams.get("latin") || "");
    const name = url.searchParams.get("name") || "";
    const type = url.searchParams.get("type") || "";
    const part = url.searchParams.get("part") || "plant";
    const seed = Number(url.searchParams.get("id") || 1);
    const photoDb = readJsonFile(plantImageFile, { images: {}, overrides: {} });
    const photoKey = normalizePhotoKey(name, latin);
    const override = photoDb.overrides?.[photoKey]?.[part];
    if (override?.dataUrl) {
      try {
        sendDataUrlImage(res, override.dataUrl);
      } catch {
        redirectExternalImage(res, realPhotoFallbackUrl(part, type));
      }
      return;
    }
    const core = latin || name;
    const queries = commonsSearchQuery(core, name, part);
    try {
      let imageUrl = "";
      if (part === "plant") {
        try {
          imageUrl = await findWikipediaLeadImage(name, latin, part, seed);
        } catch {
          imageUrl = "";
        }
      }
      if (imageUrl) {
        redirectExternalImage(res, imageUrl);
        return;
      }
      for (const query of queries) {
        try {
          imageUrl = await findCommonsImage(query, seed, part);
          break;
        } catch {
          imageUrl = "";
        }
      }
      if (!imageUrl && part !== "plant") {
        try {
          imageUrl = await findWikipediaLeadImage(name, latin, part, seed);
        } catch {
          imageUrl = "";
        }
      }
      if (!imageUrl && part !== "plant") {
        try {
          imageUrl = await findWikipediaLeadImage(name, latin, "plant", seed);
        } catch {
          imageUrl = "";
        }
      }
      if (!imageUrl && part !== "plant") {
        for (const query of commonsSearchQuery(core, name, "plant")) {
          try {
            imageUrl = await findCommonsImage(query, seed, "plant");
            break;
          } catch {
            imageUrl = "";
          }
        }
      }
      if (imageUrl) {
        redirectExternalImage(res, imageUrl);
        return;
      }
      redirectExternalImage(res, realPhotoFallbackUrl(part, type));
    } catch {
      redirectExternalImage(res, realPhotoFallbackUrl(part, type));
    }
    return;
  }

  if (route === "/api/admin/plant-photos" && req.method === "POST") {
    const body = await readBody(req);
    const admin = requireAdmin(req, db, body);
    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "관리자 권한이 필요합니다." });
      return;
    }
    const photoDb = readJsonFile(plantImageFile, { images: {}, overrides: {} });
    sendJson(res, 200, { overrides: photoDb.overrides || {} });
    return;
  }

  if (route === "/api/admin/plant-photo" && req.method === "POST") {
    const body = await readBody(req);
    const admin = requireAdmin(req, db, body);
    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "관리자 권한이 필요합니다." });
      return;
    }
    const part = String(body.part || "plant");
    if (!["plant", "leaf", "flower", "seed"].includes(part)) {
      sendJson(res, 400, { error: "사진 종류가 올바르지 않습니다." });
      return;
    }
    const dataUrl = String(body.dataUrl || "");
    if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(dataUrl)) {
      sendJson(res, 400, { error: "PNG, JPG, WEBP 이미지만 업로드할 수 있습니다." });
      return;
    }
    const photoKey = normalizePhotoKey(body.name, body.latin);
    if (!photoKey) {
      sendJson(res, 400, { error: "식물 정보가 필요합니다." });
      return;
    }
    const photoDb = readJsonFile(plantImageFile, { images: {}, overrides: {} });
    photoDb.images = photoDb.images || {};
    photoDb.overrides = photoDb.overrides || {};
    photoDb.overrides[photoKey] = photoDb.overrides[photoKey] || {};
    photoDb.overrides[photoKey][part] = {
      dataUrl,
      name: String(body.name || ""),
      latin: String(body.latin || ""),
      part,
      uploadedAt: new Date().toISOString()
    };
    writeJsonFile(plantImageFile, photoDb);
    sendJson(res, 200, { ok: true, key: photoKey, part });
    return;
  }

  if (route === "/api/yard" && req.method === "GET") {
    const user = authenticate(req, db, {});
    if (!user) {
      sendJson(res, 401, { error: "로그인이 필요합니다." });
      return;
    }
    const yards = readYards();
    const yard = yards.yards.find(item => item.owner === ownerKey(user) && item.id === "default") || null;
    sendJson(res, 200, { yard });
    return;
  }

  if (route === "/api/yard" && req.method === "POST") {
    const body = await readBody(req);
    const user = authenticate(req, db, body);
    if (!user) {
      sendJson(res, 401, { error: "로그인이 필요합니다." });
      return;
    }
    let yard;
    try {
      yard = normalizeYardPayload(body, user);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    const yards = readYards();
    yards.yards = (yards.yards || []).filter(item => !(item.owner === yard.owner && item.id === yard.id));
    yards.yards.unshift(yard);
    writeYards(yards);
    sendJson(res, 200, { ok: true, yard });
    return;
  }

  if (route === "/api/payment/create" && req.method === "POST") {
    const body = await readBody(req);
    const user = authenticate(req, db, body);
    const plan = String(body.plan || "").toLowerCase();
    const amount = planPrice(plan);
    if (!user) {
      sendJson(res, 404, { error: "로그인이 필요합니다." });
      return;
    }
    if (!amount) {
      sendJson(res, 400, { error: "결제 가능한 요금제가 아닙니다." });
      return;
    }

    const payments = readJsonFile(paymentsFile, { orders: [] });
    const orderId = `gardeningatlas-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const order = {
      orderId,
      loginId: user.email || user.username,
      plan,
      amount,
      status: "ready",
      provider: tossClientKey && tossSecretKey ? "toss" : "mock",
      createdAt: new Date().toISOString()
    };
    payments.orders.unshift(order);
    writeJsonFile(paymentsFile, payments);
    sendJson(res, 200, {
      orderId,
      amount,
      plan,
      orderName: `gardeningatlas ${plan.toUpperCase()} 월 구독`,
      customerName: user.name || user.username || user.email,
      customerEmail: user.email || "",
      provider: order.provider,
      tossClientKey,
      successUrl: `${publicBaseUrl}/?payment=success&orderId=${encodeURIComponent(orderId)}`,
      failUrl: `${publicBaseUrl}/?payment=fail&orderId=${encodeURIComponent(orderId)}`
    });
    return;
  }

  if (route === "/api/payment/confirm" && req.method === "POST") {
    const body = await readBody(req);
    const payments = readJsonFile(paymentsFile, { orders: [] });
    const order = payments.orders.find(item => item.orderId === body.orderId);
    if (!order) {
      sendJson(res, 404, { error: "결제 주문을 찾을 수 없습니다." });
      return;
    }
    const user = findUser(db, order.loginId);
    if (!user) {
      sendJson(res, 404, { error: "결제 계정을 찾을 수 없습니다." });
      return;
    }
    const sessionUser = authenticate(req, db, body);
    if (!sessionUser || ownerKey(sessionUser) !== ownerKey(user)) {
      sendJson(res, 401, { error: "결제 계정 인증이 필요합니다." });
      return;
    }

    if (order.provider === "toss" && (!tossSecretKey || !body.paymentKey)) {
      sendJson(res, 400, { error: "토스 결제 승인 정보가 필요합니다." });
      return;
    }
    if (Number(body.amount || order.amount) !== order.amount) {
      sendJson(res, 400, { error: "결제 금액이 주문 금액과 다릅니다." });
      return;
    }

    if (order.provider === "toss" && tossSecretKey && body.paymentKey) {
      const auth = Buffer.from(`${tossSecretKey}:`).toString("base64");
      const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paymentKey: body.paymentKey,
          orderId: order.orderId,
          amount: order.amount
        })
      });
      const tossPayload = await tossResponse.json();
      if (!tossResponse.ok) {
        order.status = "failed";
        order.error = tossPayload;
        writeJsonFile(paymentsFile, payments);
        sendJson(res, 400, { error: tossPayload.message || "토스 결제 승인에 실패했습니다." });
        return;
      }
      order.toss = tossPayload;
    }

    order.status = "paid";
    order.paidAt = new Date().toISOString();
    user.plan = user.role === "admin" ? "max" : order.plan;
    user.subscriptionStatus = "active";
    user.paidUntil = addOneMonth();
    writeJsonFile(paymentsFile, payments);
    writeDb(db);
    sendJson(res, 200, { ok: true, user: publicUser(user), order });
    return;
  }

  if (route === "/api/payment/webhook" && req.method === "POST") {
    const body = await readBody(req);
    if (tossWebhookSecret) {
      const provided = String(req.headers["x-webhook-secret"] || body.webhookSecret || "");
      if (provided !== tossWebhookSecret) {
        sendJson(res, 401, { error: "웹훅 인증에 실패했습니다." });
        return;
      }
    }
    const orderId = body.orderId || body.order?.orderId || body.data?.orderId;
    const status = String(body.status || body.eventType || body.data?.status || "").toLowerCase();
    const payments = readJsonFile(paymentsFile, { orders: [] });
    const order = payments.orders.find(item => item.orderId === orderId);
    if (!order) {
      sendJson(res, 404, { error: "결제 주문을 찾을 수 없습니다." });
      return;
    }
    order.webhooks = order.webhooks || [];
    order.webhooks.unshift({ receivedAt: new Date().toISOString(), body });
    if (/cancel|refund|abort|expired|fail/.test(status)) {
      order.status = "cancelled";
      const user = findUser(db, order.loginId);
      if (user && user.role !== "admin") {
        user.subscriptionStatus = "cancelled";
        user.plan = "free";
      }
      writeDb(db);
    }
    writeJsonFile(paymentsFile, payments);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (route === "/api/signup/request" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const name = String(body.name || username || email).trim();

    if (!email || !username || !password) {
      sendJson(res, 400, { error: "이메일, 아이디, 비밀번호가 필요합니다." });
      return;
    }
    if (!email.includes("@")) {
      sendJson(res, 400, { error: "이메일 형식이 올바르지 않습니다." });
      return;
    }
    if (findUser(db, username) || findUser(db, email)) {
      sendJson(res, 409, { error: "이미 존재하는 이메일 또는 아이디입니다." });
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.signupCodes = db.signupCodes || {};
    db.signupCodes[email] = {
      code,
      email,
      username,
      passwordHash: hashPassword(password),
      name,
      expiresAt: Date.now() + 10 * 60 * 1000
    };

    let emailResult;
    try {
      emailResult = await sendSignupEmail(email, code, name || username);
    } catch (error) {
      sendJson(res, 502, { error: error.message });
      return;
    }
    writeDb(db);
    sendJson(res, 200, {
      email,
      devCode: emailResult.sent ? undefined : code,
      emailSent: emailResult.sent,
      emailProvider: emailResult.provider,
      message: emailResult.sent ? "인증번호를 이메일로 발송했습니다." : "개발 모드라 인증번호를 화면에 표시합니다."
    });
    return;
  }

  if (route === "/api/signup/confirm" && req.method === "POST") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const pending = db.signupCodes?.[email];
    if (!pending || pending.code !== String(body.code || "").trim() || pending.expiresAt < Date.now()) {
      sendJson(res, 400, { error: "인증번호가 올바르지 않거나 만료되었습니다." });
      return;
    }
    if (findUser(db, pending.username) || findUser(db, pending.email)) {
      delete db.signupCodes[email];
      writeDb(db);
      sendJson(res, 409, { error: "이미 존재하는 이메일 또는 아이디입니다." });
      return;
    }

    const user = {
      email: pending.email,
      username: pending.username,
      passwordHash: pending.passwordHash,
      name: pending.name,
      plan: "free",
      role: "user",
      emailVerified: true,
      emailVerifiedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    delete db.signupCodes[email];
    const authToken = createSession(db, user);
    writeDb(db);
    sendJson(res, 200, { user: publicUser(user), authToken });
    return;
  }

  if (route === "/api/signup" && req.method === "POST") {
    sendJson(res, 400, { error: "이메일 인증이 필요합니다. 먼저 인증번호를 요청하세요." });
    return;
  }

  if (route === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const user = findUser(db, body.loginId);
    if (!user || !verifyPassword(user, body.password || "")) {
      sendJson(res, 401, { error: "로그인 정보가 올바르지 않습니다." });
      return;
    }
    const authToken = createSession(db, user);
    writeDb(db);
    sendJson(res, 200, { user: publicUser(user), authToken });
    return;
  }

  if (route === "/api/add-email" && req.method === "POST") {
    const body = await readBody(req);
    const user = findUser(db, body.loginId);
    const email = String(body.email || "").trim();
    if (!user || !verifyPassword(user, body.password || "")) {
      sendJson(res, 401, { error: "계정 확인에 실패했습니다." });
      return;
    }
    if (!email.includes("@")) {
      sendJson(res, 400, { error: "이메일 형식이 올바르지 않습니다." });
      return;
    }
    const existing = findUser(db, email);
    if (existing && existing !== user) {
      sendJson(res, 409, { error: "이미 다른 계정에서 사용하는 이메일입니다." });
      return;
    }
    user.email = email;
    writeDb(db);
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (route === "/api/plan" && req.method === "POST") {
    const body = await readBody(req);
    const user = authenticate(req, db, body);
    if (!user) {
      sendJson(res, 404, { error: "계정을 찾을 수 없습니다." });
      return;
    }
    user.plan = user.role === "admin" ? "max" : (["free", "plus", "max"].includes(body.plan) ? body.plan : user.plan);
    writeDb(db);
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (route === "/api/message" && req.method === "POST") {
    const body = await readBody(req);
    const user = authenticate(req, db, body);
    const text = String(body.text || "").trim();
    if (!user) {
      sendJson(res, 404, { error: "로그인한 사용자만 메시지를 보낼 수 있습니다." });
      return;
    }
    if (user.role === "admin") {
      sendJson(res, 403, { error: "관리자는 새 문의를 보낼 수 없습니다. 사용자 문의에 답장만 할 수 있습니다." });
      return;
    }
    if (text.length < 2) {
      sendJson(res, 400, { error: "메시지를 입력해주세요." });
      return;
    }
    db.messages.unshift({
      id: crypto.randomUUID(),
      fromEmail: user.email || "",
      fromUsername: user.username || "",
      fromName: user.name || "",
      text,
      replies: [],
      status: "new",
      createdAt: new Date().toISOString()
    });
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (route === "/api/chat/list" && req.method === "POST") {
    const body = await readBody(req);
    const user = authenticate(req, db, body);
    if (!user) {
      sendJson(res, 404, { error: "로그인이 필요합니다." });
      return;
    }
    const messages = user.role === "admin"
      ? db.messages.filter(message => !isAdminMessage(db, message))
      : db.messages.filter(message =>
        String(message.fromEmail || "").toLowerCase() === String(user.email || "").toLowerCase() ||
        String(message.fromUsername || "").toLowerCase() === String(user.username || "").toLowerCase()
      );
    sendJson(res, 200, { messages });
    return;
  }

  if (route === "/api/chat/send" && req.method === "POST") {
    const body = await readBody(req);
    const user = authenticate(req, db, body);
    const text = String(body.text || "").trim();
    if (!user) {
      sendJson(res, 404, { error: "로그인이 필요합니다." });
      return;
    }
    if (user.role === "admin") {
      sendJson(res, 403, { error: "Admins cannot send new chat messages. Reply to user messages instead." });
      return;
    }
    if (text.length < 2) {
      sendJson(res, 400, { error: "메시지를 입력해주세요." });
      return;
    }
    db.messages.unshift({
      id: crypto.randomUUID(),
      fromEmail: user.email || "",
      fromUsername: user.username || "",
      fromName: user.name || "",
      text,
      replies: [],
      status: "new",
      createdAt: new Date().toISOString()
    });
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (route === "/api/admin/chat/reply" && req.method === "POST") {
    const body = await readBody(req);
    const admin = requireAdmin(req, db, body);
    const message = db.messages.find(item => item.id === body.messageId);
    const text = String(body.text || "").trim();
    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "관리자 권한이 필요합니다." });
      return;
    }
    if (!message) {
      sendJson(res, 404, { error: "채팅을 찾을 수 없습니다." });
      return;
    }
    if (isAdminMessage(db, message)) {
      sendJson(res, 403, { error: "Cannot reply to admin-created messages." });
      return;
    }
    if (text.length < 1) {
      sendJson(res, 400, { error: "답장을 입력해주세요." });
      return;
    }
    message.replies = message.replies || [];
    message.replies.push({
      id: crypto.randomUUID(),
      fromRole: "admin",
      fromName: admin.name || "관리자",
      text,
      createdAt: new Date().toISOString()
    });
    message.status = "answered";
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (route === "/api/admin/users" && req.method === "POST") {
    const body = await readBody(req);
    const admin = requireAdmin(req, db, body);
    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "관리자 권한이 필요합니다." });
      return;
    }
    sendJson(res, 200, {
      users: db.users.map(user => ({
        email: user.email || "",
        username: user.username || "",
        name: user.name || "",
        plan: user.plan || "free",
        role: user.role || "user",
        createdAt: user.createdAt || "",
        passwordStoredAs: String(user.passwordHash || "").startsWith("$2") ? "bcrypt" : "legacy sha256"
      }))
    });
    return;
  }

  if (route === "/api/admin/messages" && req.method === "POST") {
    const body = await readBody(req);
    const admin = requireAdmin(req, db, body);
    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "관리자 권한이 필요합니다." });
      return;
    }
    sendJson(res, 200, { messages: db.messages.filter(message => !isAdminMessage(db, message)) });
    return;
  }

  if (route === "/api/admin/reset-password" && req.method === "POST") {
    const body = await readBody(req);
    const admin = requireAdmin(req, db, body);
    const user = findUser(db, body.targetLoginId);
    if (!admin || admin.role !== "admin") {
      sendJson(res, 403, { error: "관리자 권한이 필요합니다." });
      return;
    }
    if (!user) {
      sendJson(res, 404, { error: "대상 사용자를 찾을 수 없습니다." });
      return;
    }
    const tempPassword = "12345678";
    user.passwordHash = hashPassword(tempPassword);
    writeDb(db);
    sendJson(res, 200, {
      ok: true,
      target: publicUser(user),
      temporaryPassword: tempPassword
    });
    return;
  }

  if (route === "/api/change-password" && req.method === "POST") {
    const body = await readBody(req);
    const user = authenticate(req, db, body);
    if (!user || !verifyPassword(user, body.currentPassword || "")) {
      sendJson(res, 401, { error: "현재 비밀번호가 올바르지 않습니다." });
      return;
    }
    if (String(body.newPassword || "").length < 6) {
      sendJson(res, 400, { error: "새 비밀번호는 6자 이상이어야 합니다." });
      return;
    }
    user.passwordHash = hashPassword(body.newPassword);
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (route === "/api/reset/request" && req.method === "POST") {
    const body = await readBody(req);
    const user = findUser(db, body.loginId);
    if (!user) {
      sendJson(res, 404, { error: "계정을 찾을 수 없습니다." });
      return;
    }
    if (!user.email) {
      sendJson(res, 400, { error: "이메일이 없는 계정입니다. 먼저 이메일을 추가해야 합니다." });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.resetCodes[user.email] = {
      code,
      username: user.username,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    let emailResult;
    try {
      emailResult = await sendResetEmail(user.email, code, user);
    } catch (error) {
      sendJson(res, 502, { error: error.message });
      return;
    }
    writeDb(db);
    sendJson(res, 200, {
      email: user.email,
      devCode: emailResult.sent ? undefined : code,
      emailSent: emailResult.sent,
      emailProvider: emailResult.provider,
      message: emailResult.sent ? "인증번호를 이메일로 발송했습니다." : "개발 모드라 인증번호를 화면에 표시합니다."
    });
    return;
  }

  if (route === "/api/reset/confirm" && req.method === "POST") {
    const body = await readBody(req);
    const user = findUser(db, body.loginId);
    const reset = user?.email ? db.resetCodes[user.email] : null;
    if (!user || !reset || reset.code !== String(body.code || "") || reset.expiresAt < Date.now()) {
      sendJson(res, 400, { error: "인증번호가 틀렸거나 만료되었습니다." });
      return;
    }
    if (String(body.newPassword || "").length < 6) {
      sendJson(res, 400, { error: "새 비밀번호는 6자 이상이어야 합니다." });
      return;
    }
    user.passwordHash = hashPassword(body.newPassword);
    delete db.resetCodes[user.email];
    writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

ensureData();

http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch(error => sendJson(res, 500, { error: error.message }));
    return;
  }
  serveStatic(req, res);
}).listen(port, host, () => {
  console.log(`gardeningatlas running at http://${host}:${port}/`);
});
