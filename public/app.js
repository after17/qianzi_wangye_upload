document.addEventListener('DOMContentLoaded', () => {
    const questionsList = document.getElementById('questionsList');
    const refreshBtn = document.getElementById('refreshBtn');
    const subtitleText = document.getElementById('subtitleText');
    const typingIndicator = document.getElementById('typingIndicator');
    const avatarContainer = document.getElementById('avatarContainer');
    const audioPlayer = document.getElementById('audioPlayer');
    const idleVideo = document.getElementById('idleVideo');
    const speakingVideo = document.getElementById('speakingVideo');

    // 状态管理
    let isPlaying = false;
    let typingTimeout;
    let currentAbortController = null; // 用于中断 fetch 请求
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    // 拉取题目列表
    async function fetchQuestions() {
        questionsList.innerHTML = '<div class="loading-questions">加载题目中...</div>';
        try {
            const response = await fetch('/api/questions');
            const data = await response.json();

            if (data.questions && data.questions.length > 0) {
                renderQuestions(data.questions);
            } else {
                questionsList.innerHTML = '<div class="loading-questions">未获取到题目，请检查后端服务。</div>';
            }
        } catch (error) {
            console.error('Error fetching questions:', error);
            questionsList.innerHTML = '<div class="loading-questions">请求失败，后端服务未响应！</div>';
        }
    }

    // 渲染题目列表
    function renderQuestions(questions) {
        questionsList.innerHTML = '';
        questions.forEach((q, index) => {
            const div = document.createElement('div');
            div.className = 'question-item';
            div.textContent = `${index + 1}. ${q}`;
            div.addEventListener('click', () => handleQuestionClick(div, q));
            questionsList.appendChild(div);
        });
    }

    // 处理题目点击
    async function handleQuestionClick(element, questionStr) {
        if (isPlaying) {
            // 打断当前说话
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            stopSpeakingVideo();
            if (currentAbortController) {
                currentAbortController.abort();
            }
            clearTimeout(typingTimeout);
        }

        // 高亮选中状态
        document.querySelectorAll('.question-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');

        // UI 进入加载解析状态
        subtitleText.style.display = 'none';
        typingIndicator.style.display = 'block';
        subtitleText.textContent = '';
        isPlaying = true;

        currentAbortController = new AbortController();

        try {
            const response = await fetch('/api/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: questionStr }),
                signal: currentAbortController.signal
            });
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // 获取到音频和文本后
            playAudioAndSubtitles(data.audioBase64, data.answer);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('请求被中断');
                return;
            }
            console.error('Error answering question:', error);
            typingIndicator.style.display = 'none';
            subtitleText.style.display = 'block';
            subtitleText.textContent = `[错误]: ${error.message}`;
            isPlaying = false;
            element.classList.remove('active');
        }
    }

    // 播放音频并同步字幕
    function playAudioAndSubtitles(audioSrc, text) {
        typingIndicator.style.display = 'none';
        subtitleText.style.display = 'block';

        startSpeakingVideo();

        audioPlayer.src = audioSrc;

        // 当音频可以播放时，开始逐字展示文本
        audioPlayer.onplay = () => {
            typeTextSync(text, audioPlayer.duration);
        };

        // 通过 timeupdate 事件，提前一丝丝时间触发结束，解决视觉延迟感
        audioPlayer.ontimeupdate = () => {
            if (audioPlayer.duration && audioPlayer.currentTime >= audioPlayer.duration - 0.2) {
                // 如果还处于播放中状态，手动触发停止
                if (isPlaying) {
                    stopSpeakingVideo();
                    isPlaying = false;
                }
            }
        };

        // 音频播放结束时，停止数字人动画 (作为兜底)
        audioPlayer.onended = () => {
            if (isPlaying) {
                stopSpeakingVideo();
                isPlaying = false;
            }
        };

        // 如果音频加载出错保障机制
        audioPlayer.onerror = () => {
            console.error('Audio play error');
            stopSpeakingVideo();
            isPlaying = false;
            subtitleText.textContent = text; // 出错时直接显示全文
        };

        audioPlayer.play().catch(e => {
            console.error("Audio autoplay prevented by browser: ", e);
            // 浏览器拦截了自动播放的话，可以这里做处理
            stopSpeakingVideo();
            isPlaying = false;
            subtitleText.textContent = text;
        });
    }

    function startSpeakingVideo() {
        avatarContainer.classList.add('speaking');
        idleVideo.style.display = 'none';
        speakingVideo.style.display = 'block';
        speakingVideo.currentTime = 0; // 每次播放从头开始
        speakingVideo.play().catch(e => console.error("Speaking video play error:", e));
    }

    function stopSpeakingVideo() {
        avatarContainer.classList.remove('speaking');
        speakingVideo.pause();
        speakingVideo.style.display = 'none';
        idleVideo.style.display = 'block';
    }

    // 粗略模拟语音同步的逐字打印效果
    function typeTextSync(text, duration) {
        clearTimeout(typingTimeout);
        subtitleText.textContent = '';

        if (!duration || duration <= 0) {
            duration = Math.max(text.length * 0.1, 2); // 估算一个常理时间
        }

        // 计算每个字大约需要的时间 (毫秒)
        // 稍微提速一点，保证字能在声音结束前打完
        const timePerChar = (duration * 1000) / text.length * 0.85;

        let index = 0;
        function typeNext() {
            if (index < text.length && isPlaying) {
                subtitleText.textContent += text.charAt(index);
                index++;
                typingTimeout = setTimeout(typeNext, timePerChar);
            }
        }

        typeNext();
    }

    // 绑定换一批按钮事件
    refreshBtn.addEventListener('click', fetchQuestions);

    // ======== 麦克风录音相关逻辑 ========
    const micBtn = document.getElementById('micBtn');
    const micText = document.getElementById('micText');

    async function initAudioRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // 使用通用的格式
            const options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } :
                (MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : {});

            mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks);
                audioChunks = []; // reset
                micText.textContent = "处理中...";

                await sendAudioToASR(audioBlob);
            };
        } catch (err) {
            console.error("获取麦克风权限失败: ", err);
            alert("无法访问麦克风，请确保已授予浏览器麦克风权限！");
        }
    }

    async function sendAudioToASR(blob) {
        // UI 进入加载解析状态
        subtitleText.style.display = 'none';
        typingIndicator.style.display = 'block';
        subtitleText.textContent = '';

        // 中断之前可能还在进行的操作
        if (isPlaying) {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
            stopSpeakingVideo();
            if (currentAbortController) currentAbortController.abort();
            clearTimeout(typingTimeout);
            isPlaying = false;
        }

        const formData = new FormData();
        // 给它一个随意的文件名让 multer 识别
        formData.append('audio', blob, 'recording_file');

        try {
            const response = await fetch('/api/asr', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            const recognizedText = data.text;
            micText.textContent = "按住提问";

            if (!recognizedText || recognizedText.trim() === '') {
                typingIndicator.style.display = 'none';
                subtitleText.style.display = 'block';
                subtitleText.textContent = "（没有听清您说的话，请重试）";
                return;
            }

            // 识别成功后，自动将这段文字丢给大模型并播报
            // 复用之前的 handleQuestionClick 逻辑（但不高亮右侧题目）
            subtitleText.style.display = 'none';
            typingIndicator.style.display = 'block';
            isPlaying = true;

            currentAbortController = new AbortController();

            const aiResponse = await fetch('/api/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: recognizedText }),
                signal: currentAbortController.signal
            });

            const aiData = await aiResponse.json();
            if (aiData.error) throw new Error(aiData.error);

            playAudioAndSubtitles(aiData.audioBase64, aiData.answer);

        } catch (error) {
            console.error("ASR/AI处理出错: ", error);
            typingIndicator.style.display = 'none';
            subtitleText.style.display = 'block';
            subtitleText.textContent = `[语音识别/回答错误]: ${error.message}`;
            micText.textContent = "按住提问";
            isPlaying = false;
        }
    }

    if (micBtn) {
        // 桌面端鼠标事件
        micBtn.addEventListener('mousedown', async () => {
            if (!mediaRecorder) {
                await initAudioRecording();
                if (!mediaRecorder) return;
            }
            if (mediaRecorder.state === 'inactive') {
                audioChunks = [];
                mediaRecorder.start();
                isRecording = true;
                micBtn.classList.add('recording');
                micText.textContent = "松开发送";
            }
        });

        const stopRecording = () => {
            if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                isRecording = false;
                micBtn.classList.remove('recording');
            }
        };

        micBtn.addEventListener('mouseup', stopRecording);
        micBtn.addEventListener('mouseleave', stopRecording);
    }

    // 初始化加载
    fetchQuestions();
});
