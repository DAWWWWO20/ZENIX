require("dotenv").config({ override: true });

const key = process.env.GEMINI_API_KEY?.trim();

async function test() {
    const models = [
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
    "gemini-3.8-flash-tts"
];

    for (const model of models) {
        console.log("\nTesting:", model);

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": key
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: "Say in Armenian: Բարև, ես Զենիքսն եմ։"
                            }]
                        }],
                        generationConfig: {
                            responseModalities: ["AUDIO"],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: {
                                        voiceName: "Sulafat"
                                    }
                                }
                            }
                        }
                    })
                }
            );

            const data = await response.json();

            console.log("STATUS:", response.status);
            console.log(
                "AUDIO:",
                Boolean(data.candidates?.[0]?.content?.parts?.some(p => p.inlineData?.data))
            );

            if (response.ok && data.candidates?.[0]?.content?.parts?.some(p => p.inlineData?.data)) {
                console.log("WORKING MODEL:", model);
                break;
            }

            console.log("ERROR:", data.error?.message || "No audio returned");

        } catch (e) {
            console.log("ERROR:", e.message);
        }
    }
}

test();