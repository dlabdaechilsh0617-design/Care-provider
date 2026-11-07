const fileInput = document.querySelector("#file-input");
const cameraInput = document.querySelector("#camera-input");
const dropZone = document.querySelector("#drop-zone");
const fileList = document.querySelector("#file-list");
const toast = document.querySelector("#toast");
const resultStatus = document.querySelector("#result-status");
const resultMessage = document.querySelector("#result-message");
const resultContent = document.querySelector("#result-content");
const identificationBasisButton = document.querySelector("#identification-basis-button");
const identificationBasisPanel = document.querySelector("#identification-basis-panel");
const identificationEvidenceList = document.querySelector("#identification-evidence");
const difficultyInput = document.querySelector("#difficulty-input");
const MAX_SIZE = 20 * 1024 * 1024;
const IDENTIFY_ENDPOINT = "/api/machines/identify";
let selectedFiles = [];
let toastTimer;
const chatHistory = [];
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const chatSend = document.querySelector("#chat-send");
const chatConnection = document.querySelector("#chat-connection");
const pageContent = document.querySelector("#page-content");
const colorModeInput = document.querySelector("#color-mode");
const brightnessControl = document.querySelector("#brightness-control");
const brightnessValue = document.querySelector("#brightness-value");
const textSizeControl = document.querySelector("#text-size-control");
const textSizeValue = document.querySelector("#text-size-value");
const displaySettingsReset = document.querySelector("#display-settings-reset");
const displaySettingsKey = "gigyedoum-display-settings";
const speechLanguageInput = document.querySelector("#speech-language");
const speechLanguageKey = "gigyedoum-speech-language";
const speechLanguages = new Set([
  "ko-KR", "en-US", "ja-JP", "zh-CN", "es-ES", "fr-FR", "de-DE", "it-IT",
  "pt-BR", "ru-RU", "ar-SA", "hi-IN", "vi-VN", "id-ID", "th-TH", "tr-TR",
]);
const defaultDisplaySettings = { colorMode: "normal", brightness: 100, textSize: 100 };
const colorModes = new Set(["normal", "red", "blue", "yellow", "orange", "purple", "green", "grayscale"]);
const originalFontStyles = new WeakMap();

function applyTextSize(size) {
  const elements = Array.from(pageContent.querySelectorAll("*"));
  for (const element of elements) {
    if (!originalFontStyles.has(element)) {
      originalFontStyles.set(element, {
        value: element.style.getPropertyValue("font-size"),
        priority: element.style.getPropertyPriority("font-size"),
      });
    }
    const originalStyle = originalFontStyles.get(element);
    element.style.removeProperty("font-size");
    if (originalStyle.value) element.style.setProperty("font-size", originalStyle.value, originalStyle.priority);
  }
  if (size === 100) return;
  const baseSizes = elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  for (const [index, element] of elements.entries()) {
    const baseSize = baseSizes[index];
    if (Number.isFinite(baseSize)) element.style.setProperty("font-size", `${(baseSize * size / 100).toFixed(2)}px`, "important");
  }
}

function applyDisplaySettings(settings, persist = false) {
  const colorMode = colorModes.has(settings.colorMode) ? settings.colorMode : defaultDisplaySettings.colorMode;
  const brightness = Math.min(130, Math.max(70, Number(settings.brightness) || defaultDisplaySettings.brightness));
  const textSize = Math.min(160, Math.max(100, Number(settings.textSize) || defaultDisplaySettings.textSize));
  pageContent.dataset.colorMode = colorMode;
  pageContent.dataset.textSize = String(textSize);
  pageContent.style.setProperty("--screen-brightness", String(brightness / 100));
  applyTextSize(textSize);
  colorModeInput.value = colorMode;
  brightnessControl.value = String(brightness);
  brightnessValue.value = `${brightness}%`;
  brightnessValue.textContent = `${brightness}%`;
  textSizeControl.value = String(textSize);
  textSizeValue.value = `${textSize}%`;
  textSizeValue.textContent = `${textSize}%`;
  if (persist) {
    try {
      localStorage.setItem(displaySettingsKey, JSON.stringify({ colorMode, brightness }));
    } catch {
      // Keep the controls working for this visit if browser storage is unavailable.
    }
  }
}

let savedDisplaySettings = defaultDisplaySettings;
try {
  const storedSettings = JSON.parse(localStorage.getItem(displaySettingsKey) || "null");
  if (storedSettings && typeof storedSettings === "object") savedDisplaySettings = storedSettings;
} catch {
  // Ignore invalid or unavailable saved settings and use the defaults.
}
applyDisplaySettings(savedDisplaySettings);
const displaySettingsObserver = new MutationObserver((mutations) => {
  if (mutations.some((mutation) => mutation.addedNodes.length > 0)) applyTextSize(Number(textSizeControl.value));
});
displaySettingsObserver.observe(pageContent, { childList: true, subtree: true });
function currentDisplaySettings() {
  return { colorMode: colorModeInput.value, brightness: brightnessControl.value, textSize: textSizeControl.value };
}
colorModeInput.addEventListener("change", () => applyDisplaySettings(currentDisplaySettings(), true));
brightnessControl.addEventListener("input", () => applyDisplaySettings(currentDisplaySettings(), true));
textSizeControl.addEventListener("input", () => applyDisplaySettings(currentDisplaySettings(), true));
displaySettingsReset.addEventListener("click", () => applyDisplaySettings(defaultDisplaySettings, true));

let savedSpeechLanguage = "ko-KR";
try {
  const storedSpeechLanguage = localStorage.getItem(speechLanguageKey);
  if (speechLanguages.has(storedSpeechLanguage)) savedSpeechLanguage = storedSpeechLanguage;
} catch {
  // Keep the language selector working for this visit if browser storage is unavailable.
}
speechLanguageInput.value = savedSpeechLanguage;
speechLanguageInput.addEventListener("change", () => {
  if (activeSpeechButton) stopInstructionSpeech();
  try {
    localStorage.setItem(speechLanguageKey, speechLanguageInput.value);
  } catch {
    // Keep the selected language for this visit if browser storage is unavailable.
  }
});

document.querySelector(".result-footnote").textContent = "정확한 모델을 찾지 못해도 안전한 일반 사용법을 안내합니다. 모델별 버튼이나 위험한 작업은 확인된 자료가 없으면 추측하지 않습니다.";

const imageGuideSection = document.createElement("section");
imageGuideSection.className = "image-guide-section";
imageGuideSection.innerHTML = `
  <button class="image-guide-button" id="generate-guide-button" type="button">
    <span class="image-guide-icon" aria-hidden="true">✦</span>
    <span class="image-guide-copy"><strong class="image-guide-label">단계별 AI 그림 만들기</strong><small>기계 사진을 기준으로 각 사용 단계 그림을 따로 만들어요</small></span>
    <span class="image-guide-arrow" aria-hidden="true">→</span>
  </button>
  <div class="image-guide-output" id="generated-guide-output" hidden>
    <p class="image-guide-status" id="generated-guide-status" aria-live="polite"></p>
    <div class="image-guide-gallery" id="generated-guide-gallery" hidden></div>
    <p class="image-guide-caption">각 그림은 올린 기계 사진을 참고해 단계를 따로 생성합니다. 실제 조작 전에는 제품 표시와 사용 설명서를 확인하세요.</p>
  </div>`;
document.querySelector("#result-steps").parentElement.after(imageGuideSection);
const generateGuideButton = document.querySelector("#generate-guide-button");
const generatedGuideOutput = document.querySelector("#generated-guide-output");
const generatedGuideStatus = document.querySelector("#generated-guide-status");
const generatedGuideGallery = document.querySelector("#generated-guide-gallery");
generateGuideButton.addEventListener("click", generateInstructionImage);

function addChatBubble(role, text, isError = false) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role === "user" ? "user-bubble" : "assistant-bubble"}${isError ? " error-bubble" : ""}`;
  bubble.textContent = text;
  chatMessages.append(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

function setChatConnection(state, label) {
  chatConnection.dataset.state = state;
  chatConnection.querySelector("span").textContent = label;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || chatSend.disabled) return;

  chatHistory.push({ role: "user", content: message });
  if (chatHistory.length > 20) chatHistory.splice(0, chatHistory.length - 20);
  addChatBubble("user", message);
  chatInput.value = "";
  chatSend.disabled = true;
  setChatConnection("loading", "AI 연결 중");

  const typing = document.createElement("div");
  typing.className = "chat-bubble assistant-bubble chat-typing";
  typing.setAttribute("aria-label", "답변 작성 중");
  for (let index = 0; index < 3; index += 1) typing.append(document.createElement("i"));
  chatMessages.append(typing);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory }),
    });
    const data = await response.json().catch(() => ({}));
    typing.remove();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "AI 응답을 받지 못했습니다.");
    if (typeof data.reply !== "string" || !data.reply.trim()) throw new Error("AI가 빈 답변을 보냈습니다.");
    chatHistory.push({ role: "assistant", content: data.reply });
    if (chatHistory.length > 20) chatHistory.splice(0, chatHistory.length - 20);
    addChatBubble("assistant", data.reply);
    setChatConnection("connected", "AI 연결됨");
  } catch (error) {
    typing.remove();
    addChatBubble("assistant", error instanceof TypeError ? "서버에 연결하지 못했습니다. 터미널에서 npm start를 실행한 뒤 http://localhost:3000 으로 접속해 주세요." : error.message, true);
    setChatConnection("error", "연결 실패");
  } finally {
    chatSend.disabled = false;
    chatInput.focus();
  }
});

if (location.protocol === "file:") {
  setChatConnection("error", "웹 주소에서 열어주세요");
  addChatBubble("assistant", "index.html 파일을 직접 연 상태입니다. 터미널에서 npm start를 실행한 뒤 http://localhost:3000 으로 접속해 주세요.", true);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFiles() {
  fileList.replaceChildren();
  selectedFiles.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = file.type === "application/pdf" ? "▤" : "▧";
    const name = document.createElement("span");
    name.className = "file-chip-name";
    name.textContent = file.name;
    const size = document.createElement("span");
    size.className = "file-chip-size";
    size.textContent = formatSize(file.size);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "file-remove";
    remove.setAttribute("aria-label", `${file.name} 삭제`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderFiles();
    });
    chip.append(icon, name, size, remove);
    fileList.append(chip);
  });
  if (selectedFiles.length) {
    const send = document.createElement("button");
    send.type = "button";
    send.className = "button button-primary";
    send.style.marginTop = "5px";
    send.textContent = "사진 보내고 기계 정보 확인하기";
    send.addEventListener("click", identifyMachine);
    fileList.append(send);
  }
}

function setResultState(status, message, { loading = false, error = false } = {}) {
  resultStatus.textContent = status;
  resultMessage.textContent = message;
  resultContent.hidden = true;
  document.querySelector("#machine-result").classList.toggle("is-loading", loading);
  document.querySelector("#machine-result").classList.toggle("has-error", error);
}

function setIdentificationEvidence(items) {
  identificationEvidenceList.replaceChildren();
  const evidence = Array.isArray(items) ? items.filter((item) => typeof item === "string" && item.trim()).slice(0, 4) : [];
  for (const text of evidence) {
    const item = document.createElement("li");
    item.textContent = text;
    identificationEvidenceList.append(item);
  }
  identificationBasisButton.hidden = evidence.length === 0;
  identificationBasisPanel.hidden = true;
  identificationBasisButton.setAttribute("aria-expanded", "false");
  identificationBasisButton.textContent = "왜 이렇게 식별했나요?";
}

identificationBasisButton.addEventListener("click", () => {
  const expanded = identificationBasisButton.getAttribute("aria-expanded") === "true";
  identificationBasisButton.setAttribute("aria-expanded", String(!expanded));
  identificationBasisPanel.hidden = expanded;
  identificationBasisButton.textContent = expanded ? "왜 이렇게 식별했나요?" : "식별 근거 숨기기";
});

let activeSpeechButton = null;
let activeSpeechUtterance = null;
let currentInstructionSteps = [];
let currentCautions = [];
const speechTranslationCache = new Map();
const readAllStepsButton = document.querySelector("#read-all-steps");
const readAllCautionsButton = document.querySelector("#read-all-cautions");
const stepsProgressText = document.querySelector("#steps-progress-text");
const stepsProgressBar = document.querySelector("#steps-progress-bar");

function updateStepsProgress() {
  const checkboxes = Array.from(document.querySelectorAll("#result-steps .step-complete-checkbox"));
  const completed = checkboxes.filter((checkbox) => checkbox.checked).length;
  const total = checkboxes.length;
  const percent = total ? Math.round(completed / total * 100) : 0;
  stepsProgressText.textContent = `${completed} / ${total}단계 완료`;
  stepsProgressBar.value = percent;
}

async function getSpeechTranslation(text, language, kind = "step") {
  if (language === "ko-KR") return text;
  const cacheKey = `${kind}\n${language}\n${text}`;
  if (speechTranslationCache.has(cacheKey)) return speechTranslationCache.get(cacheKey);

  const response = await fetch("/api/speech-translation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, kind }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.translation !== "string" || !result.translation.trim()) {
    throw new Error(result.error || "단계 번역에 실패했어요. 다시 눌러 주세요.");
  }
  const translation = result.translation.trim();
  speechTranslationCache.set(cacheKey, translation);
  return translation;
}

function resetSpeechButton(button) {
  if (button === readAllStepsButton) button.textContent = "▶ 전체 단계 이어 듣기";
  else if (button === readAllCautionsButton) button.textContent = "⚠ 주의사항 이어 듣기";
  else button.textContent = "🔊 음성으로 듣기";
  button.setAttribute("aria-pressed", "false");
}

function stopInstructionSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (activeSpeechButton) resetSpeechButton(activeSpeechButton);
  activeSpeechButton = null;
  activeSpeechUtterance = null;
}

function createInstructionUtterance(index, text, language, kind = "step") {
  const stepPrefixes = {
    "ko-KR": `${index + 1}단계. `,
    "en-US": `Step ${index + 1}. `,
    "ja-JP": `ステップ${index + 1}。`,
    "zh-CN": `第${index + 1}步。`,
    "es-ES": `Paso ${index + 1}. `,
    "fr-FR": `Étape ${index + 1}. `,
    "de-DE": `Schritt ${index + 1}. `,
    "it-IT": `Passaggio ${index + 1}. `,
    "pt-BR": `Etapa ${index + 1}. `,
    "ru-RU": `Шаг ${index + 1}. `,
    "ar-SA": `الخطوة ${index + 1}. `,
    "hi-IN": `चरण ${index + 1}। `,
    "vi-VN": `Bước ${index + 1}. `,
    "id-ID": `Langkah ${index + 1}. `,
    "th-TH": `ขั้นตอนที่ ${index + 1} `,
    "tr-TR": `Adım ${index + 1}. `,
  };
  const cautionPrefixes = {
    "ko-KR": `${index + 1}번째 주의사항. `,
    "en-US": `Caution ${index + 1}. `,
    "ja-JP": `${index + 1}つ目の注意事項。`,
    "zh-CN": `注意事项${index + 1}。`,
    "es-ES": `Precaución ${index + 1}. `,
    "fr-FR": `Attention ${index + 1}. `,
    "de-DE": `Achtung ${index + 1}. `,
    "it-IT": `Attenzione ${index + 1}. `,
    "pt-BR": `Atenção ${index + 1}. `,
    "ru-RU": `Предупреждение ${index + 1}. `,
    "ar-SA": `تنبيه ${index + 1}. `,
    "hi-IN": `सावधानी ${index + 1}। `,
    "vi-VN": `Lưu ý ${index + 1}. `,
    "id-ID": `Perhatian ${index + 1}. `,
    "th-TH": `ข้อควรระวังที่ ${index + 1} `,
    "tr-TR": `Uyarı ${index + 1}. `,
  };
  const prefix = (kind === "caution" ? cautionPrefixes : stepPrefixes)[language] || "";
  const utterance = new SpeechSynthesisUtterance(prefix + text);
  utterance.lang = language;
  utterance.rate = 0.95;
  const voices = window.speechSynthesis.getVoices();
  const matchingVoice = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(language.split("-")[0].toLowerCase()));
  if (matchingVoice) utterance.voice = matchingVoice;
  return utterance;
}

async function speakListItemWithButton(button, index, text, language, sequenceLength = 0, kind = "step") {
  const sequence = sequenceLength > 0;
  const sequenceLabel = kind === "caution" ? "주의 읽기" : "전체 재생";
  button.textContent = sequence
    ? `${language === "ko-KR" ? "준비 중" : "번역 중"} ${index + 1}/${sequenceLength} · 취소`
    : language === "ko-KR" ? "■ 음성 멈추기" : "번역 중 · 취소";
  const spokenText = await getSpeechTranslation(text, language, kind);
  if (activeSpeechButton !== button) return false;

  const utterance = createInstructionUtterance(index, spokenText, language, kind);
  activeSpeechUtterance = utterance;
  button.textContent = sequence ? `${sequenceLabel} ${index + 1}/${sequenceLength} · 멈추기` : "■ 음성 멈추기";
  return new Promise((resolve, reject) => {
    utterance.onend = () => {
      const wasActive = activeSpeechUtterance === utterance;
      if (wasActive) activeSpeechUtterance = null;
      resolve(wasActive && activeSpeechButton === button);
    };
    utterance.onerror = (event) => {
      const wasActive = activeSpeechUtterance === utterance;
      if (wasActive) activeSpeechUtterance = null;
      if (!wasActive || activeSpeechButton !== button || ["canceled", "interrupted"].includes(event.error)) {
        if (activeSpeechButton === button) finishSpeechButton(button);
        resolve(false);
        return;
      }
      reject(new Error("이 언어의 음성을 사용할 수 없어요. 기기의 음성 언어 설정을 확인해 주세요."));
    };
    window.speechSynthesis.speak(utterance);
  });
}

function finishSpeechButton(button) {
  if (activeSpeechButton !== button) return;
  resetSpeechButton(button);
  activeSpeechButton = null;
  activeSpeechUtterance = null;
}

function appendTextList(target, values, { speech = false, speechKind = "step", checklist = false } = {}) {
  target.replaceChildren();
  for (const [index, value] of values.entries()) {
    const item = document.createElement("li");
    if (checklist) {
      const row = document.createElement("div");
      row.className = "instruction-step-row";
      const checkbox = document.createElement("input");
      checkbox.className = "step-complete-checkbox";
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", `${index + 1}단계 완료로 표시`);
      checkbox.addEventListener("change", () => {
        item.classList.toggle("is-complete", checkbox.checked);
        updateStepsProgress();
      });
      const stepText = document.createElement("span");
      stepText.className = "instruction-step-text";
      stepText.textContent = value;
      row.append(checkbox, stepText);
      item.append(row);
    } else {
      item.textContent = value;
    }
    if (speech) {
      const speechButton = document.createElement("button");
      speechButton.className = "step-speech-button";
      speechButton.type = "button";
      speechButton.textContent = "🔊 음성으로 듣기";
      speechButton.setAttribute("aria-pressed", "false");

      if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        speechButton.disabled = true;
        speechButton.textContent = "이 브라우저는 음성 안내를 지원하지 않아요";
      } else {
        speechButton.addEventListener("click", async () => {
          if (activeSpeechButton === speechButton) {
            stopInstructionSpeech();
            return;
          }

          stopInstructionSpeech();
          activeSpeechButton = speechButton;
          speechButton.setAttribute("aria-pressed", "true");
          const language = speechLanguageInput.value;
          try {
            const completed = await speakListItemWithButton(speechButton, index, value, language, 0, speechKind);
            if (completed) finishSpeechButton(speechButton);
          } catch (error) {
            if (activeSpeechButton !== speechButton) return;
            stopInstructionSpeech();
            showToast(error.message || "단계 번역에 실패했어요. 다시 눌러 주세요.");
          }
        });
      }

      const controls = document.createElement("div");
      controls.className = "step-speech-controls";
      controls.append(speechButton);
      item.append(controls);
    }
    target.append(item);
  }
  if (checklist) updateStepsProgress();
}

async function playListInSequence(button, items, kind) {
  if (activeSpeechButton === button) {
    stopInstructionSpeech();
    return;
  }
  if (!items.length) return;

  stopInstructionSpeech();
  activeSpeechButton = button;
  button.setAttribute("aria-pressed", "true");
  const language = speechLanguageInput.value;
  try {
    for (const [index, item] of items.entries()) {
      if (activeSpeechButton !== button) return;
      const completed = await speakListItemWithButton(button, index, item, language, items.length, kind);
      if (!completed || activeSpeechButton !== button) return;
    }
    finishSpeechButton(button);
  } catch (error) {
    if (activeSpeechButton !== button) return;
    stopInstructionSpeech();
    showToast(error.message || "음성 안내를 준비하지 못했어요. 다시 눌러 주세요.");
  }
}

readAllStepsButton.addEventListener("click", () => playListInSequence(readAllStepsButton, currentInstructionSteps, "step"));
readAllCautionsButton.addEventListener("click", () => playListInSequence(readAllCautionsButton, currentCautions, "caution"));

if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
  readAllStepsButton.disabled = true;
  readAllCautionsButton.disabled = true;
  readAllStepsButton.textContent = "이 브라우저는 음성 안내를 지원하지 않아요";
  readAllCautionsButton.textContent = "이 브라우저는 음성 안내를 지원하지 않아요";
}

function showMachineResult(data) {
  stopInstructionSpeech();
  generatedGuideOutput.hidden = true;
  generatedGuideGallery.replaceChildren();
  generatedGuideGallery.hidden = true;
  const machineName = typeof data.machine_name === "string" ? data.machine_name.trim() : "";
  const model = typeof data.model === "string" ? data.model.trim() : "";
  const purpose = typeof data.purpose === "string" ? data.purpose.trim() : "";
  const identificationEvidence = Array.isArray(data.identification_evidence) ? data.identification_evidence : [];
  const steps = Array.isArray(data.steps) ? data.steps.filter((item) => typeof item === "string" && item.trim()) : [];
  currentInstructionSteps = steps;
  const cautions = Array.isArray(data.cautions) ? data.cautions.filter((item) => typeof item === "string" && item.trim()) : [];
  currentCautions = cautions;
  const sources = Array.isArray(data.sources) ? data.sources.filter((source) =>
    source && typeof source.title === "string" && typeof source.url === "string" && /^https?:\/\//i.test(source.url)
  ) : [];

  if (!machineName) {
    setIdentificationEvidence([]);
    imageGuideSection.hidden = true;
    setResultState("기계 종류를 확인하지 못했어요", "기계 전체 모습과 로고, 조작부가 잘 보이는 사진을 더 올리거나 어떤 곳에서 쓰는 기계인지 적어주세요. 이름표는 선택 사항입니다.", { error: true });
    return;
  }

  setIdentificationEvidence(identificationEvidence);
  document.querySelector("#result-machine-name").textContent = machineName;
  document.querySelector("#result-model").textContent = model ? `모델명 ${model}` : "정확한 모델명 확인 필요";
  if (data.guide_type === "general") {
    document.querySelector("#result-model").textContent = "모델 미확인 · 대표 사용법";
  }

  const detailSections = document.querySelectorAll("#result-content .result-block, #result-content .result-sources");
  const verifiedInstructions = Boolean(data.guide_type === "verified" && model && purpose && steps.length > 0 && sources.length > 0);
  const generalInstructions = Boolean(data.guide_type === "general" && purpose && steps.length > 0);
  if (!verifiedInstructions && !generalInstructions) {
    detailSections.forEach((section) => { section.hidden = true; });
    imageGuideSection.hidden = true;
    setResultState("안전한 사용법을 확인하지 못했어요", "사진 속 특징과 여러 자료를 살펴봤지만 안내할 만큼 신뢰할 수 있는 절차를 확인하지 못했습니다. 전체 모습이나 로고가 더 잘 보이는 사진, 사용 장소 같은 단서를 추가해 주세요. 이름표는 필수가 아닙니다.");
    resultContent.hidden = false;
    return;
  }
  detailSections.forEach((section) => { section.hidden = false; });
  imageGuideSection.hidden = false;
  document.querySelector("#result-sources").closest(".result-sources").hidden = sources.length === 0;
  document.querySelector("#result-steps").parentElement.querySelector("h3").textContent = generalInstructions ? "대표적인 사용법 · 모델 미확인" : "확인된 모델의 사용법";
  document.querySelector("#result-purpose").textContent = purpose;
  appendTextList(document.querySelector("#result-steps"), steps, { speech: true, checklist: true });
  appendTextList(document.querySelector("#result-cautions"), cautions, { speech: true, speechKind: "caution" });
  document.querySelector("#result-cautions-block").hidden = cautions.length === 0;

  const sourceList = document.querySelector("#result-sources");
  sourceList.replaceChildren();
  for (const source of sources) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title;
    item.append(link);
    if (typeof source.publisher === "string" && source.publisher.trim()) {
      const publisher = document.createElement("span");
      publisher.className = "source-publisher";
      publisher.textContent = source.publisher.trim();
      item.append(publisher);
    }
    sourceList.append(item);
  }

  resultStatus.textContent = "자료를 확인했어요";
  resultMessage.textContent = "제품 모델과 확인 가능한 자료를 바탕으로 정리한 안내입니다. 자세한 내용은 아래 출처에서 다시 확인할 수 있어요.";
  if (generalInstructions) {
    resultStatus.textContent = "사진 속 종류를 바탕으로 한 일반 안내";
    resultMessage.textContent = "정확한 모델을 확인하지 못해, 사진에서 식별한 기계 종류와 찾은 자료를 바탕으로 공통적인 사용법을 안내합니다. 세부 버튼이나 설정은 모델마다 다를 수 있습니다.";
    document.querySelector(".result-footnote").textContent = "아래 내용은 모델별 설명서로 확인한 방법이 아닙니다. 고전압·가스·날·압력·산업용 기계는 이 안내만으로 작동하지 말고 담당자나 제조사에 확인하세요.";
  } else {
    document.querySelector(".result-footnote").textContent = "제품명과 모델을 확인하고 공식 자료에서 검증한 사용 안내입니다. 아래 출처에서 자세한 내용을 확인할 수 있습니다.";
  }
  document.querySelector("#machine-result").classList.remove("is-loading", "has-error");
  resultContent.hidden = false;
}

async function loadGuidePhoto(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Use the image element fallback if the browser cannot decode this file as a bitmap.
    }
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new TypeError("사진을 읽지 못했습니다."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderGeneratedGuideImages(machineName, steps, images) {
  generatedGuideGallery.replaceChildren();
  const safeMachineName = machineName.replace(/[\\/:*?"<>|]/g, "-");

  images.forEach((image, index) => {
    const figure = document.createElement("figure");
    figure.className = "image-guide-card";
    const imageElement = document.createElement("img");
    imageElement.src = "data:" + (image.mime_type || "image/png") + ";base64," + image.image;
    imageElement.alt = machineName + " 사용 단계 " + (index + 1) + " AI 생성 그림";
    imageElement.loading = "lazy";
    const caption = document.createElement("figcaption");
    caption.textContent = (index + 1) + ". " + steps[index];
    const download = document.createElement("a");
    download.className = "image-guide-download";
    download.href = imageElement.src;
    download.download = safeMachineName + "-사용단계-" + (index + 1) + ".png";
    download.textContent = "이 단계 그림 저장";
    figure.append(imageElement, caption, download);
    generatedGuideGallery.append(figure);
  });
  generatedGuideGallery.hidden = false;
}

async function renderAnnotatedGuideImages(machineName, steps, imageFiles, plans) {
  generatedGuideGallery.replaceChildren();
  const safeMachineName = machineName.replace(/[\\/:*?"<>|]/g, "-");

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    const sourceFile = imageFiles[plan.reference_index] || imageFiles[0];
    const sourceImage = await loadGuidePhoto(sourceFile);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 800;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진 안내 그림을 만들 수 없습니다.");
    context.fillStyle = "#f3f6f2";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.width / sourceImage.width, canvas.height / sourceImage.height);
    const drawWidth = sourceImage.width * scale;
    const drawHeight = sourceImage.height * scale;
    const offsetX = (canvas.width - drawWidth) / 2;
    const offsetY = (canvas.height - drawHeight) / 2;
    context.drawImage(sourceImage, offsetX, offsetY, drawWidth, drawHeight);

    if (plan.focus_visible === true) {
      const x = offsetX + plan.x * drawWidth;
      const y = offsetY + plan.y * drawHeight;
      const width = plan.width * drawWidth;
      const height = plan.height * drawHeight;
      context.fillStyle = "rgba(231, 92, 54, 0.16)";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "#d64e31";
      context.lineWidth = 8;
      context.setLineDash([18, 10]);
      context.strokeRect(x, y, width, height);
      context.setLineDash([]);
      context.beginPath();
      context.arc(x + width / 2, y + height / 2, 15, 0, Math.PI * 2);
      context.fillStyle = "#d64e31";
      context.fill();
    }
    if (typeof sourceImage.close === "function") sourceImage.close();

    const figure = document.createElement("figure");
    figure.className = "image-guide-card";
    const imageElement = document.createElement("img");
    imageElement.src = canvas.toDataURL("image/png");
    imageElement.alt = machineName + " 사용 단계 " + (index + 1) + " 사진 안내 그림";
    imageElement.loading = "lazy";
    const caption = document.createElement("figcaption");
    const locationNote = plan.focus_visible
      ? "사진에서 AI가 확인한 조작 위치를 표시했습니다."
      : "사진에서 해당 조작 위치를 확실히 찾지 못해 표시하지 않았습니다.";
    caption.textContent = (index + 1) + ". " + steps[index] + " " + locationNote;
    const download = document.createElement("a");
    download.className = "image-guide-download";
    download.href = imageElement.src;
    download.download = safeMachineName + "-사진안내-" + (index + 1) + ".png";
    download.textContent = "이 단계 그림 저장";
    figure.append(imageElement, caption, download);
    generatedGuideGallery.append(figure);
  }
  generatedGuideGallery.hidden = false;
}

async function generateInstructionImage() {
  const imageFiles = selectedFiles.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 3);
  const machineName = document.querySelector("#result-machine-name").textContent.trim();
  const purpose = document.querySelector("#result-purpose").textContent.trim();
  const steps = Array.from(document.querySelectorAll("#result-steps li"), (item) => item.textContent.trim()).filter(Boolean).slice(0, 4);

  generatedGuideOutput.hidden = false;
  generatedGuideGallery.hidden = true;
  generatedGuideGallery.replaceChildren();

  if (!imageFiles.length) {
    generatedGuideStatus.textContent = "AI 그림을 만들려면 JPG, PNG 또는 WebP 기계 사진이 필요합니다.";
    return;
  }
  if (!machineName || !steps.length) {
    generatedGuideStatus.textContent = "먼저 기계 사진을 보내 사용 순서를 확인해 주세요.";
    return;
  }

  generateGuideButton.disabled = true;
  generateGuideButton.querySelector(".image-guide-label").textContent = "단계별 그림 만드는 중";
  generatedGuideStatus.textContent = "기계 사진을 기준으로 각 사용 단계의 AI 그림을 따로 만들고 있습니다.";

  try {
    const formData = new FormData();
    imageFiles.forEach((file) => formData.append("images", file, file.name));
    formData.append("machine_name", machineName);
    formData.append("purpose", purpose);
    formData.append("steps", JSON.stringify(steps));

    const response = await fetch("/api/machines/illustrate", { method: "POST", body: formData });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "단계별 AI 그림을 만들지 못했습니다.");
    }
    if (data.guide_image_mode === "annotated_reference" && Array.isArray(data.plans) && data.plans.length === steps.length) {
      await renderAnnotatedGuideImages(machineName, steps, imageFiles, data.plans);
      generatedGuideStatus.textContent = "실제 기계 사진은 그대로 두고 AI가 찾은 조작 위치를 단계별로 표시했습니다.";
      return;
    }
    if (!Array.isArray(data.images) || data.images.length !== steps.length ||
        data.images.some((image) => typeof image?.image !== "string" || !image.image)) {
      throw new Error("AI가 단계별 그림을 완성하지 못했습니다.");
    }

    renderGeneratedGuideImages(machineName, steps, data.images);
    generatedGuideStatus.textContent = "올린 사진을 기준으로 사용 단계마다 AI 그림을 따로 만들었습니다.";
  } catch (error) {
    generatedGuideGallery.hidden = true;
    generatedGuideStatus.textContent = error instanceof TypeError
      ? "AI 그림 서버에 연결하지 못했습니다. 서버 연결을 확인하고 다시 시도해 주세요."
      : error.message || "단계별 AI 그림을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
  } finally {
    generateGuideButton.disabled = false;
    generateGuideButton.querySelector(".image-guide-label").textContent = "단계별 AI 그림 만들기";
  }
}

async function identifyMachine() {
  if (!selectedFiles.length) return;
  stopInstructionSpeech();
  currentInstructionSteps = [];
  const buttons = fileList.querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  setResultState("사진과 자료를 살펴보고 있어요", "외형, 로고, 조작부와 문서를 확인하고 여러 언어로 자료를 찾아봅니다. 이름표가 없어도 계속 진행합니다.", { loading: true });

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append("files", file, file.name));
  formData.append("difficulty", difficultyInput.value.trim().slice(0, 500));

  try {
    const response = await fetch(IDENTIFY_ENDPOINT, { method: "POST", body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 || response.status === 501) throw new Error("not-configured");
      throw new Error(typeof result.error === "string" ? result.error : "사진을 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    showMachineResult(result);
  } catch (error) {
    if (error.message === "not-configured" || error instanceof TypeError) {
      setResultState("사진 판별 기능이 아직 연결되지 않았어요", "사진은 선택됐지만 기계 확인 서버에 전달되지 않았습니다. 사진을 보고 기계 종류를 판별하고 관련 자료를 찾는 서버를 연결해야 안내할 수 있습니다.", { error: true });
    } else {
      setResultState("사진을 확인하지 못했어요", `${error.message} 확인되지 않은 사용법은 표시하지 않습니다.`, { error: true });
    }
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function addFiles(fileCollection) {
  const files = Array.from(fileCollection || []);
  if (!files.length) return;
  let accepted = 0;
  for (const file of files) {
    const supportedImage = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type);
    const supported = supportedImage || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!supported) {
      showToast("사진이나 PDF 파일을 선택해 주세요.");
      continue;
    }
    if (file.size > MAX_SIZE) {
      showToast("파일 크기는 20MB 이하로 선택해 주세요.");
      continue;
    }
    if (!selectedFiles.some((item) => item.name === file.name && item.size === file.size)) {
      selectedFiles.push(file);
      accepted += 1;
    }
  }
  renderFiles();
  if (accepted > 0) showToast(`${accepted}개 파일을 기기에서 확인할 수 있어요.`);
}

document.querySelector("#choose-button").addEventListener("click", () => fileInput.click());
document.querySelector("#camera-button").addEventListener("click", () => cameraInput.click());
fileInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});
cameraInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  });
}
dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
