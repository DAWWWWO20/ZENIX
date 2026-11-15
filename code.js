
"use strict";

// ==========================================
// ZENIX AI - FREE BROWSER TTS
// Chat + Memory + Microphone + Animation
// ==========================================

const STORAGE_KEY = "zenix_chat_history_v1";

let isSending = false;
let isRecording = false;
let isTranscribing = false;

let chatHistory = [];
let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];

let speechRunId = 0;

const input = document.getElementById("userInput");
const messages = document.getElementById("messages");
const robot = document.querySelector(".robot");

let voiceButton = document.getElementById("voiceButton");
const newChatButton = document.getElementById("newChatButton");

// ==========================================
// MICROPHONE BUTTON
// ==========================================

if (!voiceButton) {
    const chat = document.querySelector(".chat");

    if (chat) {
        voiceButton = document.createElement("button");
        voiceButton.id = "voiceButton";
        voiceButton.type = "button";
        voiceButton.textContent = "🎙️ Խոսել ZENIX-ի հետ";
        chat.appendChild(voiceButton);
    }
}

// ==========================================
// ROBOT ANIMATION
// ==========================================

function setRobotState(state) {
    if (!robot) return;

    robot.classList.remove(
        "thinking",
        "writing",
        "speaking",
        "listening"
    );

    if (state) robot.classList.add(state);
}

// ==========================================
// LOAD MEMORY
// ==========================================

function loadHistory() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );

        if (!Array.isArray(saved)) return [];

        const history = [];

        for (const item of saved) {
            if (
                !item ||
                !["user", "model"].includes(item.role) ||
                typeof item.text !== "string" ||
                !item.text.trim()
            ) continue;

            const previous = history[history.length - 1];

            if (!previous && item.role !== "user") continue;
            if (previous && previous.role === item.role) continue;

            history.push({
                role: item.role,
                text: item.text.trim().slice(0, 3000)
            });
        }

        if (
            history.length &&
            history[history.length - 1].role === "user"
        ) {
            history.pop();
        }

        return history.slice(-50);

    } catch (error) {
        console.error("Memory loading error:", error);
        return [];
    }
}

chatHistory = loadHistory();

// ==========================================
// SAVE MEMORY
// ==========================================

function saveHistory() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(chatHistory)
        );
    } catch (error) {
        console.error("Memory saving error:", error);
    }
}

// ==========================================
// DISPLAY MESSAGES
// ==========================================

function addMessage(name, text, type) {
    if (!messages) return null;

    const message = document.createElement("div");
    message.className = "message " + type;

    const label = document.createElement("strong");
    label.textContent = name + ": ";

    const content = document.createElement("span");
    content.textContent = text;

    message.appendChild(label);
    message.appendChild(content);
    messages.appendChild(message);

    messages.scrollTop = messages.scrollHeight;

    return content;
}

// ==========================================
// TYPEWRITER EFFECT
// ==========================================

async function typeReply(element, text) {
    if (!element) return;

    element.textContent = "";

    for (const character of Array.from(text)) {
        element.textContent += character;

        if (messages) {
            messages.scrollTop = messages.scrollHeight;
        }

        await new Promise(resolve =>
            setTimeout(resolve, 12)
        );
    }
}

// ==========================================
// RESTORE CHAT
// ==========================================

function restoreHistory() {
    if (!messages || chatHistory.length === 0) return;

    messages.innerHTML = "";

    chatHistory.forEach(item => {
        if (item.role === "user") {
            addMessage("Դու", item.text, "user");
        } else {
            addMessage("ZENIX", item.text, "assistant");
        }
    });

    messages.scrollTop = messages.scrollHeight;
}

// ==========================================
// SEND MESSAGE TO GEMINI
// ==========================================

async function sendMessage() {
    if (isSending || isTranscribing || !input || !messages) {
        return;
    }

    const text = input.value.trim();
    if (!text) return;

    isSending = true;

    stopSpeech();
    setRobotState("thinking");

    input.disabled = true;

    addMessage("Դու", text, "user");
    input.value = "";

    const loading = addMessage(
        "ZENIX",
        "Մտածում եմ... 🤖",
        "assistant"
    );

    const requestHistory = [
        ...chatHistory,
        { role: "user", text: text }
    ].slice(-12);

    while (
        requestHistory.length &&
        requestHistory[0].role !== "user"
    ) {
        requestHistory.shift();
    }

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                history: requestHistory
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.details ||
                data.error ||
                "AI connection failed"
            );
        }

        if (
            typeof data.reply !== "string" ||
            !data.reply.trim()
        ) {
            throw new Error("Empty AI response");
        }

        setRobotState("writing");

        await typeReply(loading, data.reply);

        chatHistory.push(
            { role: "user", text: text },
            { role: "model", text: data.reply }
        );

        chatHistory = chatHistory.slice(-50);
        saveHistory();

        setRobotState("");

        speakReply(data.reply);

    } catch (error) {
        console.error("ZENIX AI Error:", error);

        if (loading) {
            loading.textContent =
                "Կապի խնդիր առաջացավ։ " + error.message;
        }

        setRobotState("");

    } finally {
        isSending = false;

        if (input) {
            input.disabled = false;
            input.focus();
        }
    }
}

// ==========================================
// FREE BROWSER TEXT TO SPEECH
// ==========================================

function stopSpeech() {
    speechRunId++;

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    setRobotState("");
}

// ==========================================
// SPLIT LONG TEXT
// ==========================================

function splitSpeechText(text, maxLength = 180) {
    const words = text.trim().split(/\s+/);
    const chunks = [];
    let current = "";

    for (const word of words) {
        if (
            (current + " " + word).trim().length > maxLength
        ) {
            if (current) chunks.push(current);
            current = word;
        } else {
            current = (current + " " + word).trim();
        }
    }

    if (current) chunks.push(current);

    return chunks;
}

// ==========================================
// DETECT LANGUAGE
// ==========================================

function getSpeechLanguage(text) {
    if (/[\u0530-\u058F]/.test(text)) {
        return "hy-AM";
    }

    if (/[\u0400-\u04FF]/.test(text)) {
        return "ru-RU";
    }

    return "en-US";
}

// ==========================================
// SELECT SYSTEM VOICE
// ==========================================

function getZenixVoice(language) {
    const voices = window.speechSynthesis.getVoices();

    return (
        voices.find(voice =>
            voice.lang.toLowerCase() === language.toLowerCase()
        ) ||
        voices.find(voice =>
            voice.lang.toLowerCase().startsWith(
                language.split("-")[0]
            )
        ) ||
        voices.find(voice => voice.default) ||
        null
    );
}

// ==========================================
// SPEAK REPLY - NO GEMINI TTS
// ==========================================

function speakReply(text) {
    if (!("speechSynthesis" in window)) {
        console.error("Speech synthesis unavailable.");

        addMessage(
            "ZENIX",
            "Այս բրաուզերը չի աջակցում ձայնային պատասխանին։",
            "assistant"
        );

        return;
    }

    stopSpeech();

    const currentRun = speechRunId;
    const language = getSpeechLanguage(text);
    const chunks = splitSpeechText(text);

    if (!chunks.length) return;

    let index = 0;

    function speakNext() {
        if (currentRun !== speechRunId) return;

        if (index >= chunks.length) {
            setRobotState("");
            return;
        }

        const utterance = new SpeechSynthesisUtterance(
            chunks[index]
        );

        utterance.lang = language;
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;

        const voice = getZenixVoice(language);

        if (voice) {
            utterance.voice = voice;
        }

        utterance.onstart = () => {
            if (currentRun === speechRunId) {
                setRobotState("speaking");
            }
        };

        utterance.onend = () => {
            if (currentRun !== speechRunId) return;

            index++;
            speakNext();
        };

        utterance.onerror = event => {
            if (currentRun !== speechRunId) return;

            console.error("ZENIX speech error:", event.error);
            setRobotState("");
        };

        window.speechSynthesis.speak(utterance);
    }

    speakNext();
}

// ==========================================
// BLOB TO BASE64
// ==========================================

async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let binary = "";
    const chunkSize = 32768;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {
        const chunk = bytes.subarray(
            i,
            i + chunkSize
        );

        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

// ==========================================
// START MICROPHONE RECORDING
// ==========================================

async function startRecording() {
    if (
        isRecording ||
        isTranscribing ||
        isSending ||
        !voiceButton
    ) {
        return;
    }

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        !window.MediaRecorder
    ) {
        addMessage(
            "ZENIX",
            "Այս բրաուզերը չի աջակցում ձայնագրությանը։",
            "assistant"
        );

        return;
    }

    try {
        mediaStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        let options = {};

        const supportedFormats = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/mp4"
        ];

        for (const format of supportedFormats) {
            if (MediaRecorder.isTypeSupported(format)) {
                options.mimeType = format;
                break;
            }
        }

        audioChunks = [];

        mediaRecorder = new MediaRecorder(
            mediaStream,
            options
        );

        mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstart = () => {
            isRecording = true;

            setRobotState("listening");

            voiceButton.textContent =
                "⏹️ Ավարտել ձայնագրությունը";
        };

        mediaRecorder.onstop = async () => {
            isRecording = false;

            if (mediaStream) {
                mediaStream.getTracks().forEach(track => {
                    track.stop();
                });

                mediaStream = null;
            }

            setRobotState("");

            voiceButton.disabled = true;

            voiceButton.textContent =
                "⏳ Ճանաչում եմ ձայնը...";

            const mimeType = (
                mediaRecorder.mimeType ||
                "audio/webm"
            ).split(";")[0];

            const blob = new Blob(audioChunks, {
                type: mimeType
            });

            audioChunks = [];

            if (!blob.size) {
                voiceButton.disabled = false;
                voiceButton.textContent =
                    "🎙️ Խոսել ZENIX-ի հետ";

                addMessage(
                    "ZENIX",
                    "Ձայնագրությունը դատարկ է։ Կրկին փորձիր։",
                    "assistant"
                );

                return;
            }

            if (blob.size > 8 * 1024 * 1024) {
                voiceButton.disabled = false;
                voiceButton.textContent =
                    "🎙️ Խոսել ZENIX-ի հետ";

                addMessage(
                    "ZENIX",
                    "Ձայնագրությունը չափազանց երկար է։",
                    "assistant"
                );

                return;
            }

            await transcribeAudio(blob, mimeType);
        };

        mediaRecorder.onerror = event => {
            console.error("Recording error:", event);

            stopRecordingTracks();

            isRecording = false;

            setRobotState("");

            voiceButton.disabled = false;
            voiceButton.textContent =
                "🎙️ Խոսել ZENIX-ի հետ";

            addMessage(
                "ZENIX",
                "Ձայնագրման սխալ առաջացավ։",
                "assistant"
            );
        };

        mediaRecorder.start();

    } catch (error) {
        console.error("Microphone error:", error);

        stopRecordingTracks();

        let errorText =
            "Չհաջողվեց միացնել խոսափողը։";

        if (error.name === "NotFoundError") {
            errorText =
                "Խոսափող չի հայտնաբերվել։ Միացրու միկրոֆոն։";
        } else if (error.name === "NotAllowedError") {
            errorText =
                "Chrome-ում թույլ տուր օգտագործել խոսափողը։";
        } else if (error.name === "NotReadableError") {
            errorText =
                "Խոսափողը զբաղված է կամ անհասանելի։";
        }

        addMessage("ZENIX", errorText, "assistant");

        voiceButton.disabled = false;
        voiceButton.textContent =
            "🎙️ Խոսել ZENIX-ի հետ";
    }
}

// ==========================================
// FREE BROWSER TEXT TO SPEECH
// ==========================================

function stopSpeech() {
    speechRunId++;

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    setRobotState("");
}

// ==========================================
// SPLIT LONG TEXT
// ==========================================

function splitSpeechText(text, maxLength = 180) {
    const words = text.trim().split(/\s+/);
    const chunks = [];
    let current = "";

    for (const word of words) {
        if (
            (current + " " + word).trim().length > maxLength
        ) {
            if (current) chunks.push(current);
            current = word;
        } else {
            current = (current + " " + word).trim();
        }
    }

    if (current) chunks.push(current);

    return chunks;
}

// ==========================================
// DETECT LANGUAGE
// ==========================================

function getSpeechLanguage(text) {
    if (/[\u0530-\u058F]/.test(text)) {
        return "hy-AM";
    }

    if (/[\u0400-\u04FF]/.test(text)) {
        return "ru-RU";
    }

    return "en-US";
}

// ==========================================
// SELECT SYSTEM VOICE
// ==========================================

function getZenixVoice(language) {
    const voices = window.speechSynthesis.getVoices();

    return (
        voices.find(voice =>
            voice.lang.toLowerCase() === language.toLowerCase()
        ) ||
        voices.find(voice =>
            voice.lang.toLowerCase().startsWith(
                language.split("-")[0]
            )
        ) ||
        voices.find(voice => voice.default) ||
        null
    );
}

// ==========================================
// SPEAK REPLY - NO GEMINI TTS
// ==========================================

function speakReply(text) {
    if (!("speechSynthesis" in window)) {
        console.error("Speech synthesis unavailable.");

        addMessage(
            "ZENIX",
            "Այս բրաուզերը չի աջակցում ձայնային պատասխանին։",
            "assistant"
        );

        return;
    }

    stopSpeech();

    const currentRun = speechRunId;
    const language = getSpeechLanguage(text);
    const chunks = splitSpeechText(text);

    if (!chunks.length) return;

    let index = 0;

    function speakNext() {
        if (currentRun !== speechRunId) return;

        if (index >= chunks.length) {
            setRobotState("");
            return;
        }

        const utterance = new SpeechSynthesisUtterance(
            chunks[index]
        );

        utterance.lang = language;
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;

        const voice = getZenixVoice(language);

        if (voice) {
            utterance.voice = voice;
        }

        utterance.onstart = () => {
            if (currentRun === speechRunId) {
                setRobotState("speaking");
            }
        };

        utterance.onend = () => {
            if (currentRun !== speechRunId) return;

            index++;
            speakNext();
        };

        utterance.onerror = event => {
            if (currentRun !== speechRunId) return;

            console.error("ZENIX speech error:", event.error);
            setRobotState("");
        };

        window.speechSynthesis.speak(utterance);
    }

    speakNext();
}

// ==========================================
// BLOB TO BASE64
// ==========================================

async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let binary = "";
    const chunkSize = 32768;

    for (
        let i = 0;
        i < bytes.length;
        i += chunkSize
    ) {
        const chunk = bytes.subarray(
            i,
            i + chunkSize
        );

        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

// ==========================================
// START MICROPHONE RECORDING
// ==========================================

async function startRecording() {
    if (
        isRecording ||
        isTranscribing ||
        isSending ||
        !voiceButton
    ) {
        return;
    }

    if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        !window.MediaRecorder
    ) {
        addMessage(
            "ZENIX",
            "Այս բրաուզերը չի աջակցում ձայնագրությանը։",
            "assistant"
        );

        return;
    }

    try {
        mediaStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        let options = {};

        const supportedFormats = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/mp4"
        ];

        for (const format of supportedFormats) {
            if (MediaRecorder.isTypeSupported(format)) {
                options.mimeType = format;
                break;
            }
        }

        audioChunks = [];

        mediaRecorder = new MediaRecorder(
            mediaStream,
            options
        );

        mediaRecorder.ondataavailable = event => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstart = () => {
            isRecording = true;

            setRobotState("listening");

            voiceButton.textContent =
                "⏹️ Ավարտել ձայնագրությունը";
        };

        mediaRecorder.onstop = async () => {
            isRecording = false;

            if (mediaStream) {
                mediaStream.getTracks().forEach(track => {
                    track.stop();
                });

                mediaStream = null;
            }

            setRobotState("");

            voiceButton.disabled = true;

            voiceButton.textContent =
                "⏳ Ճանաչում եմ ձայնը...";

            const mimeType = (
                mediaRecorder.mimeType ||
                "audio/webm"
            ).split(";")[0];

            const blob = new Blob(audioChunks, {
                type: mimeType
            });

            audioChunks = [];

            if (!blob.size) {
                voiceButton.disabled = false;
                voiceButton.textContent =
                    "🎙️ Խոսել ZENIX-ի հետ";

                addMessage(
                    "ZENIX",
                    "Ձայնագրությունը դատարկ է։ Կրկին փորձիր։",
                    "assistant"
                );

                return;
            }

            if (blob.size > 8 * 1024 * 1024) {
                voiceButton.disabled = false;
                voiceButton.textContent =
                    "🎙️ Խոսել ZENIX-ի հետ";

                addMessage(
                    "ZENIX",
                    "Ձայնագրությունը չափազանց երկար է։",
                    "assistant"
                );

                return;
            }

            await transcribeAudio(blob, mimeType);
        };

        mediaRecorder.onerror = event => {
            console.error("Recording error:", event);

            stopRecordingTracks();

            isRecording = false;

            setRobotState("");

            voiceButton.disabled = false;
            voiceButton.textContent =
                "🎙️ Խոսել ZENIX-ի հետ";

            addMessage(
                "ZENIX",
                "Ձայնագրման սխալ առաջացավ։",
                "assistant"
            );
        };

        mediaRecorder.start();

    } catch (error) {
        console.error("Microphone error:", error);

        stopRecordingTracks();

        let errorText =
            "Չհաջողվեց միացնել խոսափողը։";

        if (error.name === "NotFoundError") {
            errorText =
                "Խոսափող չի հայտնաբերվել։ Միացրու միկրոֆոն։";
        } else if (error.name === "NotAllowedError") {
            errorText =
                "Chrome-ում թույլ տուր օգտագործել խոսափողը։";
        } else if (error.name === "NotReadableError") {
            errorText =
                "Խոսափողը զբաղված է կամ անհասանելի։";
        }

        addMessage("ZENIX", errorText, "assistant");

        voiceButton.disabled = false;
        voiceButton.textContent =
            "🎙️ Խոսել ZENIX-ի հետ";
    }
}

// ==========================================
// ZENIX VOICE BUTTON CONNECTION
// ==========================================

if (voiceButton) {
    voiceButton.addEventListener("click", async () => {

        if (isTranscribing || isSending) return;

        if (isRecording) {
            if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
            }
            return;
        }

        await startRecording();
    });

    console.log("ZENIX VOICE BUTTON CONNECTED!");
} else {
    console.error("ZENIX: voiceButton not found!");
}

async function transcribeAudio(blob, mimeType) {
    isTranscribing = true;

    try {
        console.log("ZENIX: Audio recording ready");
        console.log("Audio size:", blob.size);
        console.log("Audio MIME:", mimeType);

        const audio = await blobToBase64(blob);

        console.log("Base64 created:", audio.length);
        console.log("Sending request to /api/transcribe...");

        const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                audio: audio,
                mimeType: mimeType
            })
        });

        console.log("Server status:", response.status);

        const raw = await response.text();
        console.log("Server response:", raw);

        const data = JSON.parse(raw);

        if (!response.ok) {
            throw new Error(
                data.details || data.error || "Transcription failed"
            );
        }

        if (!data.text || !data.text.trim()) {
            throw new Error("No speech recognized.");
        }

        input.value = data.text.trim();
        isTranscribing = false;

        voiceButton.disabled = false;
        voiceButton.textContent = "🎙️ Խոսել ZENIX-ի հետ";

        await sendMessage();

    } catch (error) {
        console.error("Transcription error:", error);

        isTranscribing = false;

        if (voiceButton) {
            voiceButton.disabled = false;
            voiceButton.textContent = "🎙️ Խոսել ZENIX-ի հետ";
        }

        addMessage(
            "ZENIX",
            "Ձայնի ճանաչման սխալ․ " + error.message,
            "assistant"
        );
    }
}
