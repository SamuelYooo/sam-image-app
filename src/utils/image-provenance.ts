export type ProvenanceConfidence = 'strong' | 'medium' | 'weak' | 'info';

export interface ProvenanceDetection {
  id: string;
  title: string;
  hit: boolean;
  badgeText: string;
  desc: string;
  detail?: string;
  confidence?: ProvenanceConfidence;
  category: 'ai' | 'credential' | 'metadata' | 'edit' | 'watermark';
}

export interface ProvenanceJumbfInfo {
  present: boolean;
  digitalSourceType: string | null;
  labels: string[];
  indices: number[];
}

export interface ProvenanceMetadataHint {
  label: string;
  value: string;
}

export interface ProvenanceWatermarkHeuristic {
  suspicious: boolean;
  score: number;
  highFreqRatio: number;
  midFreqPeaks: number;
  lsbBias: number;
}

export interface ImageProvenanceResult {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileSizeLabel: string;
  dimensions: string;
  sha256: string;
  summary: {
    aiHit: boolean;
    title: string;
    subtitle: string;
    badge: string;
  };
  detections: ProvenanceDetection[];
  metadataHints: ProvenanceMetadataHint[];
  jumbf: ProvenanceJumbfInfo;
  watermark: ProvenanceWatermarkHeuristic;
}

interface MarkerRule {
  id: string;
  title: string;
  category?: ProvenanceDetection['category'];
  keywords: string[];
  hitThreshold?: number;
  hitDesc: (found: KeywordContext[]) => string;
  missDesc: string;
}

interface KeywordContext {
  keyword: string;
  context: string;
}

const MARKERS: MarkerRule[] = [
  {
    id: 'c2pa',
    title: 'C2PA / Content Credentials',
    category: 'credential',
    keywords: [
      'C2PA',
      'JUMBF',
      'caBX',
      'c2pa.manifest',
      'contentcredentials',
      'urn:uuid:',
      'jumbf',
      'activeManifest',
      'claim.v2',
      'c2pa_rs',
      'c2pa.hash',
    ],
    hitDesc: (found) => `文件中出现 ${found.map((item) => item.keyword).join('、')} 等结构/字符串。`,
    missDesc: '没有在字节中找到 C2PA/JUMBF 线索。',
  },
  {
    id: 'openai',
    title: 'OpenAI / DALL·E / GPT',
    keywords: [
      'OpenAI',
      'openai',
      'DALL-E',
      'dall-e',
      'DALLE',
      'dalle',
      'gpt-image',
      'GPT-image',
      'chatgpt',
      'ChatGPT',
      'openai.com',
    ],
    hitDesc: (found) => `发现 ${found.map((item) => item.keyword).join('、')} 相关标记。`,
    missDesc: '没有发现 OpenAI / DALL-E / ChatGPT 相关标记。',
  },
  {
    id: 'google',
    title: 'Google / SynthID / Gemini',
    keywords: [
      'Google',
      'SynthID',
      'Gemini',
      'Imagen',
      'Nano Banana',
      'nanobanana',
      'DeepMind',
      'google.com',
      'gemini',
    ],
    hitDesc: (found) => `发现 ${found.map((item) => item.keyword).join('、')} 相关标记。`,
    missDesc: '没有发现 Google / SynthID / Gemini 相关标记。',
  },
  {
    id: 'midjourney',
    title: 'Midjourney',
    keywords: ['Midjourney', 'midjourney', 'MIDJOURNEY', 'mj-api', 'midj'],
    hitDesc: () => '发现 Midjourney 相关标记。',
    missDesc: '没有发现 Midjourney 相关标记。',
  },
  {
    id: 'sd',
    title: 'Stable Diffusion / ComfyUI / Flux',
    keywords: [
      'StableDiffusion',
      'stable-diffusion',
      'ComfyUI',
      'comfyui',
      'Flux',
      'FLUX',
      'Automatic1111',
      'A1111',
      'InvokeAI',
      'Fooocus',
      'stable_diffusion',
      'diffusion_model',
    ],
    hitDesc: (found) => `发现 ${found.map((item) => item.keyword).join('、')} 相关标记。`,
    missDesc: '没有发现 Stable Diffusion / ComfyUI / Flux 相关标记。',
  },
  {
    id: 'adobe',
    title: 'Adobe Firefly (AI)',
    keywords: ['Firefly', 'adobe_firefly', 'AdobeFirefly', 'adobefirefly'],
    hitDesc: (found) => `发现 ${found.map((item) => item.keyword).join('、')} (Adobe 生成式 AI)。`,
    missDesc: '没有发现 Adobe Firefly 相关标记。',
  },
  {
    id: 'photoshop',
    title: 'Photoshop / Lightroom / 修图软件',
    category: 'edit',
    keywords: [
      'Adobe Photoshop',
      'photoshop:',
      'Photoshop CC',
      'Photoshop CS',
      'Adobe ImageReady',
      'Lightroom Classic',
      'Adobe Lightroom',
    ],
    hitThreshold: 1,
    hitDesc: (found) => `检测到 ${found.map((item) => item.keyword).join('、')} 修图痕迹。`,
    missDesc: '没有发现 Photoshop / Lightroom 处理痕迹。',
  },
  {
    id: 'pngtext',
    title: 'PNG 文本块 / 生成参数',
    category: 'metadata',
    keywords: [
      'tEXt',
      'iTXt',
      'zTXt',
      'parameters',
      'prompt',
      'negative_prompt',
      'Steps:',
      'Sampler:',
      'CFG scale',
      'Seed:',
      'workflow',
    ],
    hitThreshold: 2,
    hitDesc: (found) => `发现 ${found.map((item) => item.keyword).join('、')} 等生成参数标记。`,
    missDesc: '没有发现 PNG 文本块中的生成参数。',
  },
];

const JUMBF_MAGIC = [0x6a, 0x75, 0x6d, 0x62];
const C2PA_LABELS = ['c2pa', 'c2pa.claim', 'c2pa.assertions', 'c2pa.signature', 'c2pa.hash'];
const AI_SOURCE_TYPES = [
  'trainedAlgorithmicMedia',
  'compositeWithTrainedAlgorithmicMedia',
  'algorithmicMedia',
  'dataDrivenMedia',
];
const NON_AI_SOURCE_TYPES = ['digitalCapture', 'digitalCreation', 'composite'];

export async function analyzeImageProvenance(file: File): Promise<ImageProvenanceResult> {
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  const text = bytesToString(uint8);
  const [hash, dimensions] = await Promise.all([sha256(buffer), getImageDims(file)]);
  const jumbf = sniffJumbf(uint8);
  const metadataHints = getGenerationHints(text);
  const watermark = detectWatermarkHeuristic(uint8);
  const detections = runDetections(uint8, text, jumbf, metadataHints, watermark);
  const aiHit = detections.some(
    (item) =>
      item.hit &&
      item.category !== 'edit' &&
      (item.confidence === 'strong' || item.confidence === 'medium'),
  );
  const weakHit = detections.some(
    (item) => item.hit && item.category !== 'edit' && item.confidence === 'weak',
  );
  const editHit = detections.some((item) => item.hit && item.category === 'edit');

  return {
    fileName: file.name,
    fileType: formatFileType(file),
    fileSize: file.size,
    fileSizeLabel: formatSize(file.size),
    dimensions,
    sha256: hash,
    summary: {
      aiHit,
      title: aiHit ? '检测到 AI 生成或来源凭证线索' : '未发现强/中置信 AI 标记',
      subtitle: aiHit
        ? '命中结果来自 C2PA、结构化元数据或厂商字节标记。'
        : weakHit
          ? '仅发现弱信号，请结合原图来源和频域信息判断。'
          : editHit
            ? '发现修图软件痕迹，但不等同于 AI 生成。'
            : '当前只读检测没有发现明显 AI 生成标记。',
      badge: aiHit ? '命中' : '未命中',
    },
    detections,
    metadataHints,
    jumbf,
    watermark,
  };
}

function runDetections(
  uint8: Uint8Array,
  text: string,
  jumbf: ProvenanceJumbfInfo,
  metadataHints: ProvenanceMetadataHint[],
  watermark: ProvenanceWatermarkHeuristic,
): ProvenanceDetection[] {
  const detections: ProvenanceDetection[] = [];

  const c2paRule = MARKERS.find((item) => item.id === 'c2pa');
  if (c2paRule) {
    const found = findWithContext(text, c2paRule.keywords);
    const aiType = Boolean(
      jumbf.digitalSourceType && AI_SOURCE_TYPES.includes(jumbf.digitalSourceType),
    );
    const hit = jumbf.present || found.length > 0;
    const details: string[] = [];

    if (jumbf.present) {
      details.push(
        `JUMBF boxes: ${jumbf.indices.length} | labels: ${jumbf.labels.join(', ') || '-'} | DigitalSourceType: ${jumbf.digitalSourceType || '-'}`,
      );
    }
    if (found.length) details.push(detailOf(found));

    detections.push({
      id: c2paRule.id,
      title: c2paRule.title,
      hit,
      badgeText: aiType
        ? `C2PA 声明为 AI 生成 (${jumbf.digitalSourceType})`
        : jumbf.present
          ? `C2PA 存在 (${jumbf.digitalSourceType || '来源未声明'})`
          : found.length
            ? '字节中含 C2PA 字符串'
            : '未发现',
      desc: aiType
        ? '图片嵌入了 C2PA 来源凭证，并明确声明为算法生成内容。'
        : jumbf.present
          ? `图片嵌入了 C2PA 来源凭证。${jumbf.labels.length ? `Labels: ${jumbf.labels.join(', ')}` : ''}`
          : found.length
            ? '文件字节中出现 C2PA 相关字符串，但未发现完整 JUMBF 结构。'
            : c2paRule.missDesc,
      detail: details.join('\n\n') || undefined,
      confidence: aiType || jumbf.present ? 'strong' : found.length ? 'weak' : undefined,
      category: 'credential',
    });
  }

  const aiMetadataRegex =
    /Gemini|Imagen|SynthID|Midjourney|Stable\s*Diffusion|ComfyUI|DALL|OpenAI|Firefly|Adobe Firefly|trainedAlgorithmicMedia/i;
  const metadataHit = metadataHints.some((item) => aiMetadataRegex.test(item.value));
  detections.push({
    id: 'structured-metadata',
    title: '结构化元数据 / 文本元数据线索',
    hit: metadataHit,
    badgeText: metadataHit
      ? '元数据命中 AI 生成工具'
      : metadataHints.length
        ? '存在元数据，但未命中 AI'
        : '无可读元数据',
    desc: metadataHit
      ? '图片元数据字段直接记录了 AI 生成工具或标记。'
      : metadataHints.length
        ? '提取到的元数据字段未匹配 AI 生成标记。'
        : '图片几乎不含可直接识别的元数据，可能被剥离或格式不支持。',
    detail: metadataHints.map((item) => `${item.label}: ${item.value}`).join('\n') || undefined,
    confidence: metadataHit ? 'strong' : undefined,
    category: 'metadata',
  });

  for (const marker of MARKERS) {
    if (marker.id === 'c2pa') continue;

    const found = findWithContext(text, marker.keywords);
    const threshold = marker.hitThreshold ?? 1;
    const hit = found.length >= threshold;
    const category = marker.category ?? 'ai';

    detections.push({
      id: marker.id,
      title: marker.title,
      hit,
      badgeText: hit ? (category === 'edit' ? '发现修图痕迹' : '发现标记') : '未发现',
      desc: hit ? marker.hitDesc(found) : marker.missDesc,
      detail: found.length ? detailOf(found) : undefined,
      confidence: hit ? (category === 'edit' ? 'info' : 'medium') : undefined,
      category,
    });
  }

  detections.push({
    id: 'byte-watermark-heuristic',
    title: '像素级隐形水印（字节级启发）',
    hit: watermark.suspicious,
    badgeText: watermark.suspicious ? `疑似水印（异常度 ${watermark.score}%）` : '未检测到异常',
    desc: watermark.suspicious
      ? '字节分布偏离自然图像模型，可能存在隐形水印或强压缩/处理痕迹。'
      : '字节分布未发现明显水印异常。该项是启发式参考，不等同于专业鉴定。',
    detail: [
      `异常度: ${watermark.score}%`,
      `高频比: ${watermark.highFreqRatio.toFixed(4)}`,
      `中频峰值: ${watermark.midFreqPeaks}`,
      `LSB 偏移: ${watermark.lsbBias.toFixed(4)}`,
      `采样字节数: ${uint8.length}`,
    ].join('\n'),
    confidence: watermark.suspicious ? 'weak' : undefined,
    category: 'watermark',
  });

  return detections;
}

function findWithContext(text: string, keywords: string[]): KeywordContext[] {
  const results: KeywordContext[] = [];
  const lowerText = text.toLowerCase();
  const seen = new Set<string>();

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (seen.has(lowerKeyword)) continue;

    const index = lowerText.indexOf(lowerKeyword);
    if (index === -1) continue;

    seen.add(lowerKeyword);
    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + keyword.length + 30);
    const context = text.substring(start, end).replace(/[\x00-\x08\x0e-\x1f]/g, '.');

    results.push({ keyword, context });
  }

  return results;
}

function detailOf(found: KeywordContext[]): string {
  return found.map((item) => `[${item.keyword}] …${item.context}…`).join('\n');
}

export function sniffJumbf(uint8: Uint8Array): ProvenanceJumbfInfo {
  const out: ProvenanceJumbfInfo = {
    present: false,
    digitalSourceType: null,
    labels: [],
    indices: [],
  };

  for (let index = 4; index < uint8.length - 4; index += 1) {
    if (
      uint8[index] === JUMBF_MAGIC[0] &&
      uint8[index + 1] === JUMBF_MAGIC[1] &&
      uint8[index + 2] === JUMBF_MAGIC[2] &&
      uint8[index + 3] === JUMBF_MAGIC[3]
    ) {
      out.present = true;
      out.indices.push(index);
      if (out.indices.length >= 16) break;
    }
  }

  if (!out.present) return out;

  const start = Math.max(0, out.indices[0] - 32);
  const end = Math.min(uint8.length, out.indices[out.indices.length - 1] + 65536);
  const text = bytesToString(uint8.subarray(start, end));

  for (const label of C2PA_LABELS) {
    if (text.includes(label)) out.labels.push(label);
  }

  for (const value of AI_SOURCE_TYPES) {
    if (text.includes(value)) {
      out.digitalSourceType = value;
      break;
    }
  }

  if (!out.digitalSourceType) {
    for (const value of NON_AI_SOURCE_TYPES) {
      if (text.includes(value)) {
        out.digitalSourceType = value;
        break;
      }
    }
  }

  return out;
}

function getGenerationHints(text: string): ProvenanceMetadataHint[] {
  const fields: ProvenanceMetadataHint[] = [];
  const patterns: Array<[string, RegExp]> = [
    ['Software', /(?:Software|xmp:CreatorTool|CreatorTool)\W{0,12}([\w .:/\\+\-()[\]{}@#]{2,160})/i],
    ['Prompt', /(?:prompt|Prompt|parameters)\W{0,12}([\s\S]{2,220})/i],
    ['Negative Prompt', /(?:negative_prompt|Negative prompt)\W{0,12}([\s\S]{2,220})/i],
    ['Seed', /(?:Seed|seed)\W{0,12}([0-9]{2,32})/i],
    ['Sampler', /(?:Sampler|sampler)\W{0,12}([\w .+\-]{2,80})/i],
    ['Model', /(?:Model|model|Model hash)\W{0,12}([\w .:/\\+\-()[\]{}@#]{2,120})/i],
    ['DigitalSourceType', /(trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|dataDrivenMedia|digitalCapture|digitalCreation|composite)/i],
    ['C2PA', /(c2pa\.[\w.-]{2,80}|contentcredentials)/i],
  ];

  for (const [label, pattern] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const value = sanitizeHintValue(match[1] || match[0]);
    if (value) fields.push({ label, value });
  }

  const vendorTokens = [
    'OpenAI',
    'DALL-E',
    'gpt-image',
    'ChatGPT',
    'Gemini',
    'Imagen',
    'SynthID',
    'Midjourney',
    'Stable Diffusion',
    'ComfyUI',
    'Automatic1111',
    'InvokeAI',
    'Fooocus',
    'Flux',
    'Firefly',
  ];

  for (const token of vendorTokens) {
    const index = text.toLowerCase().indexOf(token.toLowerCase());
    if (index === -1) continue;
    const context = sanitizeHintValue(text.slice(Math.max(0, index - 60), index + token.length + 120));
    if (context) fields.push({ label: `Vendor: ${token}`, value: context });
  }

  const unique = new Map<string, ProvenanceMetadataHint>();
  for (const item of fields) {
    unique.set(`${item.label}:${item.value}`, item);
  }

  return Array.from(unique.values()).slice(0, 24);
}

function sanitizeHintValue(value: string): string {
  return value
    .replace(/[\x00-\x08\x0e-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

export function detectWatermarkHeuristic(uint8: Uint8Array): ProvenanceWatermarkHeuristic {
  const lsb0 = { r: 0, g: 0, b: 0 };
  const lsb1 = { r: 0, g: 0, b: 0 };
  let sampleCount = 0;
  const maxSample = 200000;
  const step = Math.max(4, Math.floor(uint8.length / maxSample));

  for (let index = 1000; index < uint8.length - 2 && sampleCount < maxSample; index += step) {
    const r = uint8[index];
    const g = uint8[index + 1] || 0;
    const b = uint8[index + 2] || 0;
    lsb0.r += r & 1;
    lsb0.g += g & 1;
    lsb0.b += b & 1;
    lsb1.r += (r >> 1) & 1;
    lsb1.g += (g >> 1) & 1;
    lsb1.b += (b >> 1) & 1;
    sampleCount += 1;
  }

  const total = Math.max(1, sampleCount * 3);
  const lsb0Ratio = (lsb0.r + lsb0.g + lsb0.b) / total;
  const lsb1Ratio = (lsb1.r + lsb1.g + lsb1.b) / total;
  const lsbBias = Math.abs(lsb0Ratio - 0.5);
  const lsb1Bias = Math.abs(lsb1Ratio - 0.5);

  let highFreqEnergy = 0;
  let totalVariance = 0;
  let prevVal = uint8[1000] || 0;
  const corrSample = Math.min(100000, Math.max(0, uint8.length - 1001));

  for (let index = 1001; index < 1001 + corrSample; index += 1) {
    const diff = uint8[index] - prevVal;
    highFreqEnergy += diff * diff;
    totalVariance += uint8[index] * uint8[index];
    prevVal = uint8[index];
  }

  const highFreqRatio = Math.sqrt(highFreqEnergy) / Math.sqrt(totalVariance + 1);
  let corrBreaks = 0;
  const corrStep = Math.max(4, Math.floor(Math.max(1, corrSample) / 50000));

  for (let index = 1000; index < uint8.length - 4 && corrBreaks < 50000; index += corrStep) {
    const a = uint8[index] & 0x03;
    const b = uint8[index + 4] & 0x03;
    if (Math.abs(a - b) > 1) corrBreaks += 1;
  }

  const corrBreakRatio = corrBreaks / Math.max(1, corrSample / corrStep);
  let midFreqPeaks = 0;
  const windowSize = 64;

  for (let offset = 0; offset < windowSize; offset += 1) {
    let energy = 0;
    for (let index = 1000 + offset; index < uint8.length - windowSize; index += windowSize) {
      energy += uint8[index];
    }
    const avgEnergy = energy / Math.max(1, (uint8.length - 1000) / windowSize);
    if (avgEnergy > 120 && avgEnergy < 136) midFreqPeaks += 1;
  }

  let score = 0;
  if (lsbBias > 0.03) score += 30;
  else if (lsbBias > 0.02) score += 20;
  else if (lsbBias > 0.01) score += 10;

  if (highFreqRatio > 0.15) score += 20;
  else if (highFreqRatio > 0.1) score += 10;

  if (corrBreakRatio > 0.6) score += 20;
  else if (corrBreakRatio > 0.4) score += 10;

  if (midFreqPeaks > 10) score += 20;
  else if (midFreqPeaks > 5) score += 10;

  if (lsb1Bias > 0.02) score += 10;
  score = Math.min(100, score);

  return {
    suspicious: score >= 40,
    score,
    highFreqRatio,
    midFreqPeaks,
    lsbBias,
  };
}

export async function sha256(buffer: ArrayBuffer): Promise<string> {
  const webCrypto = globalThis.crypto?.subtle;
  if (webCrypto?.digest) {
    try {
      const hashBuffer = await webCrypto.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return sha256Pure(new Uint8Array(buffer));
    }
  }

  return sha256Pure(new Uint8Array(buffer));
}

function sha256Pure(message: Uint8Array): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb5, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotateRight = (shift: number, value: number) => (value >>> shift) | (value << (32 - shift));
  const length = message.length;
  const bitLength = length * 8;
  const totalLength = (Math.floor((length + 8) / 64) + 1) * 64;
  const padded = new Uint8Array(totalLength);
  padded.set(message);
  padded[length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(7, words[index - 15]) ^
        rotateRight(18, words[index - 15]) ^
        (words[index - 15] >>> 3);
      const s1 =
        rotateRight(17, words[index - 2]) ^
        rotateRight(19, words[index - 2]) ^
        (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const bigS1 = rotateRight(6, e) ^ rotateRight(11, e) ^ rotateRight(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + bigS1 + ch + constants[index] + words[index]) >>> 0;
      const bigS0 = rotateRight(2, a) ^ rotateRight(13, a) ^ rotateRight(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigS0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('');
}

export function bytesToString(uint8: Uint8Array): string {
  let value = '';
  for (let index = 0; index < uint8.length; index += 65536) {
    value += String.fromCharCode.apply(null, Array.from(uint8.subarray(index, index + 65536)));
  }
  return value;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function formatFileType(file: File): string {
  if (file.type === 'image/png') return 'PNG';
  if (file.type === 'image/jpeg') return 'JPEG';
  if (file.type === 'image/webp') return 'WebP';
  return file.type || '未知';
}

function getImageDims(file: File): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(`${image.naturalWidth} × ${image.naturalHeight}px`);
      URL.revokeObjectURL(image.src);
    };
    image.onerror = () => resolve('—');
    image.src = URL.createObjectURL(file);
  });
}
