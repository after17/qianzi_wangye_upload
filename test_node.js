const axios = require('axios');

async function test_qwen() {
    const qwenApiKey = 'sk-b80a16a89261449ab195fa4dd8aa414a';
    try {
        const response = await axios.post(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
            {
                model: 'qwen3-tts-vc-2026-01-22',
                input: {
                    text: '你好呀'
                },
                parameters: {
                    // voice: 'VOICE_ID_IF_WE_HAD_ONE'
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${qwenApiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Success! Data:");
        console.log(response.data);
    } catch (e) {
        console.error("Error:", e.response?.data || e.message);
    }
}
test_qwen();
