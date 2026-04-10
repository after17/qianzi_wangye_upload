require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const multer = require('multer');

// Configure multer for file uploads (storing in memory first to safely write later, or disk)
const upload = multer({ dest: 'uploads/' });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 优先处理系统环境变量中的 DASHSCOPE_API_KEY
if (process.env.DASHSCOPE_API_KEY) {
    process.env.DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY.replace(/['"]+/g, '').trim();
}
// 兼容之前的 QWEN_API_KEY
if (process.env.QWEN_API_KEY) {
    process.env.QWEN_API_KEY = process.env.QWEN_API_KEY.replace(/['"]+/g, '').trim();
}
// 保证 Python 脚本一定能拿到名为 DASHSCOPE_API_KEY 的变量
if (!process.env.DASHSCOPE_API_KEY && process.env.QWEN_API_KEY) {
    process.env.DASHSCOPE_API_KEY = process.env.QWEN_API_KEY;
}

// 50 questions about 千字文
const QUESTION_BANK = [
    "《千字文》成书于我国哪个历史时期？",
    "《千字文》最初是由谁奉命编纂的？",
    "《千字文》是基于哪位书法家的一千个不重复汉字编写而成的？",
    "《千字文》编纂的初衷是为哪一类人群提供教材？",
    "《千字文》的思想内核以什么为哲学基础？",
    "“吊民伐罪，周发殷汤”体现了古代怎样的政治思想？",
    "“坐朝问道，垂拱平章”倡导了怎样的德治理想？",
    "在现代思政教育中，《千字文》中的“化被草木，赖及万方”能为哪种理念提供历史依据？",
    "“盖此身发，四大五常”强调了身体与什么概念的不可分割性？",
    "在大中小学一体化思政课建设中，小学阶段应用《千字文》的核心目标是什么？",
    "“天地玄黄，宇宙洪荒”提醒人们对待自然界的力量应抱有怎样的态度？",
    "“日月盈昃，辰宿列张”启示后人要认识到什么事物的宝贵性？",
    "“寒来暑往，秋收冬藏”中，“秋收冬藏”强调了哪一行业的重要性？",
    "“闰余成岁”传达了人们在生活中应对复杂情况时需要具备什么能力？",
    "“云腾致雨”寓意着事物之间存在怎样的联系？",
    "“金生丽水，玉出昆岗”可以启发人们注重培养自身的什么素质？",
    "“剑号巨阙，珠称夜光”中的“夜光”象征着什么？",
    "“果珍李奈，菜重芥姜”告诫人们对待自然资源应持何种态度？",
    "“海咸河淡，鳞潜羽翔”教导我们在面对生活中不同的人和事时，应以什么心态去理解和接纳？",
    "“龙师火帝”中的“火”在中国传统文化中象征着什么力量？",
    "“始制文字，乃服衣裳”传达的启示是人类的文明和进步离不开什么精神？",
    "“推位让国，有虞陶唐”的典故告诉我们面对国家利益时应具备怎样的责任感？",
    "“吊民伐罪”的制度初衷是为了维护社会的什么秩序？",
    "“爱育黎首，臣伏戎羌”代表了中国古代怎样的民族情怀与国际观？",
    "“遐迩一体，率宾归王”对现代企业或组织的管理凝聚力有何启发？",
    "“鸣凤在树，白驹食场”蕴含了怎样平等的生命哲理？",
    "“恭惟鞠养，岂敢毁伤”强调了对长辈的敬重以及对自身什么的规范？",
    "“女慕贞洁，男效才良”对于现代人的全面发展与品德修养有何提醒？",
    "“知过必改，得能莫忘”要求我们在了解自己的错误后必须采取什么行动？",
    "“罔谈彼短，靡恃己长”教导我们要以怎样的心态与他人相处？",
    "“信使可覆，器欲难量”表达了“信用”与哪一项个人品质的重要性？",
    "“墨悲丝染，诗赞羔羊”提醒人们要保持对自然和什么事物的敬畏与热爱？",
    "“景行维贤，克念作圣”中，“维贤”指的是通过什么途径来提升自己的道德水平？",
    "“德建名立，形端表正”意指只有凭借什么才能建立真正的声誉？",
    "“空谷传声，虚堂习听”传达了一种怎样的观察和倾听智慧？",
    "“祸因恶积，福缘善庆”告诫人们要以什么作为基本的生活准则？",
    "“尺璧非宝，寸阴是竞”告诉我们什么事物的价值是无法估量的？",
    "“资父事君，曰严与敬”告诫子女对待长辈和上级应持怎样的态度？",
    "“孝当竭力，忠则尽命”强调了哪两种为人处世的核心价值观？",
    "“临深履薄，夙兴温清”提醒人们在面临困难时应保持怎样的做事态度？",
    "“川流不息，渊澄取映”在文中被引申为形容宇宙中的什么现象？",
    "“容止若思，言辞安定”体现了在社交场合中应该保持怎样的个人品质？",
    "“笃初诚美，慎终宜令”中的“笃初”意指人们应当始终坚持什么？",
    "“荣业所基，藉甚无竟”告诉我们成功的背后需要具备什么前提？",
    "“存以甘棠，去而益咏”强调人们应该珍惜什么并留下美好回忆？",
    "“乐殊贵贱，礼别尊卑”在现代社交中提醒我们应当注意什么交往原则？",
    "“上和下睦，夫唱妇随”强调了家庭与哪个层面的和谐与团结？",
    "“外受傅训，入奉母仪”阐述了什么教育在孩子一生中的深远影响？",
    "“交友投分，切磨箴规”教导我们在选择朋友时应当看重对方的什么特质？",
    "“节义廉退，颠沛匪亏”启示我们在面对困境和诱惑时应该坚守什么底线？"
];

const crypto = require('crypto');

const { exec } = require('child_process');
const fs = require('fs');

// 获取 Python 命令名称或绝对路径 (支持在 .env 中自定义)
// 默认可能有的叫 python, 有的叫 python3
const PYTHON_CMD = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');

// Helper: Call Python `qwen_tts_helper` script
function synthesizeSpeech(text) {
    return new Promise((resolve, reject) => {
        const tempId = uuidv4().replace(/-/g, '');
        // 使用绝对路径避免执行目录问题
        const outputFilePath = path.join(__dirname, `temp_audio_${tempId}.mp3`);
        const pythonScriptPath = path.join(__dirname, 'qwen_tts_helper.py');
        const voiceId = process.env.VOICE_ID || 'qwen-tts-vc-my_custom_voice-voice-20260304124857403-73fa';

        // 构造执行命令, 注意这里的 text 可能包含双引号所以用 base64 传递比较稳妥，
        // 但这里为了方便先使用命令行转义机制
        // 对于 Windows, 我们尽量把双引号转义
        const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
        // 传递 text, output path, 以及 voiceId 给 qwen_tts_helper.py
        const cmd = `"${PYTHON_CMD}" "${pythonScriptPath}" "${safeText}" "${outputFilePath}" "${voiceId}"`;

        console.log(`Executing Python TTS: ${pythonScriptPath} ...`);

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error("Python Edge TTS failed:", stderr || error.message);
                if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
                return reject(new Error('TTS Python Exec 失败: ' + (stderr || error.message)));
            }

            if (stdout.includes("SUCCESS")) {
                try {
                    const audioBuffer = fs.readFileSync(outputFilePath);
                    // 清理临时文件
                    fs.unlinkSync(outputFilePath);
                    resolve(audioBuffer);
                } catch (fsErr) {
                    reject(new Error("读取音频文件失败: " + fsErr.message));
                }
            } else {
                reject(new Error("Python returned error: " + stdout));
            }
        });
    });
}

// GET /api/questions -> Return 5 random questions
app.get('/api/questions', (req, res) => {
    const shuffled = [...QUESTION_BANK].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);
    res.json({ questions: selected });
});

// POST /api/answer -> Get Qwen reply + TTS audio
app.post('/api/answer', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }

        // 获取 API Key：由于我们要优先使用您在系统中全局设置的 DASHSCOPE_API_KEY，把优先级调换过来
        let qwenApiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
        if (!qwenApiKey) {
            console.error("CRITICAL: 环境变量中未配置通义千问 API_KEY");
            return res.status(500).json({ error: '服务端未配置 API_KEY，请联系管理员' });
        }

        // 最后一道防线：确保发送给 Axios 认证头的 Key 绝对不包含任何首尾的多余引号
        qwenApiKey = qwenApiKey.replace(/^['"]+|['"]+$/g, '').trim();

        // 1. Call Qwen API (兼容 OpenAI 格式的接口)
        const qwenRes = await axios.post(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            {
                model: 'qwen3.5-flash', // 修改为 qwen3.5-flash
                messages: [
                    { role: 'system', content: '你是一个智能数字人助手。请直接回答用户的问题，回答要口语化、简明扼要，适合通过语音播报即可。不要使用复杂的Markdown排版格式。在300个字以内 复杂的问题就回答长一点，简单的问题的回答短一点' },
                    { role: 'user', content: question }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${qwenApiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const answerText = qwenRes.data.choices[0].message.content;

        // 2. Call New Python TTS (Aliyun Qwen-Voice SDK)
        const audioBuffer = await synthesizeSpeech(answerText);
        const audioBase64 = audioBuffer.toString('base64');

        // 3. Return JSON with both text and base64 audio
        res.json({
            answer: answerText,
            audioBase64: `data:audio/mp3;base64,${audioBase64}`
        });

    } catch (error) {
        // --- 核心调试日志：打印阿里云返回的详细错误体 (Json 格式) ---
        if (error.response && error.response.data) {
            console.error('【阿里 API 详情】:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error processing answer (Full Error):', error);
        }

        res.status(500).json({ error: 'Failed to process the question. ' + error.message });
    }
});

// Helper: Call Python `qwen_asr_helper` script
function recognizeSpeech(audioFilePath) {
    return new Promise((resolve, reject) => {
        const pythonScriptPath = path.join(__dirname, 'qwen_asr_helper.py');
        const cmd = `"${PYTHON_CMD}" "${pythonScriptPath}" "${audioFilePath}"`;

        console.log(`Executing Python ASR: ${cmd} ...`);

        // 设置 env 确保 Python 使用 UTF-8
        const execOptions = {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        };

        exec(cmd, execOptions, (error, stdout, stderr) => {
            // 注意：我们不再强行 reject error，因为 Python 在 Windows 下退出时
            // 经常抛出 asyncio 相关的句柄错误 (即使识别成功并打印了 SUCCESS)，这会导致 error 不为空。

            console.log(`--- ASR Raw Stdout ---\n${stdout}`);
            console.log(`--- ASR Raw Stderr ---\n${stderr}`);
            if (error) console.log(`--- ASR Raw Error ---\n${error.message}`);

            // stdout 和 stderr 里去寻找成功的标识
            const output = (stdout || '') + '\n' + (stderr || '');

            if (output.includes("SUCCESS:")) {
                // 正则精准匹配出文字
                const match = output.match(/SUCCESS:(.*)(\r?\n|$)/);
                if (match && match[1]) {
                    console.log(`ASR found success text: ${match[1].trim()}`);
                    resolve(match[1].trim());
                } else {
                    resolve("");
                }
            } else if (output.includes("EMPTY_RESULT")) {
                resolve(""); // 前端收到 "" 后会自动提示：没有听清
            } else {
                // 如果既没成功也没返回为空，说明是真的失败了
                console.error("Python ASR failed:", output);
                reject(new Error("Python returned error: " + output));
            }
        });
    });
}

// 引入 ffmpeg 处理音频转换 (webm -> wav 16k mono)
const ffmpeg = require('fluent-ffmpeg');

// POST /api/asr -> Upload audio from mic, convert, recognize text via Python, return text
app.post('/api/asr', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const inputPath = req.file.path; // multer 保存的临时文件路径
    const tempId = uuidv4().replace(/-/g, '');
    const wavOutputPath = path.join(__dirname, `uploads/temp_audio_${tempId}.wav`);

    try {
        // 1. 使用 ffmpeg 将浏览器录制的格式 (通常是 webm 或 mp4) 转换为 PCM WAV 16000Hz 单声道 (ASR要求的格式)
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('wav')
                .audioFrequency(16000)
                .audioChannels(1)
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error('Audio conversion failed: ' + err.message)))
                .save(wavOutputPath);
        });

        // 2. 调用 Python 脚本读取并识别 .wav 文件
        const text = await recognizeSpeech(wavOutputPath);

        // 3. 返回识别的文字
        res.json({ text: text });

    } catch (error) {
        console.error('ASR processing error:', error);
        res.status(500).json({ error: 'Failed to process audio. ' + error.message });
    } finally {
        // 清理所有临时文件
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(wavOutputPath)) fs.unlinkSync(wavOutputPath);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
