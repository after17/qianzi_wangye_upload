import os
import requests
import base64
import pathlib

# ======= 常量配置 =======
DEFAULT_TARGET_MODEL = "qwen3-tts-vc-2026-01-22"
DEFAULT_PREFERRED_NAME = "my_custom_voice"
DEFAULT_AUDIO_MIME_TYPE = "audio/mpeg"


def create_voice(file_path: str,
                 target_model: str = DEFAULT_TARGET_MODEL,
                 preferred_name: str = DEFAULT_PREFERRED_NAME,
                 audio_mime_type: str = DEFAULT_AUDIO_MIME_TYPE) -> str:
    """
    创建音色，并返回 voice 参数
    """
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        api_key = "sk-b80a16a89261449ab195fa4dd8aa414a"  # 兜底获取原配置中的key

    file_path_obj = pathlib.Path(file_path)
    if not file_path_obj.exists():
        raise FileNotFoundError(f"音频文件不存在: {file_path}")

    base64_str = base64.b64encode(file_path_obj.read_bytes()).decode()
    data_uri = f"data:{audio_mime_type};base64,{base64_str}"

    url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"
    payload = {
        "model": "qwen-voice-enrollment",
        "input": {
            "action": "create",
            "target_model": target_model,
            "preferred_name": preferred_name,
            "audio": {"data": data_uri}
        }
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    print(f"正在上传并复刻声音: {file_path} ...请稍候...")
    resp = requests.post(url, json=payload, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"创建 voice 失败: {resp.status_code}, {resp.text}")

    try:
        voice_id = resp.json()["output"]["voice"]
        print("\n============= 复刻成功！ ==============")
        print(f"生成的 Voice ID: 【 {voice_id} 】")
        print("=======================================")
        print("请将上面的 Voice ID 复制，并存入你的项目或者用到 server.js 中！")
        return voice_id
    except (KeyError, ValueError) as e:
        raise RuntimeError(f"解析 voice 响应失败: {e}\n响应内容: {resp.text}")


if __name__ == '__main__':
    VOICE_FILE_PATH = "voice.mp3"

    if not os.path.exists(VOICE_FILE_PATH):
        print(f"错误: 找不到要复刻的音频文件 {VOICE_FILE_PATH}")
        print("请先准备一段你想要复刻的声音，重命名为 voice.mp3，放到与本脚本同目录下，然后重新运行。")
    else:
        create_voice(VOICE_FILE_PATH)
