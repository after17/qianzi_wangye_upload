import os
import sys
from http import HTTPStatus
import dashscope
from dashscope.audio.asr import Recognition

def recognize_qwen_asr(audio_path: str):
    """
    使用 Dashscope Recognition 接口调用 paraformer-realtime-v2 模型识别本地录音文件
    """
    # 强制让 Python 在 Windows 控制台下也使用 UTF-8 输出，防止 Node.js 获取到乱码
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding='utf-8')
        # 规避 Windows 下 asyncio 关闭 ProactorEventLoop 时抛出的 OSError: [WinError 6] 句柄无效问题
        # 这是 Python 3.9+ 在 Windows 下的已知 issue，经常在使用异步网络库时出现
        import asyncio
        if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # 强制从环境变量获取 API Key (已经在 server.js 层校验过一次，这里作为双保险)
    dashscope.api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not dashscope.api_key:
        print("FAILED: 环境变量中未配置 DASHSCOPE_API_KEY")
        sys.exit(1)

    try:
        recognition = Recognition(model='paraformer-realtime-v2',
                                  format='wav',
                                  sample_rate=16000,
                                  # “language_hints”只支持paraformer-realtime-v2模型
                                  language_hints=['zh', 'en'],
                                  callback=None)
                                  
        result = recognition.call(audio_path)
        
        if result.status_code == HTTPStatus.OK:
            sentence = result.get_sentence()
            
            # get_sentence() 返回的结果多变：字符串、单个字典、字典数组
            text_result = ""
            try:
                if isinstance(sentence, list):
                    text_result = "".join([str(item.get('text', '')) if isinstance(item, dict) else str(item) for item in sentence])
                elif isinstance(sentence, dict):
                    text_result = str(sentence.get('text', ''))
                elif isinstance(sentence, str):
                    text_result = sentence
                else:
                    text_result = str(sentence)
            except Exception as parse_e:
                print(f"FAILED: 解析识别结果失败，类型为 {type(sentence)}，错误: {str(parse_e)}")
                sys.exit(1)

            text_result = text_result.strip()
            
            if text_result:
                # 必须只打印出文本，供 Node.js 接收
                print(f"SUCCESS:{text_result}")
            else:
                # 定义一个专属标识给 Node.js，表示“识别成功了，但是里面没听清声音/没说话”
                print("EMPTY_RESULT")
        else:
            print(f"FAILED: ASR API 错误信息: {result.message}")
            sys.exit(1)
            
    except Exception as e:
         print(f"FAILED: 阿里云 ASR 调用出错: {str(e)}")
         sys.exit(1)

if __name__ == '__main__':
    # 接收 Node 传递参数：[1] 音频文件绝对路径
    if len(sys.argv) < 2:
        print("FAILED: 参数不足。用法: python qwen_asr_helper.py <audio_path>")
        sys.exit(1)

    audio_file_path = sys.argv[1]
    
    if not os.path.exists(audio_file_path):
        print(f"FAILED: 音频文件不存在: {audio_file_path}")
        sys.exit(1)
        
    recognize_qwen_asr(audio_file_path)
